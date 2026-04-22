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
  user: CommentUser;
}

interface CommentItem {
  id: string;
  content: string;
  createdAt: string;
  likeCount: number;
  isLikedByMe: boolean;
  user: CommentUser;
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

function Avatar({ name }: { name: string }) {
  return (
    <div className="shrink-0 w-7 h-7 border border-[#2A2A2A] bg-[#0a0c10] flex items-center justify-center">
      <span className="text-[10px] font-mono text-[#4b5563]">{name.charAt(0).toUpperCase()}</span>
    </div>
  );
}

export function CommentSection({ icebergId, currentUserId, currentUserRole, isFounder }: Props) {
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<Sort>('time');

  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 回复状态：{ commentId → draft }
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

  // 切换排序
  const changeSort = (s: Sort) => { if (s !== sort) { setSort(s); } };

  // 发顶层评论
  const submit = async () => {
    const content = draft.trim();
    if (!content || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/icebergs/${icebergId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (data.success) {
        setDraft('');
        // 重新拉取以保证排序一致
        await load(sort);
        textareaRef.current?.focus();
      } else {
        toast(data.error?.message ?? '发布失败', 'error');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // 发回复
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

  // 打开回复框
  const openReply = (id: string) => {
    setReplyingTo(prev => prev === id ? null : id);
    setReplyDraft('');
    setTimeout(() => replyRef.current?.focus(), 50);
  };

  // 点赞
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
          if (!isReply && c.id === commentId) {
            return { ...c, likeCount: c.likeCount + (liked ? 1 : -1), isLikedByMe: liked };
          }
          if (isReply && c.id === parentId) {
            return {
              ...c,
              replies: c.replies.map(r =>
                r.id === commentId
                  ? { ...r, likeCount: r.likeCount + (liked ? 1 : -1), isLikedByMe: liked }
                  : r
              ),
            };
          }
          return c;
        }));
      }
    } finally {
      setLikingId(null);
    }
  };

  // 删除
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

  const canDel = (userId: string) =>
    currentUserId === userId || canModerate(currentUserRole, isFounder);

  const handleKey = (e: React.KeyboardEvent, fn: () => void) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); fn(); }
  };

  const totalCount = comments.reduce((s, c) => s + 1 + c.replies.length, 0);

  return (
    <section className="mt-10 border-t border-[#1f2937] pt-8">
      {/* 标题栏 + 排序 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <MessageSquare size={14} strokeWidth={1.5} className="text-[#00FF41]" />
          <span className="text-xs font-mono text-[#6b7280] tracking-widest">
            COMMENTS · {loading ? '…' : totalCount}
          </span>
        </div>
        <div className="flex border border-[#2A2A2A]">
          <button
            onClick={() => changeSort('time')}
            className={`flex items-center gap-1 px-3 py-1 text-[10px] font-mono transition-colors ${
              sort === 'time' ? 'bg-[#00FF4115] text-[#00FF41]' : 'text-[#4b5563] hover:text-[#9ca3af]'
            }`}
          >
            <Clock size={10} strokeWidth={1.5} /> 时间
          </button>
          <button
            onClick={() => changeSort('hot')}
            className={`flex items-center gap-1 px-3 py-1 text-[10px] font-mono border-l border-[#2A2A2A] transition-colors ${
              sort === 'hot' ? 'bg-[#f59e0b15] text-[#f59e0b]' : 'text-[#4b5563] hover:text-[#9ca3af]'
            }`}
          >
            <Flame size={10} strokeWidth={1.5} /> 热度
          </button>
        </div>
      </div>

      {/* 顶层输入框 */}
      {currentUserId ? (
        <div className="mb-8">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => handleKey(e, submit)}
            rows={3}
            maxLength={1000}
            placeholder="写下你的想法... (Ctrl+Enter 发送)"
            className="w-full px-3 py-2.5 bg-[#0a0c10] border border-[#2A2A2A] text-sm font-mono text-[#e5e5e5]
                       placeholder-[#374151] focus:border-[#00FF41] focus:outline-none resize-none transition-colors"
          />
          <div className="flex items-center justify-between mt-2">
            <span className="text-[10px] font-mono text-[#374151]">{draft.length} / 1000</span>
            <button
              onClick={submit}
              disabled={submitting || !draft.trim()}
              className="btn-primary flex items-center gap-1.5 px-4 py-1.5 text-xs font-mono
                         bg-[#00FF4115] border border-[#00FF4140] text-[#00FF41]
                         hover:bg-[#00FF4125] transition-colors disabled:opacity-40"
            >
              <Send size={11} strokeWidth={1.5} />
              {submitting ? '发送中...' : '发送'}
            </button>
          </div>
        </div>
      ) : (
        <div className="mb-8 px-4 py-3 border border-dashed border-[#2A2A2A] text-center">
          <span className="text-xs font-mono text-[#4b5563]">
            <a href="#" className="text-[#00FF41] hover:underline"
              onClick={e => { e.preventDefault(); (window as any).__openLogin?.(); }}>
              登录
            </a>
            {' '}后参与讨论
          </span>
        </div>
      )}

      {/* 列表 */}
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
        <div className="py-8 text-center border border-dashed border-[#1f2937]">
          <p className="text-xs font-mono text-[#374151]">// 暂无评论，成为第一个</p>
        </div>
      ) : (
        <div className="space-y-6">
          {comments.map(comment => (
            <div key={comment.id}>
              {/* 顶层评论 */}
              <div className="flex gap-3 group">
                <Avatar name={comment.user.nickname ?? comment.user.username} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono text-[#9ca3af]">
                      {comment.user.nickname ?? comment.user.username}
                    </span>
                    <span className="text-[10px] font-mono text-[#374151]">{formatDate(comment.createdAt)}</span>
                  </div>
                  <p className="text-sm text-[#c9d1d9] leading-relaxed whitespace-pre-wrap break-words mb-2">
                    {comment.content}
                  </p>
                  {/* 操作栏 */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toggleLike(comment.id, false)}
                      disabled={likingId === comment.id}
                      className={`flex items-center gap-1 text-[10px] font-mono transition-colors disabled:opacity-40 ${
                        comment.isLikedByMe ? 'text-[#00FF41]' : 'text-[#374151] hover:text-[#9ca3af]'
                      }`}
                    >
                      <ThumbsUp size={11} strokeWidth={1.5} />
                      {comment.likeCount > 0 && <span>{comment.likeCount}</span>}
                    </button>
                    {currentUserId && (
                      <button
                        onClick={() => openReply(comment.id)}
                        className={`flex items-center gap-1 text-[10px] font-mono transition-colors ${
                          replyingTo === comment.id ? 'text-[#00FF41]' : 'text-[#374151] hover:text-[#9ca3af]'
                        }`}
                      >
                        <CornerDownRight size={11} strokeWidth={1.5} /> 回复
                      </button>
                    )}
                    {canDel(comment.user.id) && (
                      <button
                        onClick={() => remove(comment.id, false)}
                        disabled={deletingId === comment.id}
                        className="btn-danger opacity-0 group-hover:opacity-100 flex items-center gap-0.5 text-[10px] font-mono
                                   text-[#ef4444] transition-all disabled:opacity-40"
                      >
                        <Trash2 size={10} strokeWidth={1.5} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* 回复输入框 */}
              {replyingTo === comment.id && currentUserId && (
                <div className="ml-10 mt-3 pl-3 border-l-2 border-[#2A2A2A]">
                  <textarea
                    ref={replyRef}
                    value={replyDraft}
                    onChange={e => setReplyDraft(e.target.value)}
                    onKeyDown={e => handleKey(e, () => submitReply(comment.id))}
                    rows={2}
                    maxLength={500}
                    placeholder={`回复 @${comment.user.nickname ?? comment.user.username}... (Ctrl+Enter)`}
                    className="w-full px-3 py-2 bg-[#0a0c10] border border-[#2A2A2A] text-xs font-mono text-[#e5e5e5]
                               placeholder-[#374151] focus:border-[#00FF41] focus:outline-none resize-none transition-colors"
                  />
                  <div className="flex justify-end gap-2 mt-1.5">
                    <button
                      onClick={() => { setReplyingTo(null); setReplyDraft(''); }}
                      className="px-3 py-1 text-[10px] font-mono text-[#4b5563] hover:text-[#9ca3af] transition-colors"
                    >
                      取消
                    </button>
                    <button
                      onClick={() => submitReply(comment.id)}
                      disabled={replySubmitting || !replyDraft.trim()}
                      className="btn-primary flex items-center gap-1 px-3 py-1 text-[10px] font-mono
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
                <div className="ml-10 mt-3 space-y-3 pl-3 border-l-2 border-[#1f2937]">
                  {comment.replies.map(reply => (
                    <div key={reply.id} className="flex gap-2.5 group">
                      <Avatar name={reply.user.nickname ?? reply.user.username} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-mono text-[#9ca3af]">
                            {reply.user.nickname ?? reply.user.username}
                          </span>
                          <span className="text-[10px] font-mono text-[#374151]">{formatDate(reply.createdAt)}</span>
                        </div>
                        <p className="text-sm text-[#c9d1d9] leading-relaxed whitespace-pre-wrap break-words mb-1.5">
                          {reply.content}
                        </p>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => toggleLike(reply.id, true, comment.id)}
                            disabled={likingId === reply.id}
                            className={`flex items-center gap-1 text-[10px] font-mono transition-colors disabled:opacity-40 ${
                              reply.isLikedByMe ? 'text-[#00FF41]' : 'text-[#374151] hover:text-[#9ca3af]'
                            }`}
                          >
                            <ThumbsUp size={10} strokeWidth={1.5} />
                            {reply.likeCount > 0 && <span>{reply.likeCount}</span>}
                          </button>
                          {canDel(reply.user.id) && (
                            <button
                              onClick={() => remove(reply.id, true, comment.id)}
                              disabled={deletingId === reply.id}
                              className="btn-danger opacity-0 group-hover:opacity-100 flex items-center gap-0.5 text-[10px] font-mono
                                         text-[#ef4444] transition-all disabled:opacity-40"
                            >
                              <Trash2 size={10} strokeWidth={1.5} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
