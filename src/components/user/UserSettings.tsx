import { useState } from 'react';
import { toast } from '../ui/Toast';

interface Props {
  userId: string;
  initial: {
    nickname: string | null;
    bio: string | null;
    avatar: string | null;
    privacyShowStats: boolean;
    privacyShowWatchlist: boolean;
  };
}

export function UserSettings({ userId, initial }: Props) {
  const [nickname, setNickname] = useState(initial.nickname ?? '');
  const [bio, setBio] = useState(initial.bio ?? '');
  const [avatar, setAvatar] = useState(initial.avatar ?? '');
  const [showStats, setShowStats] = useState(initial.privacyShowStats);
  const [showWatchlist, setShowWatchlist] = useState(initial.privacyShowWatchlist);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nickname: nickname.trim() || null,
          bio: bio.trim() || null,
          avatar: avatar.trim() || null,
          privacyShowStats: showStats,
          privacyShowWatchlist: showWatchlist,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast('设置已保存');
      } else {
        toast(data.error?.message || '保存失败', 'error');
      }
    } catch {
      toast('保存失败，请重试', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8 max-w-lg">
      {/* 基本资料 */}
      <section>
        <div className="text-xs font-mono text-[#374151] mb-4 tracking-widest uppercase">
          // 基本资料
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-mono text-[#6b7280] mb-1.5">
              昵称 <span className="text-[#374151]">NICKNAME</span>
            </label>
            <input
              type="text"
              value={nickname}
              onChange={e => setNickname(e.target.value)}
              maxLength={50}
              placeholder="留空则使用用户名"
              className="w-full bg-[#0a0c10] border border-[#1f2937] focus:border-[#00FF41] px-3 py-2 text-sm font-mono text-[#e5e5e5] outline-none transition-colors placeholder:text-[#374151]"
            />
          </div>

          <div>
            <label className="block text-xs font-mono text-[#6b7280] mb-1.5">
              个人简介 <span className="text-[#374151]">BIO</span>
            </label>
            <textarea
              value={bio}
              onChange={e => setBio(e.target.value)}
              maxLength={200}
              rows={3}
              placeholder="一句话介绍自己（200字以内）"
              className="w-full bg-[#0a0c10] border border-[#1f2937] focus:border-[#00FF41] px-3 py-2 text-sm font-mono text-[#e5e5e5] outline-none transition-colors resize-none placeholder:text-[#374151]"
            />
            <div className="text-right text-[10px] font-mono text-[#374151] mt-1">
              {bio.length} / 200
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono text-[#6b7280] mb-1.5">
              头像 URL <span className="text-[#374151]">AVATAR</span>
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                value={avatar}
                onChange={e => setAvatar(e.target.value)}
                placeholder="https://..."
                className="flex-1 bg-[#0a0c10] border border-[#1f2937] focus:border-[#00FF41] px-3 py-2 text-sm font-mono text-[#e5e5e5] outline-none transition-colors placeholder:text-[#374151]"
              />
              {avatar && (
                <img
                  src={avatar}
                  alt="preview"
                  className="w-10 h-10 object-cover border border-[#1f2937] flex-shrink-0"
                  onError={e => (e.currentTarget.style.display = 'none')}
                />
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 隐私设置 */}
      <section>
        <div className="text-xs font-mono text-[#374151] mb-4 tracking-widest uppercase">
          // 隐私设置
        </div>
        <div className="space-y-3">
          {[
            {
              key: 'stats',
              label: '公开统计数据',
              sub: '创建数量、质量分对外可见',
              value: showStats,
              onChange: setShowStats,
            },
            {
              key: 'watchlist',
              label: '公开收藏夹',
              sub: '其他用户可查看你收藏的冰山图',
              value: showWatchlist,
              onChange: setShowWatchlist,
            },
          ].map(item => (
            <label
              key={item.key}
              className="flex items-center justify-between p-3 border border-[#1f2937] hover:border-[#2A2A2A] cursor-pointer group"
            >
              <div>
                <div className="text-sm font-mono text-[#9ca3af] group-hover:text-[#e5e5e5] transition-colors">
                  {item.label}
                </div>
                <div className="text-xs font-mono text-[#374151] mt-0.5">{item.sub}</div>
              </div>
              <div
                onClick={() => item.onChange(!item.value)}
                className={`relative w-10 h-5 transition-colors flex-shrink-0 ${item.value ? 'bg-[#00FF41]/20 border-[#00FF41]' : 'bg-[#111] border-[#374151]'} border`}
              >
                <div
                  className={`absolute top-0.5 w-3.5 h-3.5 transition-all ${item.value ? 'left-[calc(100%-18px)] bg-[#00FF41]' : 'left-0.5 bg-[#374151]'}`}
                />
              </div>
            </label>
          ))}
        </div>
      </section>

      {/* 保存按钮 */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="px-6 py-2 bg-[#00FF41] text-[#0A0A0A] font-mono font-semibold text-sm hover:bg-[#00CC33] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {saving ? 'SAVING...' : '保存设置'}
      </button>
    </div>
  );
}
