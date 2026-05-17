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

interface AuthSession {
  id: string;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

export function UserSettings({ userId, initial }: Props) {
  const [nickname, setNickname] = useState(initial.nickname ?? '');
  const [bio, setBio] = useState(initial.bio ?? '');
  const [avatar, setAvatar] = useState(initial.avatar ?? '');
  const [showStats, setShowStats] = useState(initial.privacyShowStats);
  const [showWatchlist, setShowWatchlist] = useState(initial.privacyShowWatchlist);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [securityLoading, setSecurityLoading] = useState(true);
  const [hasPassword, setHasPassword] = useState(false);
  const [linkedProviders, setLinkedProviders] = useState<{ github: boolean; google: boolean }>({
    github: false,
    google: false,
  });
  const [unlinkingProvider, setUnlinkingProvider] = useState<'github' | 'google' | null>(null);
  const [sessions, setSessions] = useState<AuthSession[]>([]);
  const [sessionBusy, setSessionBusy] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const linkedCount = Number(linkedProviders.github) + Number(linkedProviders.google);

  const loadSecurity = async () => {
    try {
      const res = await fetch('/api/auth/sessions');
      const data = await res.json();
      if (data.success) {
        setSessions(data.data.sessions || []);
        setHasPassword(Boolean(data.data.authMethods?.email));
        setLinkedProviders({
          github: Boolean(data.data.authMethods?.github),
          google: Boolean(data.data.authMethods?.google),
        });
      }
    } catch {
      // ignore
    } finally {
      setSecurityLoading(false);
    }
  };

  useEffect(() => {
    loadSecurity();
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

  const handleChangePassword = async () => {
    if (!newPassword) {
      toast('新密码不能为空', 'error');
      return;
    }
    if (newPassword.length < 6) {
      toast('新密码至少 6 位', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast('两次输入的新密码不一致', 'error');
      return;
    }
    if (hasPassword && !oldPassword) {
      toast('请输入当前密码', 'error');
      return;
    }

    setChangingPassword(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          oldPassword: oldPassword || undefined,
          newPassword,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setHasPassword(true);
        toast(data.data?.message || '密码已更新');
        await loadSecurity();
      } else {
        toast(data.error?.message || '修改密码失败', 'error');
      }
    } catch {
      toast('修改密码失败，请重试', 'error');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleUnlinkProvider = async (provider: 'github' | 'google') => {
    setUnlinkingProvider(provider);
    try {
      const res = await fetch('/api/auth/unlink-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      const data = await res.json();
      if (data.success) {
        setHasPassword(Boolean(data.data.authMethods?.email));
        setLinkedProviders({
          github: Boolean(data.data.authMethods?.github),
          google: Boolean(data.data.authMethods?.google),
        });
        toast(`${provider === 'github' ? 'GitHub' : 'Google'} 已解绑`);
        await loadSecurity();
      } else {
        toast(data.error?.message || '解绑失败', 'error');
      }
    } catch {
      toast('解绑失败，请重试', 'error');
    } finally {
      setUnlinkingProvider(null);
    }
  };

  const handleLogoutOthers = async () => {
    setSessionBusy(true);
    try {
      const res = await fetch('/api/auth/sessions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'others' }),
      });
      const data = await res.json();
      if (data.success) {
        toast(`已下线 ${data.data?.deleted ?? 0} 个其他设备会话`);
        await loadSecurity();
      } else {
        toast(data.error?.message || '操作失败', 'error');
      }
    } catch {
      toast('操作失败，请重试', 'error');
    } finally {
      setSessionBusy(false);
    }
  };

  const handleLogoutSession = async (sessionId: string) => {
    setSessionBusy(true);
    try {
      const res = await fetch('/api/auth/sessions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'single', sessionId }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.data?.currentDeleted) {
          window.location.href = '/login';
          return;
        }
        toast('会话已下线');
        await loadSecurity();
      } else {
        toast(data.error?.message || '操作失败', 'error');
      }
    } catch {
      toast('操作失败，请重试', 'error');
    } finally {
      setSessionBusy(false);
    }
  };

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleString('zh-CN');
    } catch {
      return iso;
    }
  };

  return (
    <div className="space-y-8 max-w-2xl">
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
                {securityLoading ? (
                  <span className="text-xs font-mono text-[#6e7681]">加载中...</span>
                ) : linked ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono px-2.5 py-1 border border-[#00FF4140] text-[#00FF41] bg-[#00FF4110]">
                      已绑定
                    </span>
                    <button
                      type="button"
                      onClick={() => handleUnlinkProvider(provider.key as 'github' | 'google')}
                      disabled={unlinkingProvider === provider.key}
                      className="px-3 py-1.5 text-xs font-mono border border-[#ef444440] text-[#ef4444] hover:bg-[#ef444410] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {unlinkingProvider === provider.key ? '解绑中...' : '解绑'}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      window.location.assign(provider.href);
                    }}
                    className="px-3 py-1.5 text-xs font-mono border border-[#30363d] text-[#8b949e] hover:border-[#00FF41] hover:text-[#00FF41] transition-colors"
                  >
                    绑定
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <div className="text-[10px] font-mono text-[#3d444d] mt-2">
          绑定后不会影响原有邮箱密码登录方式。
        </div>
        {!hasPassword && linkedCount <= 1 && (
          <div className="text-[10px] font-mono text-[#ef4444] mt-2">
            当前只剩一种登录方式，无法解绑最后一个第三方账号。建议先设置邮箱密码。
          </div>
        )}
      </section>

      {/* 账号安全 */}
      <section>
        <div className="text-xs font-mono text-[#6e7681] mb-4 tracking-widest uppercase">
          // 账号安全
        </div>
        <div className="space-y-4">
          <div className="p-4 border border-[#21262d] bg-[#161b22] space-y-3">
            <div className="text-sm font-mono text-[#cdd9e5]">登录密码</div>
            {!hasPassword && (
              <div className="text-[11px] font-mono text-[#6e7681]">
                当前账号仅支持第三方登录。设置密码后可直接邮箱登录。
              </div>
            )}
            {hasPassword && (
              <input
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder="当前密码"
                className="w-full bg-[#0d1117] border border-[#21262d] focus:border-[#00FF41] px-3 py-2 text-sm font-mono text-[#cdd9e5] outline-none transition-colors placeholder:text-[#6e7681]"
              />
            )}
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={hasPassword ? '新密码（至少 6 位）' : '设置登录密码（至少 6 位）'}
              className="w-full bg-[#0d1117] border border-[#21262d] focus:border-[#00FF41] px-3 py-2 text-sm font-mono text-[#cdd9e5] outline-none transition-colors placeholder:text-[#6e7681]"
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="确认新密码"
              className="w-full bg-[#0d1117] border border-[#21262d] focus:border-[#00FF41] px-3 py-2 text-sm font-mono text-[#cdd9e5] outline-none transition-colors placeholder:text-[#6e7681]"
            />
            <button
              type="button"
              onClick={handleChangePassword}
              disabled={changingPassword}
              className="px-4 py-2 text-xs font-mono border border-[#00FF4140] text-[#00FF41] hover:bg-[#00FF4110] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {changingPassword ? '提交中...' : hasPassword ? '修改密码' : '设置密码'}
            </button>
          </div>

          <div className="p-4 border border-[#21262d] bg-[#161b22]">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <div className="text-sm font-mono text-[#cdd9e5]">登录会话</div>
                <div className="text-[11px] font-mono text-[#6e7681] mt-1">
                  可以下线其他设备，保护账号安全。
                </div>
              </div>
              <button
                type="button"
                onClick={handleLogoutOthers}
                disabled={sessionBusy || securityLoading}
                className="px-3 py-1.5 text-xs font-mono border border-[#ef444440] text-[#ef4444] hover:bg-[#ef444410] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                下线其他设备
              </button>
            </div>

            {securityLoading ? (
              <div className="text-xs font-mono text-[#6e7681]">会话加载中...</div>
            ) : sessions.length === 0 ? (
              <div className="text-xs font-mono text-[#6e7681]">暂无会话记录</div>
            ) : (
              <div className="space-y-2">
                {sessions.map((s) => (
                  <div
                    key={s.id}
                    className="p-3 border border-[#21262d] bg-[#0d1117] flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-mono text-[#cdd9e5]">
                        {s.isCurrent ? '当前设备' : `会话 ${s.id.slice(0, 8)}`}
                      </div>
                      <div className="text-[10px] font-mono text-[#6e7681] mt-1">
                        登录于 {formatTime(s.createdAt)}
                      </div>
                      <div className="text-[10px] font-mono text-[#6e7681]">
                        过期于 {formatTime(s.expiresAt)}
                      </div>
                    </div>
                    {s.isCurrent ? (
                      <span className="text-[10px] font-mono px-2 py-1 border border-[#00FF4140] text-[#00FF41] bg-[#00FF4110]">
                        当前
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleLogoutSession(s.id)}
                        disabled={sessionBusy}
                        className="px-3 py-1.5 text-xs font-mono border border-[#30363d] text-[#8b949e] hover:border-[#ef4444] hover:text-[#ef4444] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        下线
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
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
