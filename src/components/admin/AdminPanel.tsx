import { useState, useRef, useEffect } from 'react';
import { AdminReviews } from './AdminReviews';
import { AdminUsers } from './AdminUsers';
import { AdminSettings } from './AdminSettings';
import { AdminAppeals } from './AdminAppeals';
import { AdminReports } from './AdminReports';
import { AdminFeedback } from './AdminFeedback';
import { AdminAchievements } from './AdminAchievements';
import { AdminAnnouncements } from './AdminAnnouncements';
import { AdminFeatureFlags } from './AdminFeatureFlags';
import { AdminSeo } from './AdminSeo';
import { AdminCapabilities } from './AdminCapabilities';

type AdminTab = 'reviews' | 'users' | 'settings' | 'appeals' | 'reports' | 'feedback' | 'achievements' | 'announcements' | 'features' | 'seo' | 'capabilities';

interface Props {
  isFounder?: boolean;
  capabilities?: string[];
}

const TABS: { id: AdminTab; label: string; code: string; capability: string }[] = [
  { id: 'reviews', label: '审核队列', code: 'REVIEWS', capability: 'PUBLICATION_REVIEW' },
  { id: 'reports', label: '举报处理', code: 'REPORTS', capability: 'COMMUNITY_MODERATION' },
  { id: 'appeals', label: '申诉处理', code: 'APPEALS', capability: 'COMMUNITY_MODERATION' },
  { id: 'users', label: '用户管理', code: 'USERS', capability: 'COMMUNITY_MODERATION' },
  { id: 'feedback', label: '用户反馈', code: 'FEEDBACK', capability: 'CONTENT_CURATION' },
  { id: 'capabilities', label: '能力与审计', code: 'CAPABILITIES', capability: 'SITE_ADMINISTRATION' },
  { id: 'announcements', label: '公告发布', code: 'ANNOUNCE', capability: 'SITE_ADMINISTRATION' },
  { id: 'achievements', label: '成就配置', code: 'ACHIEVEMENTS', capability: 'SITE_ADMINISTRATION' },
  { id: 'settings', label: '系统配置', code: 'SETTINGS', capability: 'SITE_ADMINISTRATION' },
  { id: 'features', label: '功能开关', code: 'FEATURES', capability: 'SITE_ADMINISTRATION' },
  { id: 'seo', label: 'SEO', code: 'SEO_META', capability: 'SITE_ADMINISTRATION' },
];

export function AdminPanel({ isFounder, capabilities = [] }: Props) {
  const visibleTabs = TABS.filter((tab) =>
    isFounder || capabilities.includes(tab.capability));

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
    let ro: ResizeObserver | null = null;
    if (typeof window.ResizeObserver === 'function') {
      ro = new ResizeObserver(updateArrows);
      ro.observe(el);
    } else {
      window.addEventListener('resize', updateArrows);
    }
    return () => {
      el.removeEventListener('scroll', updateArrows);
      window.removeEventListener('resize', updateArrows);
      ro?.disconnect();
    };
  }, []);

  function scrollBy(delta: number) {
    const el = scrollRef.current;
    if (!el) return;
    try {
      el.scrollBy({ left: delta, behavior: 'smooth' });
    } catch {
      el.scrollLeft += delta;
    }
  }

  return (
    <div>
      {/* 顶部状态栏 */}
      <div className="border border-border-subtle bg-surface-2 px-4 py-2 mb-4 flex items-center justify-between">
        <span className="text-[10px] font-mono text-text-mid tracking-widest">
          RESPONSIBILITY CONSOLE — {capabilities.length} ACTIVE
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
      {activeTab === 'reports'    && <AdminReports />}
      {activeTab === 'feedback'   && <AdminFeedback />}
      {activeTab === 'users'      && <AdminUsers />}
      {activeTab === 'appeals'      && <AdminAppeals />}
      {activeTab === 'capabilities' && <AdminCapabilities isFounder={isFounder} />}
      {activeTab === 'announcements' && <AdminAnnouncements />}
      {activeTab === 'achievements' && <AdminAchievements isFounder={isFounder} />}
      {activeTab === 'settings'     && <AdminSettings />}
      {activeTab === 'features'     && <AdminFeatureFlags />}
      {activeTab === 'seo'          && <AdminSeo />}
    </div>
  );
}
