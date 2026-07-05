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
  features?: Record<string, boolean>;
}

interface AuthSession {
  id: string;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

export function UserSettings({ userId, initial, features = {} }: Props) {
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
    <div className="space-y-6 max-w-2xl">
      {/* ── 个人资料卡 ── */}
      <section className="border border-border-subtle bg-surface-2">
        <div className="px-5 py-3 border-b border-border-subtle flex items-center gap-3">
          {/* 头像区域 */}
          <div className="relative flex-shrink-0">
            {avatar ? (
              <img src={avatar} alt="avatar" className="w-16 h-16 object-cover border-2 border-border"
                onError={e => (e.currentTarget.style.display = 'none')} />
            ) : (
              <div className="w-16 h-16 border-2 border-border flex items-center justify-center bg-surface-1">
                <span className="text-text-lo font-mono text-lg">?</span>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-mono text-text-hi">{nickname || '未设置昵称'}</div>
            <div className="text-[10px] font-mono text-text-mid mt-0.5 line-clamp-2">{bio || '未填写简介'}</div>
          </div>
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}
            className="px-3 py-1.5 text-xs font-mono border border-border text-text-body hover:border-brand hover:text-brand transition-colors flex-shrink-0">
            {uploading ? '...' : '上传头像'}
          </button>
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp"
            className="hidden" onChange={handleFileUpload} />
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-mono text-text-mid mb-1.5 tracking-widest">昵称</label>
              <input type="text" value={nickname} onChange={e => setNickname(e.target.value)} maxLength={50}
                placeholder="给自己起个名字"
                className="w-full bg-surface-1 border border-border-subtle focus:border-brand px-3 py-2 text-sm font-mono text-text-hi outline-none placeholder:text-text-mid" />
            </div>
            <div>
              <label className="block text-[10px] font-mono text-text-mid mb-1.5 tracking-widest">头像链接</label>
              <input type="url" value={avatar} onChange={e => setAvatar(e.target.value)}
                placeholder="或直接粘贴图片URL"
                className="w-full bg-surface-1 border border-border-subtle focus:border-brand px-3 py-2 text-sm font-mono text-text-hi outline-none placeholder:text-text-mid" />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-mono text-text-mid mb-1.5 tracking-widest">简介</label>
            <textarea value={bio} onChange={e => setBio(e.target.value)} maxLength={200} rows={2}
              placeholder="一句话介绍自己"
              className="w-full bg-surface-1 border border-border-subtle focus:border-brand px-3 py-2 text-sm font-mono text-text-hi outline-none resize-none placeholder:text-text-mid" />
            <div className="text-right text-[10px] font-mono text-text-mid">{bio.length}/200</div>
          </div>
        </div>
      </section>

      {/* ── 账号绑定 ── */}
      <section className="border border-border-subtle bg-surface-2">
        <div className="px-5 py-3 border-b border-border-subtle">
          <span className="text-[10px] font-mono text-text-mid tracking-widest">账号绑定</span>
        </div>
        <div className="p-5 space-y-2">
          {[
            { key: 'github', label: 'GitHub', icon: '🐙', href: '/api/auth/login?provider=github&intent=link' },
          ].map(provider => {
            const linked = linkedProviders[provider.key as 'github'];
            return (
              <div key={provider.key} className="flex items-center justify-between gap-3 py-2">
                <div className="flex items-center gap-3">
                  <span className="text-lg">{provider.icon}</span>
                  <div>
                    <div className="text-sm font-mono text-text-hi">{provider.label}</div>
                    <div className="text-[10px] font-mono text-text-mid">
                      {linked ? '已绑定，可用第三方直接登录' : '未绑定'}
                    </div>
                  </div>
                </div>
                {linked ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-brand">✓ 已绑定</span>
                    <button type="button" onClick={() => handleUnlinkProvider(provider.key as 'github')}
                      disabled={unlinkingProvider === provider.key}
                      className="text-[10px] font-mono text-text-mid hover:text-danger transition-colors disabled:opacity-50">
                      {unlinkingProvider === provider.key ? '...' : '解绑'}
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => window.location.assign(provider.href)}
                    className="px-3 py-1 text-xs font-mono border border-border text-text-body hover:border-brand hover:text-brand transition-colors">
                    绑定
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── 账号安全 ── */}
      <section className="border border-border-subtle bg-surface-2">
        <div className="px-5 py-3 border-b border-border-subtle">
          <span className="text-[10px] font-mono text-text-mid tracking-widest">账号安全</span>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <div className="text-sm font-mono text-text-hi mb-3">登录密码</div>
            <div className="space-y-2">
              {!hasPassword && (
                <div className="text-[11px] font-mono text-text-mid mb-2">当前仅支持第三方登录，设置密码后可直接邮箱登录。</div>
              )}
              {hasPassword && (
                <input type="password" value={oldPassword} onChange={e => setOldPassword(e.target.value)}
                  placeholder="当前密码"
                  className="w-full bg-surface-1 border border-border-subtle focus:border-brand px-3 py-2 text-sm font-mono text-text-hi outline-none placeholder:text-text-mid" />
              )}
              <div className="flex gap-2">
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                  placeholder={hasPassword ? '新密码（至少6位）' : '设置密码（至少6位）'}
                  className="flex-1 bg-surface-1 border border-border-subtle focus:border-brand px-3 py-2 text-sm font-mono text-text-hi outline-none placeholder:text-text-mid" />
                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="确认密码"
                  className="flex-1 bg-surface-1 border border-border-subtle focus:border-brand px-3 py-2 text-sm font-mono text-text-hi outline-none placeholder:text-text-mid" />
              </div>
              <button type="button" onClick={handleChangePassword} disabled={changingPassword}
                className={`px-4 py-2 text-xs font-mono border transition-colors disabled:opacity-50 ${hasPassword ? 'border-brand/25 text-brand hover:bg-brand/10' : 'border-border text-text-body hover:border-brand'}`}>
                {changingPassword ? '提交中...' : hasPassword ? '修改密码' : '设置密码'}
              </button>
            </div>
          </div>

          {features.feature_session_mgmt !== false && (
            <div className="pt-4 border-t border-border-subtle">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-sm font-mono text-text-hi">登录会话</div>
                  <div className="text-[11px] font-mono text-text-mid mt-0.5">管理所有已登录设备</div>
                </div>
                <button type="button" onClick={handleLogoutOthers} disabled={sessionBusy || securityLoading}
                  className="px-3 py-1.5 text-xs font-mono border border-danger/25 text-danger hover:bg-danger/10 transition-colors disabled:opacity-50">
                  下线其他设备
                </button>
              </div>
              {securityLoading ? (
                <div className="text-xs font-mono text-text-mid py-4 text-center">加载中...</div>
              ) : sessions.length === 0 ? (
                <div className="text-xs font-mono text-text-mid py-4 text-center">暂无会话</div>
              ) : (
                <div className="space-y-1">
                  {sessions.map(s => (
                    <div key={s.id} className="flex items-center justify-between py-2 px-3 bg-surface-1 border border-border-subtle">
                      <div className="min-w-0">
                        <span className="text-xs font-mono text-text-hi">{s.isCurrent ? '当前设备' : `设备 ${s.id.slice(0,8)}`}</span>
                        <span className="text-[10px] font-mono text-text-mid ml-3">{formatTime(s.createdAt)}</span>
                      </div>
                      {s.isCurrent ? (
                        <span className="text-[10px] font-mono text-brand flex-shrink-0">当前</span>
                      ) : (
                        <button type="button" onClick={() => handleLogoutSession(s.id)} disabled={sessionBusy}
                          className="text-[10px] font-mono text-text-mid hover:text-danger transition-colors flex-shrink-0">
                          下线
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── 隐私设置 ── */}
      {features.feature_privacy !== false && (
        <section className="border border-border-subtle bg-surface-2">
          <div className="px-5 py-3 border-b border-border-subtle">
            <span className="text-[10px] font-mono text-text-mid tracking-widest">隐私设置</span>
          </div>
          <div className="p-5 space-y-1">
            {[
              { key: 'stats', label: '公开统计数据', sub: '创建数量、质量分对外可见', value: showStats, onChange: setShowStats },
              { key: 'watchlist', label: '公开收藏夹', sub: '其他用户可查看你收藏的冰山图', value: showWatchlist, onChange: setShowWatchlist },
            ].map(item => (
              <div key={item.key} className="flex items-center justify-between py-2.5 cursor-pointer"
                onClick={() => item.onChange(!item.value)}>
                <div>
                  <div className="text-sm font-mono text-text-body">{item.label}</div>
                  <div className="text-[10px] font-mono text-text-mid">{item.sub}</div>
                </div>
                <div className={`w-9 h-5 rounded-full transition-colors flex-shrink-0 relative ${item.value ? 'bg-brand/30' : 'bg-surface-1 border border-border'}`}>
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${item.value ? 'left-4 bg-brand' : 'left-0.5 bg-text-mid'}`} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── 保存 ── */}
      <button onClick={handleSave} disabled={saving}
        className="w-full py-2.5 bg-brand text-[#0A0A0A] font-mono font-semibold text-sm hover:bg-brand-hover transition-colors disabled:opacity-50">
        {saving ? '保存中...' : '保存设置'}
      </button>
    </div>
  );
}
