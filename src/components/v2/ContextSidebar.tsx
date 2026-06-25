import React, { useMemo, useState, useCallback } from "react";
import { useStore } from "@/store";

/* ════════════════════════════════════════════════════════════════
   ContextSidebar — Explorer navigation for Browse mode
   Clean flat-list design with collapse/expand, "All captures" reset
   ════════════════════════════════════════════════════════════════ */

type SectionKey = "spaces" | "projects" | "tags";
const ALL_SECTIONS: SectionKey[] = ["spaces", "projects", "tags"];

export default function ContextSidebar() {
  const captures = useStore((s) => s.captures);
  const goBrowse = useStore((s) => s.goBrowse);
  const browseFilter = useStore((s) => s.browseFilter);
  const selectedTags = useStore((s) => s.selectedTags);
  const toggleTag = useStore((s) => s.toggleTag);
  const clearTags = useStore((s) => s.clearTags);
  const explorerSearch = useStore((s) => s.explorerSearch);
  const setExplorerSearch = useStore((s) => s.setExplorerSearch);

  // Section expand state
  const [expanded, setExpanded] = useState<Set<SectionKey>>(
    new Set(["spaces", "projects"])
  );

  const toggle = useCallback((key: SectionKey) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => setExpanded(new Set(ALL_SECTIONS)), []);
  const collapseAll = useCallback(() => setExpanded(new Set()), []);

  // Build explorer data — filtered by explorerSearch
  const data = useMemo(() => {
    const spaces: Record<string, number> = {};
    const projects: Record<string, number> = {};
    const tags: Record<string, number> = {};

    for (const c of captures) {
      if (c.status === "archived") continue; // exclude archived from sidebar counts
      spaces[c.space] = (spaces[c.space] || 0) + 1;
      for (const p of c.projects) projects[p] = (projects[p] || 0) + 1;
      for (const t of c.tags) tags[t] = (tags[t] || 0) + 1;
    }

    const q = explorerSearch.trim().toLowerCase();
    const filterEntries = (entries: [string, number][]) =>
      q ? entries.filter(([name]) => name.toLowerCase().includes(q)) : entries;

    return {
      spaces: filterEntries(Object.entries(spaces).sort(([a], [b]) => a.localeCompare(b))),
      projects: filterEntries(Object.entries(projects).sort(([a], [b]) => a.localeCompare(b))),
      tags: filterEntries(Object.entries(tags).sort((a, b) => b[1] - a[1])),
    };
  }, [captures, explorerSearch]);

  const isAllActive = browseFilter.kind === "all";
  const allExpanded = ALL_SECTIONS.every((s) => expanded.has(s));

  return (
    <div style={styles.root}>
      {/* Header row with expand/collapse all */}
      <div style={styles.header}>
        <span style={styles.headerLabel}>Explorer</span>
        <div style={styles.headerActions}>
          <button
            onClick={allExpanded ? collapseAll : expandAll}
            title={allExpanded ? "Collapse all" : "Expand all"}
            style={styles.headerBtn}
          >
            {allExpanded ? (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
                <path d="M4 6l4-3 4 3M4 10l4 3 4-3" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
                <path d="M4 4l4 3 4-3M4 12l4-3 4 3" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: "0 10px 6px" }}>
        <div style={styles.searchWrap}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="var(--text-dimmed)" strokeWidth="1.5" style={{ flexShrink: 0 }}>
            <circle cx="7" cy="7" r="4.5" /><line x1="10.2" y1="10.2" x2="14" y2="14" />
          </svg>
          <input
            type="text"
            placeholder="Filter spaces, projects, tags…"
            value={explorerSearch}
            onChange={(e) => setExplorerSearch(e.target.value)}
            style={styles.searchInput}
          />
          {explorerSearch && (
            <button onClick={() => setExplorerSearch("")} style={styles.searchClear}>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
                <line x1="2" y1="2" x2="8" y2="8" /><line x1="8" y1="2" x2="2" y2="8" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* All captures button */}
      <div style={{ padding: "0 10px 8px" }}>
        <button
          onClick={() => { goBrowse("all", null, "All captures"); clearTags(); }}
          style={{
            ...styles.allBtn,
            background: isAllActive && selectedTags.length === 0 ? "var(--accent-bg)" : "transparent",
            border: `1px solid ${isAllActive && selectedTags.length === 0 ? "var(--border-subtle)" : "transparent"}`,
            color: isAllActive && selectedTags.length === 0 ? "var(--accent-text)" : "var(--text-secondary)",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
            <rect x="2" y="2" width="5" height="5" rx="1" />
            <rect x="9" y="2" width="5" height="5" rx="1" />
            <rect x="2" y="9" width="5" height="5" rx="1" />
            <rect x="9" y="9" width="5" height="5" rx="1" />
          </svg>
          <span style={{ flex: 1 }}>All captures</span>
          <span style={styles.countBadge}>{captures.length}</span>
        </button>
      </div>

      {/* Scrollable sections */}
      <div style={styles.scrollArea}>
        {/* Spaces */}
        {data.spaces.length > 0 && (
          <NavSection
            title="Spaces"
            isOpen={expanded.has("spaces")}
            onToggle={() => toggle("spaces")}
          >
            {data.spaces.map(([space, count]) => {
              const active = browseFilter.kind === "space" && browseFilter.value === space;
              return (
                <NavItem
                  key={space}
                  label={space}
                  count={count}
                  active={active}
                  icon={<svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><path d="M2 3h3.5l1 1H12v7H2z" /></svg>}
                  onClick={() => goBrowse("space", space, `Space · ${space}`)}
                />
              );
            })}
          </NavSection>
        )}

        {/* Projects */}
        {data.projects.length > 0 && (
          <NavSection
            title="Projects"
            isOpen={expanded.has("projects")}
            onToggle={() => toggle("projects")}
          >
            {data.projects.map(([proj, count]) => {
              const active = browseFilter.kind === "project" && browseFilter.value === proj;
              return (
                <NavItem
                  key={proj}
                  label={proj}
                  count={count}
                  active={active}
                  icon={<svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><rect x="2" y="2.5" width="10" height="9" rx="1.5" /><line x1="2" y1="5.5" x2="12" y2="5.5" /></svg>}
                  onClick={() => goBrowse("project", proj, `Project · ${proj}`)}
                />
              );
            })}
          </NavSection>
        )}

        {/* Tags — multi-select */}
        {data.tags.length > 0 && (
          <NavSection
            title="Tags"
            isOpen={expanded.has("tags")}
            onToggle={() => toggle("tags")}
            action={selectedTags.length > 0 ? (
              <button onClick={clearTags} title="Clear tags" style={{
                border: "none", background: "transparent", cursor: "pointer",
                fontSize: 10, color: "var(--accent)", fontWeight: 500, padding: "0 2px",
                fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
              }}>clear</button>
            ) : undefined}
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, padding: "2px 8px 4px" }}>
              {data.tags.map(([tag, count]) => {
                const active = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    style={{
                      border: `1px solid ${active ? "var(--border-subtle)" : "var(--border)"}`,
                      background: active ? "var(--accent-bg)" : "var(--bg-elevated)",
                      color: active ? "var(--accent-text)" : "var(--text-secondary)",
                      borderRadius: 12, padding: "3px 9px",
                      fontSize: 11, fontWeight: active ? 500 : 400,
                      cursor: "pointer",
                      fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
                      transition: "all .12s",
                      display: "flex", alignItems: "center", gap: 4,
                    }}
                  >
                    {active && (
                      <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round">
                        <polyline points="1.5,5 4,7.5 8.5,2.5" />
                      </svg>
                    )}
                    {tag}
                    <span style={{ fontSize: 9.5, opacity: 0.6 }}>{count}</span>
                  </button>
                );
              })}
            </div>
          </NavSection>
        )}
      </div>
    </div>
  );
}

/* ── Collapsible section ── */
function NavSection({ title, isOpen, onToggle, children, action }: {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <button onClick={onToggle} style={{ ...styles.sectionBtn, flex: 1 }}>
          <svg
            width="10" height="10" viewBox="0 0 10 10" fill="none"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
            style={{ flexShrink: 0, transition: "transform .12s", transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }}
          >
            <polyline points="3,2 7,5 3,8" />
          </svg>
          <span style={styles.sectionTitle}>{title}</span>
        </button>
        {action && <span style={{ flexShrink: 0, paddingRight: 6 }}>{action}</span>}
      </div>
      {isOpen && <div style={{ paddingBottom: 4 }}>{children}</div>}
    </div>
  );
}

/* ── Single nav item ── */
function NavItem({ label, count, active, icon, onClick }: {
  label: string;
  count: number;
  active: boolean;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        width: "100%", border: "none",
        background: active ? "var(--accent-bg)" : (hovered ? "var(--bg-elevated)" : "transparent"),
        borderRadius: 6, padding: "5px 8px 5px 24px",
        cursor: "pointer", textAlign: "left",
        fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
        transition: "background .08s",
      }}
    >
      <span style={{ display: "flex", flexShrink: 0, color: active ? "var(--accent-text)" : "var(--text-muted)" }}>{icon}</span>
      <span style={{
        flex: 1, fontSize: 12.5,
        color: active ? "var(--accent-text)" : "var(--text-heading)",
        fontWeight: active ? 500 : 400,
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        textTransform: "capitalize",
      }}>
        {label}
      </span>
      <span style={{
        fontSize: 10,
        color: active ? "var(--accent)" : "var(--text-dimmed)",
        fontFamily: "ui-monospace, Menlo, monospace",
        flexShrink: 0,
      }}>{count}</span>
    </button>
  );
}

/* ════════════════════════════════════════════════════════════════
   Styles
   ════════════════════════════════════════════════════════════════ */
const styles: Record<string, React.CSSProperties> = {
  root: {
    width: "100%", height: "100%", background: "var(--bg-surface)",
    display: "flex", flexDirection: "column",
    boxSizing: "border-box",
  },

  header: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "12px 14px 6px",
    flexShrink: 0,
  },

  headerLabel: {
    fontSize: 11, fontWeight: 600, letterSpacing: ".04em",
    textTransform: "uppercase" as const, color: "var(--text-faint)",
  },

  headerActions: {
    display: "flex", alignItems: "center", gap: 2,
  },

  headerBtn: {
    display: "flex", alignItems: "center", justifyContent: "center",
    width: 26, height: 26, border: "none", background: "transparent",
    borderRadius: 6, cursor: "pointer", color: "var(--text-faint)",
    transition: "background .1s",
    padding: 0,
  },

  allBtn: {
    display: "flex", alignItems: "center", gap: 8,
    width: "100%", borderRadius: 8, padding: "7px 10px",
    cursor: "pointer", textAlign: "left" as const,
    fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
    fontSize: 12.5, fontWeight: 500,
    transition: "all .12s",
  },

  countBadge: {
    fontSize: 10, fontWeight: 600,
    fontFamily: "ui-monospace, Menlo, monospace",
    opacity: 0.7,
  },

  searchWrap: {
    display: "flex", alignItems: "center", gap: 7,
    background: "var(--bg-elevated)", border: "1px solid var(--border)",
    borderRadius: 8, padding: "5px 9px",
  },

  searchInput: {
    border: "none", outline: "none", background: "transparent",
    fontSize: 12, color: "var(--text-primary)", flex: 1, minWidth: 0,
    fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
  } as React.CSSProperties,

  searchClear: {
    display: "flex", border: "none", background: "transparent",
    color: "var(--text-dimmed)", cursor: "pointer", padding: 2,
  },

  scrollArea: {
    flex: 1, overflowY: "auto" as const,
    padding: "4px 10px 16px",
  },

  sectionBtn: {
    display: "flex", alignItems: "center", gap: 6,
    width: "100%", border: "none", background: "transparent",
    borderRadius: 6, padding: "5px 6px",
    cursor: "pointer", textAlign: "left" as const,
    fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
    transition: "background .08s",
  },

  sectionTitle: {
    fontSize: 10.5, fontWeight: 600, letterSpacing: ".03em",
    textTransform: "uppercase" as const, color: "var(--text-faint)",
  },
};
