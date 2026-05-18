import { useEffect, useState, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { LoginForm } from './LoginForm';
import { useModalAnimation } from '../hooks/useModalAnimation';
import { User, LayoutDashboard, LogOut, Lock, Settings } from 'lucide-react';
import { enqueueAchievements } from './ui/AchievementToast';
import { SearchQuickLinks } from './nav/SearchQuickLinks';

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
  { href: '/iceberg/new', label: '创建' },
  { href: '/feedback', label: '反馈' },
  { href: '/guide', label: '指南' },
  { href: '/announcements', label: '公告' },
  { href: '/org', label: '机构' },
  { href: '/changelog', label: '更新日志' },
  { href: '/rules', label: '规则' },
  { href: '/feedback/progress', label: '进展' },
];

const moreLinks = [
  { href: '/terms', label: '服务条款' },
  { href: '/privacy', label: '隐私政策' },
  { href: '/about', label: '关于本站' },
];

// 移动端菜单仍然展示全部链接
const allLinks = [...navLinks, ...moreLinks];

export function NavBar() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [showLogin, setShowLogin] = useState(false);
  // 供页面内其他岛（如 CommentSection）触发登录弹窗
  useEffect(() => { (window as any).__openLogin = () => setShowLogin(true); }, []);
  const [showDropdown, setShowDropdown] = useState(false);
  const { mounted: dropdownMounted, isLeaving: dropdownLeaving } = useModalAnimation(showDropdown);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [showNotif, setShowNotif] = useState(false);
  const { mounted: notifMounted, isLeaving: notifLeaving } = useModalAnimation(showNotif);
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
  const [hasNewAnnouncement, setHasNewAnnouncement] = useState(false);
  const [showMore, setShowMore] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userRef = useRef<User | null>(null);

  // ── 用户 ──────────────────────────────────────
  const fetchUser = async () => {
    try {
      const r = await fetch('/api/auth/me');
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.success) {
        setUser(d.data);
        fetchUnreadCount();
        // 处理待展示的成就
        if (d.data.pendingAchievements?.length > 0) {
          enqueueAchievements(d.data.pendingAchievements);
          fetch('/api/auth/achievements/ack', { method: 'POST' }).catch(() => {});
        }
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
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

  // 检测是否有未读公告
  const checkNewAnnouncement = () => {
    fetch('/api/announcements/latest')
      .then(r => r.json())
      .then(d => {
        if (!d.success || !d.data.latestAt) return;
        const seen = localStorage.getItem('ann_seen');
        setHasNewAnnouncement(!seen || new Date(d.data.latestAt) > new Date(seen));
      })
      .catch(() => {});
  };

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    setCurrentPath(window.location.pathname);
    fetchUser();
    checkNewAnnouncement();
    const saved = localStorage.getItem('theme') as 'dark' | 'light' | null;
    if (saved === 'light') {
      setTheme('light');
      document.documentElement.classList.add('light');
    }
    // Astro ViewTransitions 导航后更新当前路径
    const onPageLoad = () => {
      setCurrentPath(window.location.pathname);
      // 进入公告页时标记已读
      if (window.location.pathname.startsWith('/announcements')) {
        localStorage.setItem('ann_seen', new Date().toISOString());
        setHasNewAnnouncement(false);
      }
    };
    document.addEventListener('astro:page-load', onPageLoad);
    return () => {
      document.removeEventListener('astro:page-load', onPageLoad);
    };
  }, []);

  // 仅登录态轮询，避免游客持续 401 噪音
  useEffect(() => {
    if (!user) return;
    const timer = setInterval(() => {
      fetchUser();
    }, 15000);
    return () => clearInterval(timer);
  }, [user]);

  useEffect(() => {
    const fn = () => {
      if (document.visibilityState === 'visible') {
        // 登录态唤醒同步，未登录不重复打 /api/auth/me
        if (userRef.current) {
          fetchUser();
          fetchUnreadCount();
        }
      }
    };
    document.addEventListener('visibilitychange', fn);
    return () => document.removeEventListener('visibilitychange', fn);
  }, []);

  // 点击外部关闭下拉菜单 / 通知面板
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node))
        setShowDropdown(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node))
        setShowNotif(false);
      if (moreRef.current && !moreRef.current.contains(e.target as Node))
        setShowMore(false);
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
    if (searchTimer.current) clearTimeout(searchTimer.current);
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

  const handleSearchKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
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
      <nav className="site-navbar fixed top-0 left-0 right-0 z-40 bg-surface-1/96 backdrop-blur-sm border-b border-border-subtle">
        <div className="w-full max-w-none px-3 md:px-4 lg:px-6 xl:px-8">
          <div className="flex items-center justify-between h-14 gap-2 lg:gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-2 lg:gap-4">
              {/* Logo */}
              <a href="/" className="flex items-center gap-1 font-mono group glitch-hover flex-shrink-0">
                <span className="text-brand font-bold text-[15px] transition-colors">Iceberg</span>
                <span className="text-text-lo font-bold text-[15px] group-hover:text-text-mid transition-colors">::</span>
                <span className="text-text-body font-bold text-[15px] group-hover:text-text-hi transition-colors">DB</span>
                <span className="text-brand text-[15px] terminal-cursor-blink">_</span>
              </a>

              {/* Desktop nav */}
              <div className="hidden lg:flex min-w-0 flex-1 items-center justify-start gap-0 xl:gap-0.5">
                {navLinks.map(({ href, label }) => {
                  const active = isActive(href);
                  const isAnn = href === '/announcements';
                  const isCreate = href === '/iceberg/new';
                  return (
                    <a key={href} href={href}
                      className={`relative px-2.5 xl:px-3 py-2 text-[15px] transition-all font-mono border-b-2 ${
                        active
                          ? 'text-brand border-brand'
                          : 'text-text-hi hover:text-brand border-transparent hover:border-brand/25'
                      }`}>
                      {isCreate && <span className="mr-0.5">+</span>}
                      {label}
                      {isAnn && hasNewAnnouncement && (
                        <span className="absolute top-1.5 right-0.5 w-1.5 h-1.5 rounded-full bg-brand" />
                      )}
                    </a>
                  );
                })}

                {/* 更多下拉 */}
                <div className="relative" ref={moreRef}>
                  <button
                    onClick={() => setShowMore(v => !v)}
                    className={`relative px-2.5 xl:px-3 py-2 text-[15px] transition-all font-mono border-b-2 ${
                      moreLinks.some(l => isActive(l.href))
                        ? 'text-brand border-brand'
                        : 'text-text-hi hover:text-brand border-transparent hover:border-brand/25'
                    }`}
                  >
                    更多
                    <span className="ml-0.5 text-[10px]">{showMore ? '▲' : '▼'}</span>
                  </button>

                  {showMore && (
                    <div className="absolute top-full left-0 mt-1 w-36 bg-surface-2 border border-border shadow-xl z-50 nav-dropdown-in">
                      {moreLinks.map(({ href, label }) => {
                        const active = isActive(href);
                        return (
                          <a key={href} href={href}
                            onClick={() => setShowMore(false)}
                            className={`block px-4 py-2.5 text-xs font-mono transition-colors border-b border-border-subtle last:border-0 ${
                              active
                                ? 'text-brand bg-brand/5'
                                : 'text-text-body hover:text-brand hover:bg-surface-1'
                            }`}>
                            {label}
                          </a>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 右侧工具栏 */}
            <div className="ml-2 flex flex-shrink-0 items-center gap-1.5 xl:gap-2">

              {/* 搜索按钮（桌面端） */}
                <button
                  onClick={() => setShowSearch(true)}
                  className="hidden lg:flex items-center gap-2 px-2.5 xl:px-3 py-1.5 text-[15px] text-text-body bg-surface-2 border border-border hover:border-brand transition-all font-mono w-32 xl:w-40"
                  title="搜索 (Ctrl+K)"
                >
                <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <circle cx="9" cy="9" r="6"/><path d="M13 13l4 4"/>
                </svg>
                <span className="flex-1 text-left truncate">搜索...</span>
                <span className="text-xs text-text-mid">⌘K</span>
              </button>

              {/* 主题切换 */}
              <button onClick={toggleTheme}
                className="w-9 h-9 flex items-center justify-center text-text-body hover:text-brand border border-border hover:border-brand transition-all"
                title={theme === 'dark' ? '切换浅色' : '切换深色'}
                aria-label={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}>
                {theme === 'dark' ? (
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <circle cx="10" cy="10" r="4"/>
                    <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M4.2 15.8l1.4-1.4M14.4 5.6l1.4-1.4"/>
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"/>
                  </svg>
                )}
              </button>

              {/* 通知铃铛 */}
              {user && (
                <div className="relative" ref={notifRef}>
                  <button
                    onClick={openNotif}
                    className="relative w-9 h-9 flex items-center justify-center text-text-body hover:text-brand border border-border hover:border-brand transition-all"
                    title="通知"
                    aria-label="通知"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                    </svg>
                    {unreadCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-[17px] h-[17px] flex items-center justify-center bg-[#ef4444] text-white text-[10px] font-mono font-bold px-0.5 leading-none">
                        {/* 脉冲扩散环 */}
                        <span className="absolute inset-0 bg-[#ef4444] animate-ping opacity-60" style={{ borderRadius: 0 }} />
                        <span className="relative z-10">{unreadCount > 99 ? '99+' : unreadCount}</span>
                      </span>
                    )}
                  </button>

                  {notifMounted && (
                    <div className={`absolute right-0 top-full mt-2 w-80 bg-surface-2 border border-border shadow-2xl z-50 overflow-hidden ${notifLeaving ? 'nav-dropdown-out' : 'nav-dropdown-in'}`}>
                      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-subtle bg-surface-1">
                        <span className="text-xs font-mono text-text-hi">通知</span>
                        {unreadCount > 0 && (
                          <button onClick={markAllRead} className="text-[10px] font-mono text-text-lo hover:text-brand transition-colors">
                            全部已读
                          </button>
                        )}
                      </div>

                      <div className="max-h-[400px] overflow-y-auto">
                        {notifLoading && (
                          <div className="py-8 text-center text-text-lo font-mono text-xs animate-pulse">// 加载中...</div>
                        )}
                        {!notifLoading && notifications.length === 0 && (
                          <div className="py-8 text-center text-text-lo font-mono text-xs">// 暂无通知</div>
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
                              className={`w-full text-left px-4 py-3 border-b border-border-subtle last:border-0 transition-colors hover:bg-surface-2 ${!n.read ? 'bg-surface-2' : ''}`}
                            >
                              <div className="flex items-start gap-2.5">
                                <span className="flex-shrink-0 text-xs font-mono font-bold mt-0.5" style={{ color }}>[{icon}]</span>
                                <div className="flex-1 min-w-0">
                                  <p className={`text-xs font-mono leading-snug ${n.read ? 'text-text-body' : 'text-text-hi'}`}>
                                    {n.title}
                                  </p>
                                  {n.body && (
                                    <p className="text-[10px] text-text-lo mt-0.5 leading-relaxed line-clamp-2">{n.body}</p>
                                  )}
                                  <p className="text-[10px] text-text-lo mt-1 font-mono">
                                    {new Date(n.createdAt).toLocaleDateString('zh-CN')}
                                  </p>
                                </div>
                                {!n.read && (
                                  <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-brand mt-1.5" />
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
                        className="flex items-center gap-2 px-3 py-1.5 text-[15px] text-text-hi hover:text-brand border border-border hover:border-brand transition-all font-mono">
                        <User size={14} strokeWidth={1.5} className="text-brand" />
                        <span className="hidden sm:inline max-w-20 truncate">{user.nickname || user.username}</span>
                        <span
                          className="text-xs transition-transform duration-200"
                          style={{ display: 'inline-block', transform: showDropdown ? 'rotate(-180deg)' : 'rotate(0deg)' }}
                        >▼</span>
                      </button>

                      {dropdownMounted && (
                        <div className={`absolute right-0 top-full mt-2 w-52 bg-surface-2 border border-border shadow-xl overflow-hidden z-50 ${dropdownLeaving ? 'nav-dropdown-out' : 'nav-dropdown-in'}`}>
                          <div className="px-4 py-3 border-b border-border">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-mono text-text-hi">{user.nickname || user.username}</p>
                              {user.isFounder && (
                                <span className="text-[10px] font-mono px-1 py-0.5 border"
                                  style={{ color: '#f59e0b', borderColor: '#f59e0b50', background: '#f59e0b10' }}>
                                  ◆ FOUNDER
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-text-body truncate">@{user.username}</p>
                          </div>
                          <div className="py-1">
                            <a href={`/user/${user.id}`}
                              className="flex items-center gap-2 px-4 py-2 text-sm text-text-hi hover:text-brand hover:bg-surface-3 transition-colors font-mono"
                              onClick={() => setShowDropdown(false)}>
                              <LayoutDashboard size={14} strokeWidth={1.5} /> 我的主页
                            </a>
                            <a href={`/user/${user.id}?tab=settings`}
                              className="flex items-center gap-2 px-4 py-2 text-sm text-text-hi hover:text-brand hover:bg-surface-3 transition-colors font-mono"
                              onClick={() => setShowDropdown(false)}>
                              <Settings size={14} strokeWidth={1.5} /> 账号设置
                            </a>
                          </div>
                          <div className="border-t border-border py-1">
                            <a href="/api/auth/logout"
                              className="flex items-center gap-2 px-4 py-2 text-sm text-danger hover:bg-surface-3 transition-colors font-mono">
                              <LogOut size={14} strokeWidth={1.5} /> 退出登录
                            </a>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <button onClick={() => setShowLogin(true)}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm text-text-hi hover:text-brand border border-border hover:border-brand transition-all font-mono">
                      <Lock size={14} strokeWidth={1.5} />
                      <span className="hidden sm:inline">登录/注册</span>
                    </button>
                  )}
                </>
              )}

              {/* 移动端搜索图标 */}
              <button onClick={() => setShowSearch(true)}
                className="lg:hidden w-9 h-9 flex items-center justify-center text-text-body hover:text-brand transition-colors"
                aria-label="搜索">
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <circle cx="9" cy="9" r="6"/><path d="M13 13l4 4"/>
                </svg>
              </button>

              {/* 移动端汉堡 */}
              <button onClick={() => setShowMobileMenu(!showMobileMenu)}
                className="lg:hidden w-9 h-9 flex items-center justify-center text-text-body hover:text-brand transition-colors"
                aria-label="菜单">
                {showMobileMenu ? (
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M4 4l12 12M16 4L4 16"/>
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M3 6h14M3 10h14M3 14h14"/>
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* 移动端展开菜单 */}
        {showMobileMenu && (
          <div className="lg:hidden border-t border-border-subtle bg-surface-1/98 mobile-menu-animate">
            {allLinks.map(({ href, label }) => {
              const active = isActive(href);
              const isAnn = href === '/announcements';
              return (
                <a key={href} href={href}
                  className={`flex items-center gap-2 px-6 py-3.5 text-sm font-mono border-b border-border-subtle last:border-0 transition-colors ${
                    active
                      ? 'text-brand bg-brand/5'
                      : 'text-text-hi hover:text-brand hover:bg-brand/5'
                  }`}
                  onClick={() => setShowMobileMenu(false)}>
                  <span className={`text-xs font-mono w-3 ${active ? 'text-brand' : 'text-transparent'}`}>›</span>
                  {label}
                  {isAnn && hasNewAnnouncement && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-brand" />
                  )}
                </a>
              );
            })}
            {!loading && !user && (
              <button
                className="w-full flex items-center gap-2 px-6 py-3.5 text-sm text-text-hi hover:text-brand hover:bg-brand/5 font-mono transition-colors border-t border-border-subtle"
                onClick={() => { setShowMobileMenu(false); setShowLogin(true); }}>
                <Lock size={14} strokeWidth={1.5} /> 登录/注册
              </button>
            )}
          </div>
        )}
      </nav>

      {/* ── 移动端底部导航栏 ── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface-1/96 backdrop-blur-sm border-t border-border-subtle mobile-bottom-nav">
        <div className="flex items-stretch min-h-[64px]">
          {/* 首页 */}
          <a href="/" className={`flex-1 flex flex-col items-center justify-center gap-1 py-3.5 text-[10px] font-mono transition-colors ${isActive('/') ? 'text-brand' : 'text-text-body'}`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            首页
          </a>
          {/* 广场 */}
          <a href="/iceberg/list" className={`flex-1 flex flex-col items-center justify-center gap-1 py-3.5 text-[10px] font-mono transition-colors ${isActive('/iceberg/list') ? 'text-brand' : 'text-text-body'}`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
            </svg>
            广场
          </a>
          {/* 搜索 */}
          <button onClick={() => setShowSearch(true)} className="flex-1 flex flex-col items-center justify-center gap-1 py-3.5 text-[10px] font-mono text-text-body transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            搜索
          </button>
          {/* 机构 */}
          <a href="/org" className={`flex-1 flex flex-col items-center justify-center gap-1 py-3.5 text-[10px] font-mono transition-colors ${isActive('/org') ? 'text-brand' : 'text-text-body'}`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><line x1="9" y1="22" x2="9" y2="12"/><line x1="15" y1="22" x2="15" y2="12"/><line x1="12" y1="2" x2="12" y2="12"/>
            </svg>
            机构
          </a>
          {/* 我的 / 登录 */}
          {user ? (
            <a href={`/user/${user.id}`} className={`flex-1 flex flex-col items-center justify-center gap-1 py-3.5 text-[10px] font-mono transition-colors ${currentPath.startsWith('/user/') ? 'text-brand' : 'text-text-body'}`}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
              </svg>
              我的
            </a>
          ) : (
            <button onClick={() => setShowLogin(true)} className="flex-1 flex flex-col items-center justify-center gap-1 py-3.5 text-[10px] font-mono text-text-body transition-colors">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              登录/注册
            </button>
          )}
        </div>
      </nav>

      {/* ── 全局搜索覆盖层 ── */}
      {searchMounted && (
        <div
          className={`${searchLeaving ? 'modal-overlay-out' : 'modal-overlay'} search-modal-overlay fixed inset-0 z-[60] flex items-start justify-center pt-20 px-4`}
          onClick={() => setShowSearch(false)}
        >
          <div
            className={`${searchLeaving ? 'modal-content-out' : 'modal-content'} search-modal-panel w-full max-w-2xl shadow-2xl`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 搜索输入框 */}
            <div className="search-modal-header flex items-center gap-3 px-4 py-3 border-b">
              <svg className="text-brand flex-shrink-0" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <circle cx="9" cy="9" r="6"/><path d="M13 13l4 4"/>
              </svg>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="搜索冰山图..."
                className="search-modal-input flex-1 bg-transparent text-base focus:outline-none font-mono"
              />
              <button
                onClick={() => setShowSearch(false)}
                className="search-modal-close text-lg transition-colors font-mono"
                aria-label="关闭搜索"
              >
                ×
              </button>
            </div>

            {/* 搜索结果 */}
            <div className="search-modal-results max-h-[60vh] overflow-y-auto">
              {searchQuery.length < 2 && (
                <SearchQuickLinks onNavigate={() => setShowSearch(false)} />
              )}
              {searchLoading && (
                <div className="px-4 py-6 text-center text-text-body font-mono text-sm animate-pulse">
                  搜索中...
                </div>
              )}

              {!searchLoading && searchResults.length > 0 && searchResults.map((item, idx) => (
                <a
                  key={item.id}
                  href={`/iceberg/${item.slug || item.id}`}
                  className={`block px-4 py-3 border-b border-border-subtle last:border-0 transition-colors ${idx === searchIndex ? 'bg-brand/10 border-l-2 border-l-brand' : 'hover:bg-brand/5'}`}
                  onClick={() => setShowSearch(false)}
                  onMouseEnter={() => setSearchIndex(idx)}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-text-lo font-mono text-xs">#</span>
                    <span className={`text-sm font-mono ${idx === searchIndex ? 'text-brand' : 'text-text-hi'}`}>{item.title}</span>
                    {item._count && (
                      <span className="ml-auto text-xs text-text-lo font-mono">{item._count.tiers} 层</span>
                    )}
                  </div>
                  {item.description && (
                    <p className="text-xs text-text-body mt-1 truncate pl-4">{item.description}</p>
                  )}
                </a>
              ))}

              {!searchLoading && searchQuery.length >= 2 && searchResults.length === 0 && (
                <div className="px-4 py-8 text-center text-text-body font-mono text-sm">
                  未找到「{searchQuery}」相关的冰山图
                </div>
              )}

              {searchQuery.length < 2 && (
                <div className="px-4 py-4 text-center text-text-lo font-mono text-xs">
                  输入至少 2 个字符开始搜索
                </div>
              )}
            </div>

            {/* 底部提示 */}
            <div className="search-modal-footer px-4 py-2 border-t flex items-center justify-end gap-4 text-xs font-mono">
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
