export function AdminAnnouncements() {
  return (
    <div className="space-y-5">
      <div className="border border-border-subtle bg-surface-2 p-4">
        <div className="text-[10px] font-mono text-text-mid tracking-widest mb-2">
          // CHANGELOG PUBLISH
        </div>
        <p className="text-xs font-mono text-text-body leading-relaxed mb-4">
          更新日志来源于公告类型：`更新 / 维护 / 注意`。点击下面按钮可直接进入对应发布表单。
        </p>
        <div className="flex flex-wrap gap-2">
          <a
            href="/changelog/manage?create=1&type=update"
            className="px-3 py-1.5 text-xs font-mono border border-info/25 text-info hover:bg-info/10 transition-colors"
          >
            发布功能更新
          </a>
          <a
            href="/changelog/manage?create=1&type=maintenance"
            className="px-3 py-1.5 text-xs font-mono border border-warning/25 text-warning hover:bg-warning/10 transition-colors"
          >
            发布维护调整
          </a>
          <a
            href="/changelog/manage?create=1&type=warning"
            className="px-3 py-1.5 text-xs font-mono border border-danger/25 text-danger hover:bg-danger/10 transition-colors"
          >
            发布风险提示
          </a>
        </div>
      </div>

      <div className="border border-border-subtle bg-surface-2 p-4">
        <div className="text-[10px] font-mono text-text-mid tracking-widest mb-2">
          // QUICK LINKS
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href="/announcements"
            className="px-3 py-1.5 text-xs font-mono border border-border text-text-body hover:text-brand hover:border-brand transition-colors"
          >
            打开公告管理
          </a>
          <a
            href="/changelog/manage"
            className="px-3 py-1.5 text-xs font-mono border border-border text-text-body hover:text-brand hover:border-brand transition-colors"
          >
            打开日志管理
          </a>
          <a
            href="/changelog"
            className="px-3 py-1.5 text-xs font-mono border border-border text-text-body hover:text-brand hover:border-brand transition-colors"
          >
            查看更新日志页
          </a>
        </div>
      </div>
    </div>
  );
}
