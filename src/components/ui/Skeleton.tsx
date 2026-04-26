/** 单条骨架行 */
export function SkeletonLine({ width = 'full', height = 'h-3' }: { width?: string; height?: string }) {
  return (
    <div
      className={`${height} bg-[#1a1d24] rounded-sm animate-pulse w-${width === 'full' ? 'full' : width}`}
      style={width !== 'full' && !width.startsWith('w-') ? { width } : undefined}
    />
  );
}

/** 管理后台列表骨架：n 行卡片 */
export function AdminListSkeleton({ rows = 4, cols = 1 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="border border-[#1a1d24] bg-[#161b22] p-4 space-y-2.5">
          {cols === 1 ? (
            <>
              <div className="flex items-center justify-between gap-4">
                <div className="h-3.5 bg-[#1a1d24] rounded-sm animate-pulse w-1/3" style={{ animationDelay: `${i * 60}ms` }} />
                <div className="flex gap-2">
                  <div className="h-7 w-14 bg-[#1a1d24] rounded-sm animate-pulse" style={{ animationDelay: `${i * 60 + 30}ms` }} />
                  <div className="h-7 w-14 bg-[#1a1d24] rounded-sm animate-pulse" style={{ animationDelay: `${i * 60 + 60}ms` }} />
                </div>
              </div>
              <div className="h-2.5 bg-[#1a1d24] rounded-sm animate-pulse w-2/3" style={{ animationDelay: `${i * 60 + 20}ms` }} />
              <div className="flex gap-3">
                <div className="h-2 bg-[#1a1d24] rounded-sm animate-pulse w-16" style={{ animationDelay: `${i * 60 + 40}ms` }} />
                <div className="h-2 bg-[#1a1d24] rounded-sm animate-pulse w-20" style={{ animationDelay: `${i * 60 + 50}ms` }} />
                <div className="h-2 bg-[#1a1d24] rounded-sm animate-pulse w-12" style={{ animationDelay: `${i * 60 + 55}ms` }} />
              </div>
            </>
          ) : (
            <div className={`grid grid-cols-${cols} gap-3`}>
              {Array.from({ length: cols }).map((_, j) => (
                <div key={j} className="h-3 bg-[#1a1d24] rounded-sm animate-pulse" style={{ animationDelay: `${(i * cols + j) * 40}ms` }} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
