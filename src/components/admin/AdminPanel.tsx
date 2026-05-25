import { useState, useRef, useEffect } from 'react';
import { AdminReviews } from './AdminReviews';
import { AdminUsers } from './AdminUsers';
import { AdminSettings } from './AdminSettings';
import { AdminAppeals } from './AdminAppeals';
import { AdminPromotions } from './AdminPromotions';
import { AdminReports } from './AdminReports';
import { AdminFeedback } from './AdminFeedback';
import { AdminAchievements } from './AdminAchievements';
import { AdminElections } from './AdminElections';
import { AdminAnnouncements } from './AdminAnnouncements';
import { AdminFeatureFlags } from './AdminFeatureFlags';

type AdminTab = 'reviews' | 'users' | 'settings' | 'appeals' | 'promotions' | 'reports' | 'feedback' | 'achievements' | 'elections' | 'announcements' | 'features';

interface Props {
  role: string;
  isFounder?: boolean;
}

const TABS: { id: AdminTab; label: string; code: string; minRole: string }[] = [
  { id: 'reviews',    label: '审核队列', code: 'REVIEWS',    minRole: 'EDITOR' },
  { id: 'promotions', label: '晋升申请', code: 'PROMOTIONS', minRole: 'EDITOR' },
  { id: 'reports',    label: '举报处理', code: 'REPORTS',    minRole: 'EDITOR' },
  { id: 'feedback',   label: '用户反馈', code: 'FEEDBACK',   minRole: 'EDITOR' },
  { id: 'users',      label: '用户管理', code: 'USERS',      minRole: 'ADMIN'  },
  { id: 'appeals',    label: '申诉处理', code: 'APPEALS',    minRole: 'ADMIN'  },
  { id: 'elections',  label: '站长选举', code: 'ELECTIONS',  minRole: 'ADMIN'  },
  { id: 'announcements', label: '公告发布', code: 'ANNOUNCE', minRole: 'ADMIN' },
  { id: 'achievements', label: '成就配置', code: 'ACHIEVEMENTS', minRole: 'ADMIN' },
  { id: 'settings',     label: '系统配置', code: 'SETTINGS',     minRole: 'ADMIN' },
  { id: 'features',     label: '功能开关', code: 'FEATURES',     minRole: 'ADMIN' },
];

export function AdminPanel({ role, isFounder }: Props) {
  const isAdmin = role === 'ADMIN' || isFounder;
  const visibleTabs = TABS.filter(t =>
    t.minRole === 'EDITOR'
      ? role === 'EDITOR' || isAdmin
      : isAdmin,
  );

  const [activeTab, setActiveTab] = useState<AdminTab>(visibleTabs[0]?.id ?? 'reviews');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft,  setCanScrollLeft]  = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  function updateArrows() {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }

  useEffect(() => {
    updateArrows();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateArrows, { passive: true });
    const ro = new ResizeObserver(updateArrows);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', updateArrows); ro.disconnect(); };
  }, []);

  function scrollBy(delta: number) {
    scrollRef.current?.scrollBy({ left: delta, behavior: 'smooth' });
  }

  return (
    <div>
      {/* 顶部状态栏 */}
      <div className="border border-border-subtle bg-surface-2 px-4 py-2 mb-4 flex items-center justify-between">
        <span className="text-[10px] font-mono text-text-mid tracking-widest">
          ADMIN CONSOLE — {role}
        </span>
        <span className="text-[10px] font-mono text-success">● SECURE</span>
      </div>

      {/* Tab 导航 */}
      <div className="relative flex items-end border-b border-border-subtle mb-6">
        {/* 左箭头 */}
        {canScrollLeft && (
          <button
            onClick={() => scrollBy(-160)}
            className="flex-shrink-0 px-2 pb-2.5 text-text-lo hover:text-text-body font-mono text-xs transition-colors"
            aria-label="向左滚动"
          >
            ‹
          </button>
        )}

        <div ref={scrollRef} className="flex overflow-x-auto scrollbar-none flex-1">
          {visibleTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-shrink-0 whitespace-nowrap px-4 py-2.5 text-xs font-mono transition-colors border-b-2 -mb-px ${
                activeTab === tab.id
                  ? 'border-brand text-brand'
                  : 'border-transparent text-text-lo hover:text-text-body'
              }`}
            >
              {tab.label}
              <span className="ml-1.5 opacity-30 text-[10px]">// {tab.code}</span>
            </button>
          ))}
        </div>

        {/* 右箭头 */}
        {canScrollRight && (
          <button
            onClick={() => scrollBy(160)}
            className="flex-shrink-0 px-2 pb-2.5 text-text-lo hover:text-text-body font-mono text-xs transition-colors"
            aria-label="向右滚动"
          >
            ›
          </button>
        )}
      </div>

      {/* 面板内容 */}
      {activeTab === 'reviews'    && <AdminReviews />}
      {activeTab === 'promotions' && <AdminPromotions />}
      {activeTab === 'reports'    && <AdminReports />}
      {activeTab === 'feedback'   && <AdminFeedback />}
      {activeTab === 'users'      && <AdminUsers />}
      {activeTab === 'appeals'      && <AdminAppeals />}
      {activeTab === 'elections'    && <AdminElections />}
      {activeTab === 'announcements' && <AdminAnnouncements />}
      {activeTab === 'achievements' && <AdminAchievements />}
      {activeTab === 'settings'     && <AdminSettings />}
      {activeTab === 'features'     && <AdminFeatureFlags />}
    </div>
  );
}
