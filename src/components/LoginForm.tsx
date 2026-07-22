import { createPortal } from 'react-dom';
import { useState, useEffect, useCallback, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';

interface LoginFormProps {
  isOpen: boolean;
  onClose?: () => void;
  initialMode?: 'login' | 'register' | 'reset';
}

export function LoginForm({ isOpen, onClose, initialMode = 'login' }: LoginFormProps) {
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>(initialMode);
  const resetOnly = initialMode === 'reset';
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null); // 高亮哪个字段: email/password/username/nickname

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState('');
  const [nickname, setNickname] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);

  const handleClose = useCallback(() => {
    if (onClose) {
      onClose();
      return;
    }
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  }, [onClose]);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // ESC 关闭
  useEffect(() => {
    if (!isOpen || !mounted) return;

    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevHtmlOverscroll = html.style.overscrollBehavior;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyOverscroll = body.style.overscrollBehavior;

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };

    document.addEventListener('keydown', handleEsc);
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    html.style.overscrollBehavior = 'none';
    body.style.overscrollBehavior = 'none';

    return () => {
      document.removeEventListener('keydown', handleEsc);
      html.style.overflow = prevHtmlOverflow;
      html.style.overscrollBehavior = prevHtmlOverscroll;
      body.style.overflow = prevBodyOverflow;
      body.style.overscrollBehavior = prevBodyOverscroll;
    };
  }, [isOpen, mounted, handleClose]);

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
    setFieldError(null);
    setCapsLockOn(false);
  }, [mode]);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  const handlePasswordKeyState = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    setCapsLockOn(Boolean(e.getModifierState?.('CapsLock')));
  };

  const normalizeSubmitError = (raw: string | undefined) => {
    const msg = (raw || '').trim();
    if (!msg) {
    setFieldError(null);
    if (error) setError(null);
      return mode === 'login' ? '登录失败，请稍后重试' : mode === 'register' ? '注册失败，请稍后重试' : '重置密码失败，请稍后重试';
    }
    if (mode === 'login' && msg.includes('邮箱或密码错误')) return '邮箱或密码错误，请检查后重试';
    if (mode === 'login' && msg.includes('第三方登录')) return '该邮箱仅支持第三方登录，请改用 GitHub 登录';
    if (mode === 'register' && msg.includes('验证码')) return msg;

    // 字段级错误高亮
    if (msg.includes('邮箱')) setFieldError('email');
    else if (msg.includes('密码')) setFieldError('password');
    else if (msg.includes('用户名')) setFieldError('username');
    else if (msg.includes('昵称')) setFieldError('nickname');
    else setFieldError(null);

    return msg;
  };

  const handleSendCode = async () => {
    if (mode !== 'register' && mode !== 'reset') return;

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
      const url = '/api/auth/email/send-code';
      const body = {
        email: normalizedEmail,
        purpose: mode === 'reset' ? 'password_reset' : 'register',
      };
      const res = await fetch(`${url}?data=${encodeURIComponent(JSON.stringify(body))}`);
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

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    setFieldError(null);

    try {
      const normalizedEmail = email.trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(normalizedEmail)) {
        setError('请输入正确的邮箱地址');
        setFieldError('email');
        setLoading(false);
        return;
      }

      if (mode === 'reset' && password !== confirmPassword) {
        setError('两次输入的新密码不一致');
        setFieldError('password');
        setLoading(false);
        return;
      }

      const endpoint = mode === 'login'
        ? '/api/auth/login'
        : mode === 'register'
          ? '/api/auth/register'
          : '/api/auth/reset-password';
      const params = new URLSearchParams();
      if (mode === 'login') {
        params.set('email', normalizedEmail);
        params.set('password', password);
      } else if (mode === 'register') {
        params.set('email', normalizedEmail);
        params.set('password', password);
        params.set('username', username.trim());
        if (nickname) params.set('nickname', nickname);
      } else {
        params.set('email', normalizedEmail);
        params.set('newPassword', password);
      }

      const res = await fetch(`${endpoint}?${params}`, { method: 'GET' });

      const data = await res.json();

      if (data.success) {
        if (mode === 'reset') {
          setInfo('密码重置成功，请使用新密码登录');
          setPassword('');
          setConfirmPassword('');
          setVerificationCode('');
          if (resetOnly) {
            window.setTimeout(() => {
              window.location.href = '/login';
            }, 900);
          } else {
            setMode('login');
          }
          return;
        }
        handleClose();
        window.location.reload();
      } else {
        setError(normalizeSubmitError(data.error?.message));
      }
    } catch {
      setError('网络错误，请重试');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div className="app-modal-viewport fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 遮罩 */}
      <div
        className="modal-overlay absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* 弹窗 */}
      <div className="app-modal-panel relative flex w-full max-w-md flex-col bg-surface-1 border border-border-subtle border-l-4 border-l-brand overflow-hidden shadow-2xl shadow-[#00FF41]/10" role="dialog" aria-modal="true" aria-label={mode === 'login' ? '登录' : mode === 'register' ? '注册' : '重置密码'}>
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle bg-surface-0">
          <div>
            <div className="text-[10px] font-mono text-text-mid tracking-widest mb-1">[ AUTH TERMINAL ]</div>
            <h2 className="text-base font-mono font-semibold text-text-hi">
              <span className="text-brand">#</span> {mode === 'login' ? '登录' : mode === 'register' ? '注册' : '重置密码'}
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="mobile-touch-target text-text-mid hover:text-brand border border-border-subtle hover:border-brand px-2.5 py-1.5 text-xs font-mono transition-all"
          >
            ESC
          </button>
        </div>

        {/* 内容 */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {error && (
            <div className="p-3 bg-[#1a0808] border border-danger/25 text-danger text-xs font-mono">
              &gt; ERROR: {error}
            </div>
          )}
          {info && (
            <div className="p-3 bg-[#07170d] border border-brand/25 text-[#5ee38a] text-xs font-mono">
              &gt; {info}
            </div>
          )}

          {!resetOnly && (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode('login')}
                className={`py-2 px-3 text-xs font-mono border transition-colors ${
                  mode === 'login'
                    ? 'border-brand text-brand bg-brand/10'
                    : 'border-border text-text-body hover:border-brand hover:text-brand'
                }`}
              >
                邮箱登录
              </button>
              <button
                type="button"
                onClick={() => setMode('register')}
                className={`py-2 px-3 text-xs font-mono border transition-colors ${
                  mode === 'register'
                    ? 'border-brand text-brand bg-brand/10'
                    : 'border-border text-text-body hover:border-brand hover:text-brand'
                }`}
              >
                邮箱注册
              </button>
            </div>
          )}

          {/* OAuth（始终可见，和邮箱并列） */}
          {!resetOnly && (
            <div className="space-y-2">
              <a
                href="/api/auth/login?provider=github"
                className="flex items-center justify-center gap-2 py-2.5 px-4 bg-surface-4 border border-border hover:border-brand hover:bg-surface-3 transition-all text-sm font-mono"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
                </svg>
                使用 GitHub 登录/注册
              </a>

              <div className="flex items-center gap-2 my-3">
                <div className="flex-1 h-px bg-[#2A2A2A]"></div>
                <span className="text-[10px] text-text-body">
                  或使用邮箱{mode === 'login' ? '登录' : '注册'}
                </span>
                <div className="flex-1 h-px bg-[#2A2A2A]"></div>
              </div>
            </div>
          )}

          {/* 邮箱表单 */}
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setFieldError(null); setError(null); }}
                className={`w-full px-3 py-2.5 bg-surface-0 border text-sm font-mono focus:outline-none placeholder:text-text-lo transition-colors ${
                  fieldError === 'email' ? 'border-danger text-danger' : 'border-border-subtle focus:border-brand'
                }`}
                placeholder="邮箱"
                required
                aria-label="邮箱地址"
              />
              {fieldError === 'email' && <p className="text-[10px] font-mono text-danger mt-0.5 pl-1">{error}</p>}
            </div>

            <div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setFieldError(null); setError(null); }}
                  onKeyUp={handlePasswordKeyState}
                  onKeyDown={handlePasswordKeyState}
                  className={`w-full px-3 py-2.5 pr-16 bg-surface-0 border text-sm font-mono focus:outline-none placeholder:text-text-lo transition-colors ${
                    fieldError === 'password' ? 'border-danger text-danger' : 'border-border-subtle focus:border-brand'
                  }`}
                  placeholder={mode === 'reset' ? '新密码' : '密码'}
                  required
                  minLength={6}
                  aria-label="密码"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-mono text-text-mid hover:text-brand transition-colors"
                >
                  {showPassword ? '隐藏' : '显示'}
                </button>
              </div>
              {fieldError === 'password' && <p className="text-[10px] font-mono text-danger mt-0.5 pl-1">{error}</p>}
              {(mode === 'register' || mode === 'reset') && !fieldError && (
                <p className="text-[10px] font-mono text-text-lo mt-0.5 pl-1">至少6位</p>
              )}
            </div>

            {capsLockOn && (
              <div className="-mt-1">
                <p className="text-[11px] font-mono text-warning">CapsLock 已开启，注意密码大小写</p>
              </div>
            )}

            {mode === 'login' && (
              <div className="text-right -mt-1">
                <button
                  type="button"
                  onClick={() => setMode('reset')}
                  className="text-[11px] font-mono text-text-mid hover:text-brand transition-colors"
                >
                  忘记密码？
                </button>
              </div>
            )}

            {mode === 'reset' && (
              <div>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    onKeyUp={handlePasswordKeyState}
                    onKeyDown={handlePasswordKeyState}
                    className="w-full px-3 py-2.5 pr-16 bg-surface-0 border border-border-subtle text-sm font-mono focus:border-brand focus:outline-none placeholder:text-text-lo transition-colors"
                    placeholder="确认新密码"
                    required
                    minLength={6}
                    aria-label="确认新密码"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-mono text-text-mid hover:text-brand transition-colors"
                  >
                    {showConfirmPassword ? '隐藏' : '显示'}
                  </button>
                </div>
              </div>
            )}

            {mode === 'reset' && !resetOnly && (
              <div className="text-right mt-1">
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className="text-[11px] font-mono text-text-mid hover:text-brand transition-colors"
                >
                  返回登录
                </button>
              </div>
            )}

            {mode === 'register' && (
              <>
                <div>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => { setUsername(e.target.value); setFieldError(null); setError(null); }}
                    className={`w-full px-3 py-2.5 bg-surface-0 border text-sm font-mono focus:outline-none placeholder:text-text-lo transition-colors ${
                      fieldError === 'username' ? 'border-danger text-danger' : 'border-border-subtle focus:border-brand'
                    }`}
                    placeholder="用户名"
                    required
                    pattern="^[a-zA-Z0-9_]{3,20}$"
                    aria-label="用户名"
                  />
                  <p className="text-[10px] font-mono text-text-lo mt-0.5 pl-1">3-20位字母、数字或下划线</p>
                  {fieldError === 'username' && <p className="text-[10px] font-mono text-danger mt-0.5 pl-1">{error}</p>}
                </div>
                <div>
                  <input
                    type="text"
                    value={nickname}
                    onChange={(e) => { setNickname(e.target.value); setFieldError(null); setError(null); }}
                    className={`w-full px-3 py-2.5 bg-surface-0 border text-sm font-mono focus:outline-none placeholder:text-text-lo transition-colors ${
                      fieldError === 'nickname' ? 'border-danger text-danger' : 'border-border-subtle focus:border-brand'
                    }`}
                    placeholder="昵称 (选填)"
                    aria-label="昵称"
                  />
                  {fieldError === 'nickname' && <p className="text-[10px] font-mono text-danger mt-0.5 pl-1">{error}</p>}
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-brand text-[#050505] font-bold text-sm font-mono hover:bg-brand-hover transition-colors disabled:opacity-50"
            >
              {loading
                ? '>> 处理中...'
                : mode === 'login'
                  ? '>> 登录'
                  : mode === 'register'
                    ? '>> 注册'
                    : '>> 重置密码'}
            </button>
          </form>
        </div>

        {/* 底部 */}
        <div className="px-6 py-3 border-t border-border-subtle bg-surface-0 flex items-center justify-between">
          <p className="text-[10px] text-text-lo font-mono">
            {mode === 'reset' ? (
              '重置密码请确保邮箱可用'
            ) : (
              <>
                {mode === 'login' ? '登录' : '注册'}即同意
                <a href="/terms" className="mx-1 text-text-body hover:text-brand underline-offset-2 hover:underline">
                  服务条款
                </a>
                和
                <a href="/privacy" className="mx-1 text-text-body hover:text-brand underline-offset-2 hover:underline">
                  隐私政策
                </a>
              </>
            )}
          </p>
          <a
            href={mode === 'reset' && resetOnly ? '/login' : '/'}
            className="text-[10px] font-mono text-text-mid hover:text-brand transition-colors"
          >
            {mode === 'reset' && resetOnly ? '← 返回登录' : '← 首页'}
          </a>
        </div>
      </div>
    </div>,
    document.body
  );
}
