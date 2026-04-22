import React, { useEffect, useState, useRef } from 'react';
import { LoginForm } from './LoginForm';
import { useModalAnimation } from '../hooks/useModalAnimation';
import { User, LayoutDashboard, Plus, LogOut, Lock } from 'lucide-react';
import { enqueueAchievements } from './ui/AchievementToast';

interface User {
  id: string;
  username: string;
  nickname: string;
  isFounder?: boolean;
}

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
}

interface SearchResult {
  id: string;
  slug: string;
  title: string;
  description?: string;
  _count?: { tiers: number };
}

const navLinks = [
  { href: '/', label: '首页' },
  { href: '/iceberg/list', label: '冰山广场' },
  { href: '/leaderboard', label: '排行榜' },
  { href: '/org', label: '机构' },
  { href: '/guide', label: '指南' },
  { href: '/rules', label: '规则' },
  { href: '/feedback', label: '反馈' },
];

export function NavBar() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [showLogin, setShowLogin] = useState(false);
  // 供页面内其他岛（如 CommentSection）触发登录弹窗
  useEffect(() => { (window as any).__openLogin = () => setShowLogin(true); }, []);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [showNotif, setShowNotif] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);

  const notifRef = useRef<HTMLDivElement>(null);

  // 搜索状态
  const [showSearch, setShowSearch] = useState(false);
  const { mounted: searchMounted, isLeaving: searchLeaving } = useModalAnimation(showSearch);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchIndex, setSearchIndex] = useState(-1);
  const [currentPath, setCurrentPath] = useState('');

  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  // ── 用户 ──────────────────────────────────────
  const fetchUser = () => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setUser(d.data);
          fetchUnreadCount();
          // 处理待展示的成就
          if (d.data.pendingAchievements?.length > 0) {
            enqueueAchievements(d.data.pendingAchievements);
            fetch('/api/auth/achievements/ack', { method: 'POST' }).catch(() => {});
          }
        }
        else setUser(null);
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  };

  const fetchUnreadCount = () => {
    fetch('/api/notifications')
      .then(r => r.json())
      .then(d => { if (d.success) setUnreadCount(d.data.unreadCount); })
      .catch(() => {});
  };

  const openNotif = async () => {
    setShowNotif(v => !v);
    if (!showNotif) {
      setNotifLoading(true);
      try {
        const res = await fetch('/api/notifications');
        const d = await res.json();
        if (d.success) {
          setNotifications(d.data.notifications);
          setUnreadCount(d.data.unreadCount);
        }
      } finally {
        setNotifLoading(false);
      }
    }
  };

  const markAllRead = async () => {
    await fetch('/api/notifications/read-all', { method: 'PUT' });
    setNotifications(ns => ns.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  const markRead = async (id: string, link: string | null) => {
    await fetch(`/api/notifications/${id}`, { method: 'PUT' });
    setNotifications(ns => ns.map(n => n.id === id ? { ...n, read: true } : n));
    setUnreadCount(c => Math.max(0, c - 1));
    if (link) window.location.href = link;
  };

  useEffect(() => {
    setCurrentPath(window.location.pathname);
    fetchUser();
    const saved = localStorage.getItem('theme') as 'dark' | 'light' | null;
    if (saved === 'light') {
      setTheme('light');
      document.documentElement.classList.add('light');
    }
    // 定时轮询（含成就检查）
    const timer = setInterval(fetchUser, 15000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const fn = () => {
      if (document.visibilityState === 'visible') {
        fetchUser();
        if (user) fetchUnreadCount();
      }
    };
    document.addEventListener('visibilitychange', fn);
    return () => document.removeEventListener('visibilitychange', fn);
  }, [user]);

  // 点击外部关闭下拉菜单 / 通知面板
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node))
        setShowDropdown(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node))
        setShowNotif(false);
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  // ── 主题 ──────────────────────────────────────
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('theme', next);
    document.documentElement.classList.toggle('light', next === 'light');
  };

  // ── 搜索 ──────────────────────────────────────
  // Ctrl+K / Esc 快捷键
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setShowSearch(true);
      }
      if (e.key === 'Escape') setShowSearch(false);
    };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, []);

  // 打开搜索时聚焦输入框
  useEffect(() => {
    if (showSearch) {
      setTimeout(() => searchInputRef.current?.focus(), 30);
    } else {
      setSearchQuery('');
      setSearchResults([]);
      setSearchIndex(-1);
    }
  }, [showSearch]);

  const handleSearch = (q: string) => {
    setSearchQuery(q);
    setSearchIndex(-1);
    clearTimeout(searchTimer.current);
    if (q.length < 2) { setSearchResults([]); return; }
    setSearchLoading(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (data.success) setSearchResults(data.data.items);
      } catch {}
      setSearchLoading(false);
    }, 300);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (searchResults.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSearchIndex((i) => Math.min(i + 1, searchResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSearchIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Enter') {
      if (searchIndex >= 0 && searchResults[searchIndex]) {
        const item = searchResults[searchIndex];
        window.location.href = `/iceberg/${item.slug || item.id}`;
      }
    }
  };

  // ── 活跃页检测 ────────────────────────────────────
  const isActive = (href: string) => {
    if (!currentPath) return false;
    if (href === '/') return currentPath === '/';
    return currentPath.startsWith(href);
  };

  // ── render ─────────────────────────────────────
  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-40 bg-[#050505]/95 backdrop-blur-sm border-b border-[#1f2937]">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <div className="flex items-center justify-between h-14">

            {/* Logo */}
            <a href="/" className="flex items-center gap-1 font-mono">
              <span className="text-[#00FF41] font-bold text-sm">Iceberg</span>
              <span className="text-[#6b7280] font-bold text-sm">::</span>
              <span className="text-[#9ca3af] font-bold text-sm">DB</span>
              <span className="text-[#374151] text-sm animate-pulse">_</span>
            </a>

            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-0.5">
              {navLinks.map(({ href, label }) => {
                const active = isActive(href);
                return (
                  <a key={href} href={href}
                    className={`px-3 py-2 text-sm transition-all font-mono border-b-2 ${
                      active
                        ? 'text-[#00FF41] border-[#00FF41]'
                        : 'text-[#9ca3af] hover:text-[#00FF41] border-transparent hover:border-[#00FF41]/25'
                    }`}>
                    {label}
                  </a>
                );
              })}
            </div>

            {/* 右侧工具栏 */}
            <div className="flex items-center gap-2">

              {/* 搜索按钮（桌面端） */}
              <button
                onClick={() => setShowSearch(true)}
                className="hidden md:flex items-center gap-2 px-3 py-1.5 text-sm text-[#6b7280] bg-[#0a0c10] border border-[#374151] hover:border-[#00FF41] transition-all font-mono w-40 lg:w-48"
                title="搜索 (Ctrl+K)"
              >
                <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="9" cy="9" r="6"/><path d="M13 13l4 4"/>
                </svg>
                <span className="flex-1 text-left truncate">搜索...</span>
                <span className="text-xs text-[#4b5563]">⌘K</span>
              </button>

              {/* 主题切换 */}
              <button onClick={toggleTheme}
                className="w-9 h-9 flex items-center justify-center text-[#6b7280] hover:text-[#00FF41] border border-[#374151] hover:border-[#00FF41] transition-all"
                title={theme === 'dark' ? '切换浅色' : '切换深色'}>
                {theme === 'dark' ? (
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="10" cy="10" r="4"/>
                    <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M4.2 15.8l1.4-1.4M14.4 5.6l1.4-1.4"/>
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"/>
                  </svg>
                )}
              </button>

              {/* 通知铃铛 */}
              {user && (
                <div className="relative" ref={notifRef}>
                  <button
                    onClick={openNotif}
                    className="relative w-9 h-9 flex items-center justify-center text-[#6b7280] hover:text-[#00FF41] border border-[#374151] hover:border-[#00FF41] transition-all"
                    title="通知"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                    </svg>
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center bg-[#ef4444] text-white text-[10px] font-mono font-bold px-0.5 leading-none">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </button>

                  {showNotif && (
                    <div className="absolute right-0 top-full mt-2 w-80 bg-[#0d0f14] border border-[#2A2A2A] shadow-2xl z-50 overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#1f2937] bg-[#050505]">
                        <span className="text-xs font-mono text-[#e5e5e5]">通知</span>
                        {unreadCount > 0 && (
                          <button onClick={markAllRead} className="text-[10px] font-mono text-[#374151] hover:text-[#00FF41] transition-colors">
                            全部已读
                          </button>
                        )}
                      </div>

                      <div className="max-h-[400px] overflow-y-auto">
                        {notifLoading && (
                          <div className="py-8 text-center text-[#374151] font-mono text-xs animate-pulse">// 加载中...</div>
                        )}
                        {!notifLoading && notifications.length === 0 && (
                          <div className="py-8 text-center text-[#2A2A2A] font-mono text-xs">// 暂无通知</div>
                        )}
                        {!notifLoading && notifications.map(n => {
                          const iconMap: Record<string, string> = {
                            iceberg_approved: '✓', iceberg_rejected: '✗',
                            promotion_approved: '↑', promotion_rejected: '↓',
                            appeal_approved: '◎', appeal_rejected: '⊘',
                            warned: '!', restricted: '⊘', banned: '✕', unbanned: '✓',
                            achievement_unlocked: '★',
                          };
                          const colorMap: Record<string, string> = {
                            iceberg_approved: '#00FF41', iceberg_rejected: '#ef4444',
                            promotion_approved: '#00FF41', promotion_rejected: '#ef4444',
                            appeal_approved: '#00FF41', appeal_rejected: '#ef4444',
                            warned: '#f59e0b', restricted: '#3b82f6', banned: '#ef4444', unbanned: '#00FF41',
                            achievement_unlocked: '#f59e0b',
                          };
                          const color = colorMap[n.type] ?? '#6b7280';
                          const icon = iconMap[n.type] ?? '·';
                          return (
                            <button
                              key={n.id}
                              onClick={() => markRead(n.id, n.link)}
                              className={`w-full text-left px-4 py-3 border-b border-[#1f2937] last:border-0 transition-colors hover:bg-[#0a0c10] ${!n.read ? 'bg-[#0d0f14]' : ''}`}
                            >
                              <div className="flex items-start gap-2.5">
                                <span className="flex-shrink-0 text-xs font-mono font-bold mt-0.5" style={{ color }}>[{icon}]</span>
                                <div className="flex-1 min-w-0">
                                  <p className={`text-xs font-mono leading-snug ${n.read ? 'text-[#6b7280]' : 'text-[#e5e5e5]'}`}>
                                    {n.title}
                                  </p>
                                  {n.body && (
                                    <p className="text-[10px] text-[#374151] mt-0.5 leading-relaxed line-clamp-2">{n.body}</p>
                                  )}
                                  <p className="text-[10px] text-[#2A2A2A] mt-1 font-mono">
                                    {new Date(n.createdAt).toLocaleDateString('zh-CN')}
                                  </p>
                                </div>
                                {!n.read && (
                                  <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-[#00FF41] mt-1.5" />
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 用户区域 */}
              {!loading && (
                <>
                  {user ? (
                    <div className="relative" ref={dropdownRef}>
                      <button onClick={() => setShowDropdown(!showDropdown)}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm text-[#9ca3af] hover:text-[#00FF41] border border-[#374151] hover:border-[#00FF41] transition-all font-mono">
                        <User size={14} strokeWidth={1.5} className="text-[#00FF41]" />
                        <span className="hidden sm:inline max-w-20 truncate">{user.nickname || user.username}</span>
                        <span className="text-xs">▼</span>
                      </button>

                      {showDropdown && (
                        <div className="absolute right-0 top-full mt-2 w-48 bg-[#121212] border border-[#2A2A2A] shadow-xl overflow-hidden z-50">
                          <div className="px-4 py-3 border-b border-[#2A2A2A]">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-mono text-[#e5e5e5]">{user.nickname || user.username}</p>
                              {user.isFounder && (
                                <span className="text-[10px] font-mono px-1 py-0.5 border"
                                  style={{ color: '#f59e0b', borderColor: '#f59e0b50', background: '#f59e0b10' }}>
                                  ◆ FOUNDER
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-[#6b7280] truncate">@{user.username}</p>
                          </div>
                          <div className="py-1">
                            <a href={`/user/${user.id}`}
                              className="flex items-center gap-2 px-4 py-2 text-sm text-[#9ca3af] hover:text-[#00FF41] hover:bg-[#1a1a1a] transition-colors font-mono"
                              onClick={() => setShowDropdown(false)}>
                              <LayoutDashboard size={14} strokeWidth={1.5} /> 我的主页
                            </a>
                            <a href="/iceberg/new"
                              className="flex items-center gap-2 px-4 py-2 text-sm text-[#9ca3af] hover:text-[#00FF41] hover:bg-[#1a1a1a] transition-colors font-mono"
                              onClick={() => setShowDropdown(false)}>
                              <Plus size={14} strokeWidth={1.5} /> 创建冰山图
                            </a>
                          </div>
                          <div className="border-t border-[#2A2A2A] py-1">
                            <a href="/api/auth/logout"
                              className="flex items-center gap-2 px-4 py-2 text-sm text-[#ef4444] hover:bg-[#1a1a1a] transition-colors font-mono">
                              <LogOut size={14} strokeWidth={1.5} /> 退出登录
                            </a>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <button onClick={() => setShowLogin(true)}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm text-[#9ca3af] hover:text-[#00FF41] border border-[#374151] hover:border-[#00FF41] transition-all font-mono">
                      <Lock size={14} strokeWidth={1.5} />
                      <span className="hidden sm:inline">登录</span>
                    </button>
                  )}
                </>
              )}

              {/* 移动端搜索图标 */}
              <button onClick={() => setShowSearch(true)}
                className="md:hidden w-9 h-9 flex items-center justify-center text-[#6b7280] hover:text-[#00FF41] transition-colors">
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="9" cy="9" r="6"/><path d="M13 13l4 4"/>
                </svg>
              </button>

              {/* 移动端汉堡 */}
              <button onClick={() => setShowMobileMenu(!showMobileMenu)}
                className="md:hidden w-9 h-9 flex items-center justify-center text-[#6b7280] hover:text-[#00FF41] transition-colors"
                aria-label="菜单">
                {showMobileMenu ? (
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 4l12 12M16 4L4 16"/>
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h14M3 10h14M3 14h14"/>
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* 移动端展开菜单 */}
        {showMobileMenu && (
          <div className="md:hidden border-t border-[#1f2937] bg-[#050505]/98 mobile-menu-animate">
            {navLinks.map(({ href, label }) => {
              const active = isActive(href);
              return (
                <a key={href} href={href}
                  className={`flex items-center gap-2 px-6 py-3.5 text-sm font-mono border-b border-[#1f2937] last:border-0 transition-colors ${
                    active
                      ? 'text-[#00FF41] bg-[#00FF41]/5'
                      : 'text-[#9ca3af] hover:text-[#00FF41] hover:bg-[#00FF41]/5'
                  }`}
                  onClick={() => setShowMobileMenu(false)}>
                  <span className={`text-xs font-mono w-3 ${active ? 'text-[#00FF41]' : 'text-transparent'}`}>›</span>
                  {label}
                </a>
              );
            })}
            {!loading && !user && (
              <button
                className="w-full flex items-center gap-2 px-6 py-3.5 text-sm text-[#9ca3af] hover:text-[#00FF41] hover:bg-[#00FF41]/5 font-mono transition-colors border-t border-[#1f2937]"
                onClick={() => { setShowMobileMenu(false); setShowLogin(true); }}>
                <Lock size={14} strokeWidth={1.5} /> 登录
              </button>
            )}
          </div>
        )}
      </nav>

      {/* ── 移动端底部导航栏 ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#050505]/95 backdrop-blur-sm border-t border-[#1f2937] mobile-bottom-nav">
        <div className="flex items-stretch">
          {/* 首页 */}
          <a href="/" className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-mono transition-colors ${isActive('/') ? 'text-[#00FF41]' : 'text-[#6b7280]'}`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            首页
          </a>
          {/* 广场 */}
          <a href="/iceberg/list" className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-mono transition-colors ${isActive('/iceberg/list') ? 'text-[#00FF41]' : 'text-[#6b7280]'}`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
            </svg>
            广场
          </a>
          {/* 搜索 */}
          <button onClick={() => setShowSearch(true)} className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-mono text-[#6b7280] transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            搜索
          </button>
          {/* 机构 */}
          <a href="/org" className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-mono transition-colors ${isActive('/org') ? 'text-[#00FF41]' : 'text-[#6b7280]'}`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><line x1="9" y1="22" x2="9" y2="12"/><line x1="15" y1="22" x2="15" y2="12"/><line x1="12" y1="2" x2="12" y2="12"/>
            </svg>
            机构
          </a>
          {/* 我的 / 登录 */}
          {user ? (
            <a href={`/user/${user.id}`} className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-mono transition-colors ${currentPath.startsWith('/user/') ? 'text-[#00FF41]' : 'text-[#6b7280]'}`}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
              </svg>
              我的
            </a>
          ) : (
            <button onClick={() => setShowLogin(true)} className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-mono text-[#6b7280] transition-colors">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              登录
            </button>
          )}
        </div>
      </nav>

      {/* ── 全局搜索覆盖层 ── */}
      {searchMounted && (
        <div
          className={`${searchLeaving ? 'modal-overlay-out' : 'modal-overlay'} fixed inset-0 bg-black/90 z-[60] flex items-start justify-center pt-20 px-4`}
          onClick={() => setShowSearch(false)}
        >
          <div
            className={`${searchLeaving ? 'modal-content-out' : 'modal-content'} w-full max-w-2xl bg-[#0a0c10] border border-[#374151] shadow-2xl`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 搜索输入框 */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[#1f2937]">
              <svg className="text-[#00FF41] flex-shrink-0" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="9" cy="9" r="6"/><path d="M13 13l4 4"/>
              </svg>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="搜索冰山图..."
                className="flex-1 bg-transparent text-[#e5e5e5] text-base focus:outline-none placeholder:text-[#4b5563] font-mono"
              />
              <button
                onClick={() => setShowSearch(false)}
                className="text-[#6b7280] hover:text-[#e5e5e5] text-lg transition-colors font-mono"
              >
                ×
              </button>
            </div>

            {/* 搜索结果 */}
            <div className="max-h-[60vh] overflow-y-auto">
              {searchLoading && (
                <div className="px-4 py-6 text-center text-[#6b7280] font-mono text-sm animate-pulse">
                  搜索中...
                </div>
              )}

              {!searchLoading && searchResults.length > 0 && searchResults.map((item, idx) => (
                <a
                  key={item.id}
                  href={`/iceberg/${item.slug || item.id}`}
                  className={`block px-4 py-3 border-b border-[#1f2937] last:border-0 transition-colors ${idx === searchIndex ? 'bg-[#00FF41]/10 border-l-2 border-l-[#00FF41]' : 'hover:bg-[#00FF41]/5'}`}
                  onClick={() => setShowSearch(false)}
                  onMouseEnter={() => setSearchIndex(idx)}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[#374151] font-mono text-xs">#</span>
                    <span className={`text-sm font-mono ${idx === searchIndex ? 'text-[#00FF41]' : 'text-[#e5e5e5]'}`}>{item.title}</span>
                    {item._count && (
                      <span className="ml-auto text-xs text-[#374151] font-mono">{item._count.tiers} 层</span>
                    )}
                  </div>
                  {item.description && (
                    <p className="text-xs text-[#6b7280] mt-1 truncate pl-4">{item.description}</p>
                  )}
                </a>
              ))}

              {!searchLoading && searchQuery.length >= 2 && searchResults.length === 0 && (
                <div className="px-4 py-8 text-center text-[#6b7280] font-mono text-sm">
                  未找到「{searchQuery}」相关的冰山图
                </div>
              )}

              {searchQuery.length < 2 && (
                <div className="px-4 py-4 text-center text-[#374151] font-mono text-xs">
                  输入至少 2 个字符开始搜索
                </div>
              )}
            </div>

            {/* 底部提示 */}
            <div className="px-4 py-2 border-t border-[#1f2937] flex items-center justify-end gap-4 text-xs text-[#374151] font-mono">
              <span>↑↓ 导航</span>
              <span>↵ 打开</span>
              <span>Esc 关闭</span>
            </div>
          </div>
        </div>
      )}

      {/* 登录弹窗 */}
      <LoginForm isOpen={showLogin} onClose={() => setShowLogin(false)} />
    </>
  );
}
