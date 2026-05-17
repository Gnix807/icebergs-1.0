export function AdminAnnouncements() {
  return (
    <div className="space-y-5">
      <div className="border border-[#21262d] bg-[#161b22] p-4">
        <div className="text-[10px] font-mono text-[#6e7681] tracking-widest mb-2">
          // CHANGELOG PUBLISH
        </div>
        <p className="text-xs font-mono text-[#8b949e] leading-relaxed mb-4">
          更新日志来源于公告类型：`更新 / 维护 / 注意`。点击下面按钮可直接进入对应发布表单。
        </p>
        <div className="flex flex-wrap gap-2">
          <a
            href="/changelog/manage?create=1&type=update"
            className="px-3 py-1.5 text-xs font-mono border border-[#3b82f640] text-[#3b82f6] hover:bg-[#3b82f610] transition-colors"
          >
            发布功能更新
          </a>
          <a
            href="/changelog/manage?create=1&type=maintenance"
            className="px-3 py-1.5 text-xs font-mono border border-[#f59e0b40] text-[#f59e0b] hover:bg-[#f59e0b10] transition-colors"
          >
            发布维护调整
          </a>
          <a
            href="/changelog/manage?create=1&type=warning"
            className="px-3 py-1.5 text-xs font-mono border border-[#ef444440] text-[#ef4444] hover:bg-[#ef444410] transition-colors"
          >
            发布风险提示
          </a>
        </div>
      </div>

      <div className="border border-[#21262d] bg-[#161b22] p-4">
        <div className="text-[10px] font-mono text-[#6e7681] tracking-widest mb-2">
          // QUICK LINKS
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href="/announcements"
            className="px-3 py-1.5 text-xs font-mono border border-[#30363d] text-[#8b949e] hover:text-[#00FF41] hover:border-[#00FF41] transition-colors"
          >
            打开公告管理
          </a>
          <a
            href="/changelog/manage"
            className="px-3 py-1.5 text-xs font-mono border border-[#30363d] text-[#8b949e] hover:text-[#00FF41] hover:border-[#00FF41] transition-colors"
          >
            打开日志管理
          </a>
          <a
            href="/changelog"
            className="px-3 py-1.5 text-xs font-mono border border-[#30363d] text-[#8b949e] hover:text-[#00FF41] hover:border-[#00FF41] transition-colors"
          >
            查看更新日志页
          </a>
        </div>
      </div>
    </div>
  );
}
