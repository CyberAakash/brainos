interface SkeletonProps {
  /** Width (Tailwind class or custom). Default: 'w-full' */
  width?: string;
  /** Height (Tailwind class or custom). Default: 'h-4' */
  height?: string;
  /** Border radius. Default: 'rounded' */
  rounded?: string;
  /** Extra Tailwind classes */
  className?: string;
}

/**
 * Shimmer placeholder for loading states.
 * Uses CSS gradient animation for the shimmer effect.
 */
export function Skeleton({
  width = 'w-full',
  height = 'h-4',
  rounded = 'rounded',
  className = '',
}: SkeletonProps) {
  return (
    <div
      className={`skeleton ${width} ${height} ${rounded} ${className}`}
      aria-hidden="true"
    />
  );
}

/**
 * Card skeleton — avatar + image area + text lines.
 * Drop-in replacement for a capture card while loading.
 */
export function CardSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`bg-bg-card rounded-xl border border-border p-4 ${className}`}>
      {/* Header: dot + title */}
      <div className="flex items-center gap-3 mb-3">
        <Skeleton width="w-3" height="h-3" rounded="rounded-full" />
        <Skeleton width="w-2/3" height="h-4" />
      </div>
      {/* Body lines */}
      <div className="space-y-2 mb-3">
        <Skeleton height="h-3" />
        <Skeleton height="h-3" width="w-5/6" />
        <Skeleton height="h-3" width="w-3/4" />
      </div>
      {/* Tags row */}
      <div className="flex gap-2">
        <Skeleton width="w-16" height="h-5" rounded="rounded-full" />
        <Skeleton width="w-12" height="h-5" rounded="rounded-full" />
        <Skeleton width="w-20" height="h-5" rounded="rounded-full" />
      </div>
    </div>
  );
}

/**
 * Table row skeleton for the data table loading state.
 */
export function TableRowSkeleton({ columns = 5 }: { columns?: number }) {
  const widths = ['w-1/3', 'w-16', 'w-20', 'w-24', 'w-16'];
  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b border-border-light">
      {Array.from({ length: columns }).map((_, i) => (
        <Skeleton
          key={i}
          width={widths[i] || 'w-20'}
          height="h-3.5"
          className="shrink-0"
        />
      ))}
    </div>
  );
}

/**
 * Multiple table row skeletons for list loading.
 */
export function TableSkeleton({ rows = 8, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRowSkeleton key={i} columns={columns} />
      ))}
    </div>
  );
}
