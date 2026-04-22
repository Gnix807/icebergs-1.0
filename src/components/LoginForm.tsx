import React, { useState, useEffect } from 'react';

interface LoginFormProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LoginForm({ isOpen, onClose }: LoginFormProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [nickname, setNickname] = useState('');

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body = mode === 'login'
        ? { email, password }
        : { email, password, username, nickname };

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
      <div className="relative w-full max-w-md bg-[#080a0f] border border-[#1f2937] border-l-4 border-l-[#00FF41] overflow-hidden shadow-2xl shadow-[#00FF41]/10">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1f2937] bg-[#050508]">
          <div>
            <div className="text-[10px] font-mono text-[#374151] tracking-widest mb-1">[ AUTH TERMINAL ]</div>
            <h2 className="text-base font-mono font-semibold text-[#e5e5e5]">
              <span className="text-[#00FF41]">#</span> {mode === 'login' ? '登录' : '注册'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-[#374151] hover:text-[#00FF41] border border-[#1f2937] hover:border-[#00FF41] px-2.5 py-1.5 text-xs font-mono transition-all"
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

          {/* OAuth */}
          {mode === 'login' && (
            <div className="space-y-2">
              <a
                href="/api/auth/login?provider=github"
                className="flex items-center justify-center gap-2 py-2.5 px-4 bg-[#0d0f14] border border-[#2A2A2A] hover:border-[#00FF41] hover:bg-[#111827] transition-all text-sm font-mono"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
                </svg>
                GitHub
              </a>

              {/* 分割线 */}
              <div className="flex items-center gap-2 my-3">
                <div className="flex-1 h-px bg-[#2A2A2A]"></div>
                <span className="text-[10px] text-[#6b7280]">或</span>
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
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2.5 bg-[#050508] border border-[#1f2937] text-sm font-mono focus:border-[#00FF41] focus:outline-none placeholder-[#374151] transition-colors"
                placeholder="邮箱"
                required
              />
            </div>

            <div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 bg-[#050508] border border-[#1f2937] text-sm font-mono focus:border-[#00FF41] focus:outline-none placeholder-[#374151] transition-colors"
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
                    className="w-full px-3 py-2.5 bg-[#050508] border border-[#1f2937] text-sm font-mono focus:border-[#00FF41] focus:outline-none placeholder-[#374151] transition-colors"
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
                    className="w-full px-3 py-2.5 bg-[#050508] border border-[#1f2937] text-sm font-mono focus:border-[#00FF41] focus:outline-none placeholder-[#374151] transition-colors"
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

          {/* 切换 */}
          <div className="text-center text-xs pt-2">
            {mode === 'login' ? (
              <span className="text-[#6b7280]">
                没有账户？{' '}
                <button onClick={() => setMode('register')} className="text-[#00FF41] hover:underline">
                  立即注册
                </button>
              </span>
            ) : (
              <span className="text-[#6b7280]">
                已有账户？{' '}
                <button onClick={() => setMode('login')} className="text-[#00FF41] hover:underline">
                  立即登录
                </button>
              </span>
            )}
          </div>
        </div>

        {/* 底部 */}
        <div className="px-6 py-3 border-t border-[#1f2937] bg-[#050508] flex items-center justify-between">
          <p className="text-[10px] text-[#2A2A2A] font-mono">
            {mode === 'login' ? '登录即同意服务条款' : '注册即同意服务条款'}
          </p>
          <a href="/" className="text-[10px] font-mono text-[#374151] hover:text-[#00FF41] transition-colors">
            ← 首页
          </a>
        </div>
      </div>
    </div>
  );
}
