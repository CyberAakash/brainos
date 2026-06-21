import { useState, useRef, useEffect, type ReactNode } from 'react';

export interface BreadcrumbItem {
  label: string;
  icon?: ReactNode;
  onClick?: () => void;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  /** Max visible items before collapsing middle ones (default: 4) */
  maxVisible?: number;
  /** Extra Tailwind classes */
  className?: string;
}

/**
 * Responsive breadcrumb navigation.
 * - Chevron separators
 * - Collapses middle items into "…" when too many
 * - Current page (last item) styled differently
 * - Home icon for first item
 */
export default function Breadcrumb({
  items,
  maxVisible = 4,
  className = '',
}: BreadcrumbProps) {
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Click outside to collapse
  useEffect(() => {
    if (!expanded) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [expanded]);

  const shouldCollapse = !expanded && items.length > maxVisible;
  const visibleItems = shouldCollapse
    ? [items[0], null, ...items.slice(-2)] // first, ellipsis, last 2
    : items;

  return (
    <nav
      ref={containerRef}
      aria-label="Breadcrumb"
      className={`flex items-center gap-1 text-sm ${className}`}
    >
      {visibleItems.map((item, i) => {
        const isLast = i === visibleItems.length - 1;

        // Ellipsis item
        if (item === null) {
          return (
            <div key="ellipsis" className="flex items-center gap-1">
              <button
                onClick={() => setExpanded(true)}
                className="
                  px-1.5 py-0.5 rounded text-text-muted
                  hover:bg-bg-input hover:text-text-secondary
                  transition-colors cursor-pointer text-xs
                "
                aria-label="Show all breadcrumbs"
              >
                •••
              </button>
              <Chevron />
            </div>
          );
        }

        return (
          <div key={i} className="flex items-center gap-1 min-w-0">
            {i === 0 && !item.icon && <HomeIcon />}
            {item.icon}
            {isLast ? (
              <span className="font-medium text-text-primary truncate">
                {item.label}
              </span>
            ) : (
              <button
                onClick={item.onClick}
                className="
                  text-text-muted hover:text-text-secondary
                  hover:underline transition-colors truncate
                  cursor-pointer
                "
              >
                {item.label}
              </button>
            )}
            {!isLast && <Chevron />}
          </div>
        );
      })}
    </nav>
  );
}

function Chevron() {
  return (
    <svg
      width="14" height="14" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round"
      className="text-text-faint shrink-0"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg
      width="14" height="14" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round"
      className="text-text-muted shrink-0 mr-0.5"
    >
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
    </svg>
  );
}
