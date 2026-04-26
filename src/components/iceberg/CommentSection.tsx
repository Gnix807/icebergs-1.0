import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from '../ui/Toast';
import { MessageSquare, Trash2, Send, ThumbsUp, CornerDownRight, Clock, Flame } from 'lucide-react';

interface CommentUser {
  id: string;
  username: string;
  nickname: string | null;
}

interface ReplyItem {
  id: string;
  content: string;
  createdAt: string;
  likeCount: number;
  isLikedByMe: boolean;
  user: CommentUser | null;
  guestName: string | null;
}

interface CommentItem extends ReplyItem {
  replies: ReplyItem[];
}

interface Props {
  icebergId: string;
  currentUserId: string | null;
  currentUserRole: string | null;
  isFounder: boolean;
}

type Sort = 'time' | 'hot';

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const ROLE_RANK: Record<string, number> = { USER: 0, CONTRIBUTOR: 1, EDITOR: 2, ADMIN: 3 };
function canModerate(role: string | null, isFounder: boolean) {
  if (isFounder) return true;
  return (ROLE_RANK[role ?? ''] ?? -1) >= ROLE_RANK['EDITOR'];
}

function getDisplayName(c: ReplyItem): string {
  if (c.user) return c.user.nickname ?? c.user.username;
  return c.guestName ?? '匿名游客';
}

function Avatar({ name, isGuest }: { name: string; isGuest: boolean }) {
  return (
    <div className={`shrink-0 w-7 h-7 border flex items-center justify-center ${
      isGuest ? 'border-[#3d444d] bg-[#0d1117]' : 'border-[#30363d] bg-[#161b22]'
    }`}>
      <span className={`text-[10px] font-mono ${isGuest ? 'text-[#6e7681]' : 'text-[#3d444d]'}`}>
        {isGuest ? '游' : name.charAt(0).toUpperCase()}
      </span>
    </div>
  );
}

export function CommentSection({ icebergId, currentUserId, currentUserRole, isFounder }: Props) {
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<Sort>('time');

  const [draft, setDraft] = useState('');
  const [guestName, setGuestName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [replySubmitting, setReplySubmitting] = useState(false);
  const replyRef = useRef<HTMLTextAreaElement>(null);

  const [likingId, setLikingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async (s: Sort) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/icebergs/${icebergId}/comments?sort=${s}`);
      const data = await res.json();
      if (data.success) setComments(data.data.comments);
    } finally {
      setLoading(false);
    }
  }, [icebergId]);

  useEffect(() => { load(sort); }, [load, sort]);

  const changeSort = (s: Sort) => { if (s !== sort) setSort(s); };

  // 发顶层评论
  const submit = async () => {
    const content = draft.trim();
    if (!content || submitting) return;

    if (!currentUserId) {
      const name = guestName.trim();
      if (name.length < 2) { toast('游客昵称至少 2 个字符', 'error'); return; }
      if (name.length > 20) { toast('游客昵称不能超过 20 个字符', 'error'); return; }
    }

    setSubmitting(true);
    try {
      const body: Record<string, string> = { content };
      if (!currentUserId) body.guestName = guestName.trim();

      const res = await fetch(`/api/icebergs/${icebergId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        setDraft('');
        await load(sort);
        textareaRef.current?.focus();
      } else {
        toast(data.error?.message ?? '发布失败', 'error');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // 发回复（仅登录用户）
  const submitReply = async (parentId: string) => {
    const content = replyDraft.trim();
    if (!content || replySubmitting) return;
    setReplySubmitting(true);
    try {
      const res = await fetch(`/api/icebergs/${icebergId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, parentId }),
      });
      const data = await res.json();
      if (data.success) {
        setReplyDraft('');
        setReplyingTo(null);
        await load(sort);
      } else {
        toast(data.error?.message ?? '回复失败', 'error');
      }
    } finally {
      setReplySubmitting(false);
    }
  };

  const openReply = (id: string) => {
    setReplyingTo(prev => prev === id ? null : id);
    setReplyDraft('');
    setTimeout(() => replyRef.current?.focus(), 50);
  };

  const toggleLike = async (commentId: string, isReply: boolean, parentId?: string) => {
    if (!currentUserId) { (window as any).__openLogin?.(); return; }
    if (likingId) return;
    setLikingId(commentId);
    try {
      const res = await fetch(`/api/comments/${commentId}/like`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        const liked: boolean = data.data.liked;
        setComments(prev => prev.map(c => {
          if (!isReply && c.id === commentId)
            return { ...c, likeCount: c.likeCount + (liked ? 1 : -1), isLikedByMe: liked };
          if (isReply && c.id === parentId)
            return { ...c, replies: c.replies.map(r =>
              r.id === commentId
                ? { ...r, likeCount: r.likeCount + (liked ? 1 : -1), isLikedByMe: liked }
                : r
            )};
          return c;
        }));
      }
    } finally {
      setLikingId(null);
    }
  };

  const remove = async (commentId: string, isReply: boolean, parentId?: string) => {
    if (deletingId) return;
    setDeletingId(commentId);
    try {
      const res = await fetch(`/api/comments/${commentId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setComments(prev => {
          if (!isReply) return prev.filter(c => c.id !== commentId);
          return prev.map(c =>
            c.id === parentId
              ? { ...c, replies: c.replies.filter(r => r.id !== commentId) }
              : c
          );
        });
      } else {
        toast(data.error?.message ?? '删除失败', 'error');
      }
    } finally {
      setDeletingId(null);
    }
  };

  // 游客评论只有管理员/作者可删；注册用户可删自己的
  const canDel = (c: ReplyItem) =>
    (c.user && currentUserId === c.user.id) || canModerate(currentUserRole, isFounder);

  const handleKey = (e: React.KeyboardEvent, fn: () => void) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); fn(); }
  };

  const totalCount = comments.reduce((s, c) => s + 1 + c.replies.length, 0);

  return (
    <section className="mt-10 border-t border-[#21262d] pt-8">
      {/* 标题栏 + 排序 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <MessageSquare size={14} strokeWidth={1.5} className="text-[#00FF41]" />
          <span className="text-xs font-mono text-[#8b949e] tracking-widest">
            COMMENTS · {loading ? '…' : totalCount}
          </span>
        </div>
        <div className="flex border border-[#30363d]">
          <button
            onClick={() => changeSort('time')}
            className={`flex items-center gap-1 px-3 py-1 text-[10px] font-mono transition-colors ${
              sort === 'time' ? 'bg-[#00FF4115] text-[#00FF41]' : 'text-[#3d444d] hover:text-[#8b949e]'
            }`}
          >
            <Clock size={10} strokeWidth={1.5} /> 时间
          </button>
          <button
            onClick={() => changeSort('hot')}
            className={`flex items-center gap-1 px-3 py-1 text-[10px] font-mono border-l border-[#30363d] transition-colors ${
              sort === 'hot' ? 'bg-[#f59e0b15] text-[#f59e0b]' : 'text-[#3d444d] hover:text-[#8b949e]'
            }`}
          >
            <Flame size={10} strokeWidth={1.5} /> 热度
          </button>
        </div>
      </div>

      {/* 输入框：登录用户 / 游客 */}
      <div className="mb-8">
        {!currentUserId && (
          <input
            type="text"
            value={guestName}
            onChange={e => setGuestName(e.target.value)}
            maxLength={20}
            placeholder="游客昵称（2–20 字符）"
            className="w-full mb-2 px-3 py-2 bg-[#161b22] border border-[#30363d] text-sm font-mono
                       text-[#cdd9e5] placeholder-[#3d444d] focus:border-[#00FF41] focus:outline-none transition-colors"
          />
        )}
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => handleKey(e, submit)}
          rows={3}
          maxLength={1000}
          placeholder="写下你的想法... (Ctrl+Enter 发送)"
          className="w-full px-3 py-2.5 bg-[#161b22] border border-[#30363d] text-sm font-mono text-[#cdd9e5]
                     placeholder-[#3d444d] focus:border-[#00FF41] focus:outline-none resize-none transition-colors"
        />
        <div className="flex items-center justify-between mt-2">
          {!currentUserId ? (
            <span className="text-[10px] font-mono text-[#6e7681]">
              游客评论 ·{' '}
              <a href="#" className="text-[#00FF41] hover:underline"
                onClick={e => { e.preventDefault(); (window as any).__openLogin?.(); }}>
                登录
              </a>
              {' '}后可回复 / 点赞
            </span>
          ) : (
            <span className="text-[10px] font-mono text-[#6e7681]">{draft.length} / 1000</span>
          )}
          <button
            onClick={submit}
            disabled={submitting || !draft.trim()}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-mono
                       bg-[#00FF4115] border border-[#00FF4140] text-[#00FF41]
                       hover:bg-[#00FF4125] transition-colors disabled:opacity-40"
          >
            <Send size={11} strokeWidth={1.5} />
            {submitting ? '发送中...' : '发送'}
          </button>
        </div>
      </div>

      {/* 评论列表 */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex gap-3">
              <div className="shrink-0 w-7 h-7 bg-[#1a1d24] animate-pulse" style={{ animationDelay: `${i * 80}ms` }} />
              <div className="flex-1 space-y-2">
                <div className="h-2.5 bg-[#1a1d24] rounded-sm animate-pulse w-1/4" style={{ animationDelay: `${i * 80 + 30}ms` }} />
                <div className="h-3 bg-[#1a1d24] rounded-sm animate-pulse w-3/4" style={{ animationDelay: `${i * 80 + 50}ms` }} />
              </div>
            </div>
          ))}
        </div>
      ) : comments.length === 0 ? (
        <div className="py-8 text-center border border-dashed border-[#21262d]">
          <p className="text-xs font-mono text-[#6e7681]">// 暂无评论，成为第一个</p>
        </div>
      ) : (
        <div className="space-y-6">
          {comments.map(comment => {
            const isGuestComment = !comment.user;
            const displayName = getDisplayName(comment);
            return (
              <div key={comment.id}>
                {/* 顶层评论 */}
                <div className="flex gap-3 group">
                  <Avatar name={displayName} isGuest={isGuestComment} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-mono ${isGuestComment ? 'text-[#6e7681]' : 'text-[#8b949e]'}`}>
                        {displayName}
                      </span>
                      {isGuestComment && (
                        <span className="text-[9px] font-mono text-[#3d444d] border border-[#21262d] px-1">游客</span>
                      )}
                      <span className="text-[10px] font-mono text-[#6e7681]">{formatDate(comment.createdAt)}</span>
                    </div>
                    <p className="text-sm text-[#c9d1d9] leading-relaxed whitespace-pre-wrap break-words mb-2">
                      {comment.content}
                    </p>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => toggleLike(comment.id, false)}
                        disabled={likingId === comment.id}
                        className={`flex items-center gap-1 text-[10px] font-mono transition-colors disabled:opacity-40 ${
                          comment.isLikedByMe ? 'text-[#00FF41]' : 'text-[#6e7681] hover:text-[#8b949e]'
                        }`}
                      >
                        <ThumbsUp size={11} strokeWidth={1.5} />
                        {comment.likeCount > 0 && <span>{comment.likeCount}</span>}
                      </button>
                      {currentUserId && (
                        <button
                          onClick={() => openReply(comment.id)}
                          className={`flex items-center gap-1 text-[10px] font-mono transition-colors ${
                            replyingTo === comment.id ? 'text-[#00FF41]' : 'text-[#6e7681] hover:text-[#8b949e]'
                          }`}
                        >
                          <CornerDownRight size={11} strokeWidth={1.5} /> 回复
                        </button>
                      )}
                      {canDel(comment) && (
                        <button
                          onClick={() => remove(comment.id, false)}
                          disabled={deletingId === comment.id}
                          className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 text-[10px] font-mono
                                     text-[#ef4444] transition-all disabled:opacity-40"
                        >
                          <Trash2 size={10} strokeWidth={1.5} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* 回复输入框（仅登录用户） */}
                {replyingTo === comment.id && currentUserId && (
                  <div className="ml-10 mt-3 pl-3 border-l-2 border-[#30363d]">
                    <textarea
                      ref={replyRef}
                      value={replyDraft}
                      onChange={e => setReplyDraft(e.target.value)}
                      onKeyDown={e => handleKey(e, () => submitReply(comment.id))}
                      rows={2}
                      maxLength={500}
                      placeholder={`回复 @${displayName}... (Ctrl+Enter)`}
                      className="w-full px-3 py-2 bg-[#161b22] border border-[#30363d] text-xs font-mono text-[#cdd9e5]
                                 placeholder-[#3d444d] focus:border-[#00FF41] focus:outline-none resize-none transition-colors"
                    />
                    <div className="flex justify-end gap-2 mt-1.5">
                      <button
                        onClick={() => { setReplyingTo(null); setReplyDraft(''); }}
                        className="px-3 py-1 text-[10px] font-mono text-[#3d444d] hover:text-[#8b949e] transition-colors"
                      >
                        取消
                      </button>
                      <button
                        onClick={() => submitReply(comment.id)}
                        disabled={replySubmitting || !replyDraft.trim()}
                        className="flex items-center gap-1 px-3 py-1 text-[10px] font-mono
                                   bg-[#00FF4115] border border-[#00FF4140] text-[#00FF41]
                                   hover:bg-[#00FF4125] transition-colors disabled:opacity-40"
                      >
                        <Send size={9} strokeWidth={1.5} />
                        {replySubmitting ? '发送...' : '发送'}
                      </button>
                    </div>
                  </div>
                )}

                {/* 楼中楼回复 */}
                {comment.replies.length > 0 && (
                  <div className="ml-10 mt-3 space-y-3 pl-3 border-l-2 border-[#21262d]">
                    {comment.replies.map(reply => {
                      const isGuestReply = !reply.user;
                      const replyName = getDisplayName(reply);
                      return (
                        <div key={reply.id} className="flex gap-2.5 group">
                          <Avatar name={replyName} isGuest={isGuestReply} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className={`text-xs font-mono ${isGuestReply ? 'text-[#6e7681]' : 'text-[#8b949e]'}`}>
                                {replyName}
                              </span>
                              {isGuestReply && (
                                <span className="text-[9px] font-mono text-[#3d444d] border border-[#21262d] px-1">游客</span>
                              )}
                              <span className="text-[10px] font-mono text-[#6e7681]">{formatDate(reply.createdAt)}</span>
                            </div>
                            <p className="text-sm text-[#c9d1d9] leading-relaxed whitespace-pre-wrap break-words mb-1.5">
                              {reply.content}
                            </p>
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => toggleLike(reply.id, true, comment.id)}
                                disabled={likingId === reply.id}
                                className={`flex items-center gap-1 text-[10px] font-mono transition-colors disabled:opacity-40 ${
                                  reply.isLikedByMe ? 'text-[#00FF41]' : 'text-[#6e7681] hover:text-[#8b949e]'
                                }`}
                              >
                                <ThumbsUp size={10} strokeWidth={1.5} />
                                {reply.likeCount > 0 && <span>{reply.likeCount}</span>}
                              </button>
                              {canDel(reply) && (
                                <button
                                  onClick={() => remove(reply.id, true, comment.id)}
                                  disabled={deletingId === reply.id}
                                  className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 text-[10px] font-mono
                                             text-[#ef4444] transition-all disabled:opacity-40"
                                >
                                  <Trash2 size={10} strokeWidth={1.5} />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
