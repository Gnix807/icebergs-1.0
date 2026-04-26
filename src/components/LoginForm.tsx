import React, { useState, useEffect } from 'react';

interface LoginFormProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LoginForm({ isOpen, onClose }: LoginFormProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [nickname, setNickname] = useState('');
  const [verificationCode, setVerificationCode] = useState('');

  // ESC 关闭
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setInterval(() => {
      setCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(t);
  }, [cooldown]);

  useEffect(() => {
    setError(null);
    setInfo(null);
  }, [mode]);

  const handleSendCode = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      setError('请先输入正确的邮箱');
      return;
    }

    setSendingCode(true);
    setError(null);
    setInfo(null);

    try {
      const res = await fetch('/api/auth/email/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail, purpose: 'register' }),
      });
      const data = await res.json();
      if (data.success) {
        setInfo(`验证码已发送到 ${data.data?.emailHint || normalizedEmail}`);
        setCooldown(60);
      } else {
        setError(data.error?.message || '验证码发送失败');
      }
    } catch {
      setError('验证码发送失败，请检查网络后重试');
    } finally {
      setSendingCode(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);

    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body = mode === 'login'
        ? { email, password }
        : { email, password, username, nickname, verificationCode };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (data.success) {
        onClose();
        window.location.reload();
      } else {
        setError(data.error?.message || (mode === 'login' ? '登录失败' : '注册失败'));
      }
    } catch {
      setError('网络错误，请重试');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 遮罩 */}
      <div
        className="modal-overlay absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 弹窗 */}
      <div className="relative w-full max-w-md bg-[#0d1117] border border-[#21262d] border-l-4 border-l-[#00FF41] overflow-hidden shadow-2xl shadow-[#00FF41]/10">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#21262d] bg-[#050508]">
          <div>
            <div className="text-[10px] font-mono text-[#6e7681] tracking-widest mb-1">[ AUTH TERMINAL ]</div>
            <h2 className="text-base font-mono font-semibold text-[#cdd9e5]">
              <span className="text-[#00FF41]">#</span> {mode === 'login' ? '登录' : '注册'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-[#6e7681] hover:text-[#00FF41] border border-[#21262d] hover:border-[#00FF41] px-2.5 py-1.5 text-xs font-mono transition-all"
          >
            ESC
          </button>
        </div>

        {/* 内容 */}
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-[#1a0808] border border-[#ef444440] text-[#ef4444] text-xs font-mono">
              &gt; ERROR: {error}
            </div>
          )}
          {info && (
            <div className="p-3 bg-[#07170d] border border-[#00FF4140] text-[#5ee38a] text-xs font-mono">
              &gt; {info}
            </div>
          )}

          {/* 邮箱方式切换（与 OAuth 并列） */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`py-2 px-3 text-xs font-mono border transition-colors ${
                mode === 'login'
                  ? 'border-[#00FF41] text-[#00FF41] bg-[#00FF4110]'
                  : 'border-[#30363d] text-[#8b949e] hover:border-[#00FF41] hover:text-[#00FF41]'
              }`}
            >
              邮箱登录
            </button>
            <button
              type="button"
              onClick={() => setMode('register')}
              className={`py-2 px-3 text-xs font-mono border transition-colors ${
                mode === 'register'
                  ? 'border-[#00FF41] text-[#00FF41] bg-[#00FF4110]'
                  : 'border-[#30363d] text-[#8b949e] hover:border-[#00FF41] hover:text-[#00FF41]'
              }`}
            >
              邮箱注册
            </button>
          </div>

          {/* OAuth（始终可见，和邮箱并列） */}
          <div className="space-y-2">
            <a
              href="/api/auth/login?provider=github"
              className="flex items-center justify-center gap-2 py-2.5 px-4 bg-[#0d0f14] border border-[#30363d] hover:border-[#00FF41] hover:bg-[#1c2128] transition-all text-sm font-mono"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
              </svg>
              使用 GitHub 登录/注册
            </a>
            <a
              href="/api/auth/login?provider=google"
              className="flex items-center justify-center gap-2 py-2.5 px-4 bg-[#0d0f14] border border-[#30363d] hover:border-[#00FF41] hover:bg-[#1c2128] transition-all text-sm font-mono"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M21.8 12.23c0-.76-.07-1.49-.2-2.2H12v4.16h5.49a4.7 4.7 0 0 1-2.04 3.08v2.56h3.31c1.94-1.78 3.04-4.4 3.04-7.6Z" fill="#4285F4"/>
                <path d="M12 22c2.75 0 5.06-.91 6.75-2.17l-3.31-2.56c-.91.61-2.08.97-3.44.97-2.65 0-4.9-1.79-5.7-4.19H2.9v2.63A10 10 0 0 0 12 22Z" fill="#34A853"/>
                <path d="M6.3 14.05A6 6 0 0 1 6 12c0-.71.12-1.4.3-2.05V7.32H2.9A10 10 0 0 0 2 12c0 1.6.38 3.1.9 4.68l3.4-2.63Z" fill="#FBBC05"/>
                <path d="M12 5.76c1.5 0 2.85.52 3.92 1.54l2.94-2.94A9.8 9.8 0 0 0 12 2 10 10 0 0 0 2.9 7.32l3.4 2.63C7.1 7.55 9.35 5.76 12 5.76Z" fill="#EA4335"/>
              </svg>
              使用 Google 登录/注册
            </a>

            <div className="flex items-center gap-2 my-3">
              <div className="flex-1 h-px bg-[#2A2A2A]"></div>
              <span className="text-[10px] text-[#8b949e]">或使用邮箱{mode === 'login' ? '登录' : '注册'}</span>
              <div className="flex-1 h-px bg-[#2A2A2A]"></div>
            </div>
          </div>

          {/* 邮箱表单 */}
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2.5 bg-[#050508] border border-[#21262d] text-sm font-mono focus:border-[#00FF41] focus:outline-none placeholder-[#3d444d] transition-colors"
                placeholder="邮箱"
                required
              />
            </div>

            {mode === 'register' && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
                  className="flex-1 px-3 py-2.5 bg-[#050508] border border-[#21262d] text-sm font-mono focus:border-[#00FF41] focus:outline-none placeholder-[#3d444d] transition-colors"
                  placeholder="邮箱验证码（6位）"
                  required
                  inputMode="numeric"
                  pattern="^\d{6}$"
                  maxLength={6}
                />
                <button
                  type="button"
                  onClick={handleSendCode}
                  disabled={sendingCode || cooldown > 0}
                  className="px-3 py-2.5 min-w-[118px] text-xs font-mono border border-[#30363d] text-[#adbac7] hover:border-[#00FF41] hover:text-[#00FF41] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sendingCode ? '发送中...' : cooldown > 0 ? `${cooldown}s 后重发` : '发送验证码'}
                </button>
              </div>
            )}

            <div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 bg-[#050508] border border-[#21262d] text-sm font-mono focus:border-[#00FF41] focus:outline-none placeholder-[#3d444d] transition-colors"
                placeholder="密码"
                required
                minLength={6}
              />
            </div>

            {mode === 'register' && (
              <>
                <div>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full px-3 py-2.5 bg-[#050508] border border-[#21262d] text-sm font-mono focus:border-[#00FF41] focus:outline-none placeholder-[#3d444d] transition-colors"
                    placeholder="用户名"
                    required
                    pattern="^[a-zA-Z0-9_]{3,20}$"
                  />
                </div>
                <div>
                  <input
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    className="w-full px-3 py-2.5 bg-[#050508] border border-[#21262d] text-sm font-mono focus:border-[#00FF41] focus:outline-none placeholder-[#3d444d] transition-colors"
                    placeholder="昵称 (选填)"
                  />
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-[#00FF41] text-[#050505] font-bold text-sm font-mono hover:bg-[#00CC33] transition-colors disabled:opacity-50"
            >
              {loading ? '>> 处理中...' : mode === 'login' ? '>> 登录' : '>> 注册'}
            </button>
          </form>
        </div>

        {/* 底部 */}
        <div className="px-6 py-3 border-t border-[#21262d] bg-[#050508] flex items-center justify-between">
          <p className="text-[10px] text-[#3d444d] font-mono">
            {mode === 'login' ? '登录即同意服务条款' : '注册即同意服务条款'}
          </p>
          <a href="/" className="text-[10px] font-mono text-[#6e7681] hover:text-[#00FF41] transition-colors">
            ← 首页
          </a>
        </div>
      </div>
    </div>
  );
}
