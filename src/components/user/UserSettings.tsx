import { useEffect, useRef, useState } from 'react';
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
  const [saving, setSaving]     = useState(false);
  const [uploading, setUploading] = useState(false);
  const [providerLoading, setProviderLoading] = useState(true);
  const [linkedProviders, setLinkedProviders] = useState<{ github: boolean; google: boolean }>({
    github: false,
    google: false,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/providers');
        const data = await res.json();
        if (!cancelled && data.success) {
          setLinkedProviders(data.data.linkedProviders);
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setProviderLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // reset so the same file can be re-selected if needed
    e.target.value = '';

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res  = await fetch(`/api/users/${userId}/avatar`, { method: 'POST', body: fd });
      const data = await res.json();
      if (data.success) {
        setAvatar(data.data.url);
        toast('头像已上传');
      } else {
        toast(data.error?.message ?? '上传失败', 'error');
      }
    } catch {
      toast('上传失败，请重试', 'error');
    } finally {
      setUploading(false);
    }
  };

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
        <div className="text-xs font-mono text-[#6e7681] mb-4 tracking-widest uppercase">
          // 基本资料
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-mono text-[#8b949e] mb-1.5">
              昵称 <span className="text-[#6e7681]">NICKNAME</span>
            </label>
            <input
              type="text"
              value={nickname}
              onChange={e => setNickname(e.target.value)}
              maxLength={50}
              placeholder="留空则使用用户名"
              className="w-full bg-[#161b22] border border-[#21262d] focus:border-[#00FF41] px-3 py-2 text-sm font-mono text-[#cdd9e5] outline-none transition-colors placeholder:text-[#6e7681]"
            />
          </div>

          <div>
            <label className="block text-xs font-mono text-[#8b949e] mb-1.5">
              个人简介 <span className="text-[#6e7681]">BIO</span>
            </label>
            <textarea
              value={bio}
              onChange={e => setBio(e.target.value)}
              maxLength={200}
              rows={3}
              placeholder="一句话介绍自己（200字以内）"
              className="w-full bg-[#161b22] border border-[#21262d] focus:border-[#00FF41] px-3 py-2 text-sm font-mono text-[#cdd9e5] outline-none transition-colors resize-none placeholder:text-[#6e7681]"
            />
            <div className="text-right text-[10px] font-mono text-[#6e7681] mt-1">
              {bio.length} / 200
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono text-[#8b949e] mb-1.5">
              头像 <span className="text-[#6e7681]">AVATAR</span>
            </label>
            {/* 隐藏的文件输入 */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              className="hidden"
              onChange={handleFileUpload}
            />
            <div className="flex gap-2 items-center">
              {/* 预览 */}
              {avatar ? (
                <img
                  src={avatar}
                  alt="preview"
                  className="w-10 h-10 object-cover border border-[#21262d] flex-shrink-0"
                  onError={e => (e.currentTarget.style.display = 'none')}
                />
              ) : (
                <div className="w-10 h-10 border border-[#21262d] flex-shrink-0 flex items-center justify-center bg-[#0d1117]">
                  <span className="text-[#3d444d] font-mono text-xs">?</span>
                </div>
              )}
              <div className="flex-1 flex flex-col gap-1.5">
                {/* URL 输入 */}
                <input
                  type="url"
                  value={avatar}
                  onChange={e => setAvatar(e.target.value)}
                  placeholder="https://... 或点击右侧上传本地图片"
                  className="w-full bg-[#161b22] border border-[#21262d] focus:border-[#00FF41] px-3 py-2 text-sm font-mono text-[#cdd9e5] outline-none transition-colors placeholder:text-[#6e7681]"
                />
                {/* 上传按钮 */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="self-start px-3 py-1 text-xs font-mono border border-[#30363d] text-[#8b949e] hover:border-[#00FF41] hover:text-[#00FF41] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploading ? '上传中...' : '↑ 上传本地图片'}
                </button>
                <div className="text-[10px] font-mono text-[#3d444d]">支持 JPG / PNG / GIF / WebP，最大 2 MB</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 账号绑定 */}
      <section>
        <div className="text-xs font-mono text-[#6e7681] mb-4 tracking-widest uppercase">
          // 账号绑定
        </div>
        <div className="space-y-3">
          {[
            { key: 'github', label: 'GitHub', href: '/api/auth/login?provider=github&intent=link' },
            { key: 'google', label: 'Google', href: '/api/auth/login?provider=google&intent=link' },
          ].map((provider) => {
            const linked = linkedProviders[provider.key as 'github' | 'google'];
            return (
              <div
                key={provider.key}
                className="p-3 border border-[#21262d] bg-[#161b22] flex items-center justify-between gap-3"
              >
                <div>
                  <div className="text-sm font-mono text-[#cdd9e5]">{provider.label}</div>
                  <div className="text-xs font-mono text-[#6e7681] mt-1">
                    {linked ? '已绑定，可直接第三方登录' : '未绑定'}
                  </div>
                </div>
                {providerLoading ? (
                  <span className="text-xs font-mono text-[#6e7681]">加载中...</span>
                ) : linked ? (
                  <span className="text-xs font-mono px-2.5 py-1 border border-[#00FF4140] text-[#00FF41] bg-[#00FF4110]">
                    已绑定
                  </span>
                ) : (
                  <a
                    href={provider.href}
                    className="px-3 py-1.5 text-xs font-mono border border-[#30363d] text-[#8b949e] hover:border-[#00FF41] hover:text-[#00FF41] transition-colors"
                  >
                    绑定
                  </a>
                )}
              </div>
            );
          })}
        </div>
        <div className="text-[10px] font-mono text-[#3d444d] mt-2">
          绑定后不会影响原有邮箱密码登录方式。
        </div>
      </section>

      {/* 隐私设置 */}
      <section>
        <div className="text-xs font-mono text-[#6e7681] mb-4 tracking-widest uppercase">
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
              className="flex items-center justify-between p-3 border border-[#21262d] hover:border-[#30363d] cursor-pointer group"
            >
              <div>
                <div className="text-sm font-mono text-[#8b949e] group-hover:text-[#cdd9e5] transition-colors">
                  {item.label}
                </div>
                <div className="text-xs font-mono text-[#6e7681] mt-0.5">{item.sub}</div>
              </div>
              <div
                onClick={() => item.onChange(!item.value)}
                className={`relative w-10 h-5 transition-colors flex-shrink-0 ${item.value ? 'bg-[#00FF41]/20 border-[#00FF41]' : 'bg-[#111] border-[#30363d]'} border`}
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
