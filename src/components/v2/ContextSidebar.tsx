import React, { useMemo, useState } from "react";
import { useStore, getTypeMeta } from "@/store";
import type { CaptureOverview } from "@/lib/ipc";

/* ────── helpers ────── */

interface KBRow {
  kind: "space" | "tag" | "type" | "project";
  value: string;
  label: string;
  dot: string;
  count: number;
}

function buildKBTree(captures: CaptureOverview[]) {
  const spaces: Record<string, number> = {};
  const tags: Record<string, number> = {};
  const types: Record<string, number> = {};
  const projects: Record<string, number> = {};

  for (const c of captures) {
    spaces[c.space] = (spaces[c.space] || 0) + 1;
    types[c.capture_type] = (types[c.capture_type] || 0) + 1;
    for (const t of c.tags) tags[t] = (tags[t] || 0) + 1;
    for (const p of c.projects) projects[p] = (projects[p] || 0) + 1;
  }

  const toRows = (
    kind: KBRow["kind"],
    map: Record<string, number>,
    dotFn: (k: string) => string,
  ): KBRow[] =>
    Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => ({
        kind,
        value: k,
        label: k,
        dot: dotFn(k),
        count: v,
      }));

  return {
    sections: [
      { heading: "Spaces", rows: toRows("space", spaces, () => "#7C7468") },
      { heading: "Projects", rows: toRows("project", projects, () => "#6A9389") },
      { heading: "Types", rows: toRows("type", types, (k) => getTypeMeta(k).dot) },
    ],
    tagRows: toRows("tag", tags, () => "#BD6A47"),
  };
}

/* ────── component ────── */

export default function ContextSidebar() {
  const collapsed = useStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const attached = useStore((s) => s.attached);
  const bookmarks = useStore((s) => s.bookmarks);
  const suggested = useStore((s) => s.suggested);
  const captures = useStore((s) => s.captures);
  const detach = useStore((s) => s.detach);
  const unbookmark = useStore((s) => s.unbookmark);
  const attachFromSuggest = useStore((s) => s.attachFromSuggest);
  const dismissSuggest = useStore((s) => s.dismissSuggest);
  const openDetail = useStore((s) => s.openDetail);
  const goBrowse = useStore((s) => s.goBrowse);

  const captureMap = useMemo(() => {
    const m: Record<string, CaptureOverview> = {};
    for (const c of captures) m[c.id] = c;
    return m;
  }, [captures]);

  const kbData = useMemo(() => buildKBTree(captures), [captures]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => {
      const next = prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag];
      if (next.length > 0) {
        goBrowse("tag", next.join(","), `Tags · ${next.join(", ")}`);
      }
      return next;
    });
  };

  /* ── collapsed view ── */
  if (collapsed) {
    return (
      <div style={styles.collapsedRoot}>
        <button
          onClick={toggleSidebar}
          title="Context & bookmarks"
          style={styles.collapsedBtn}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 14 14"
            fill="currentColor"
          >
            <path d="M3.5 2h7v10l-3.5-2.4L3.5 12Z" />
          </svg>
          {(attached.length + bookmarks.length) > 0 && (
            <span style={styles.badge}>{attached.length + bookmarks.length}</span>
          )}
        </button>

        <button
          onClick={toggleSidebar}
          title="Knowledge base"
          style={styles.collapsedBtn}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <rect x="2" y="2.5" width="5" height="5" rx="1" />
            <rect x="9" y="2.5" width="5" height="5" rx="1" />
            <rect x="2" y="9" width="5" height="5" rx="1" />
            <rect x="9" y="9" width="5" height="5" rx="1" />
          </svg>
        </button>

      </div>
    );
  }

  /* ── expanded view ── */
  return (
    <div style={styles.expandedRoot}>
      {/* Bookmarks (persistent) */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <span style={styles.sectionLabel}>Bookmarks</span>
          <span style={styles.sectionCount}>{bookmarks.length}</span>
        </div>
        <div style={styles.chipList}>
          {bookmarks.length === 0 && (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 3px",
            }}>
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="#A09A8C" strokeWidth="1.4">
                <path d="M3.5 2h7v10l-3.5-2.4L3.5 12Z" />
              </svg>
              <span style={{ fontSize: 12, color: "#A09A8C" }}>
                Bookmark captures for quick access
              </span>
            </div>
          )}
          {bookmarks.map((id) => {
            const c = captureMap[id];
            const meta = c ? getTypeMeta(c.capture_type) : getTypeMeta("config");
            return (
              <div key={id} style={styles.chip}>
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    flexShrink: 0,
                    background: meta.dot,
                    boxShadow: `0 0 0 3px ${meta.glow}`,
                  }}
                />
                <span
                  onClick={() => openDetail(id)}
                  style={styles.chipTitle}
                >
                  {c?.title ?? id}
                </span>
                <button onClick={() => unbookmark(id)} style={styles.chipRemove}>
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                  >
                    <line x1="3" y1="3" x2="9" y2="9" />
                    <line x1="9" y1="3" x2="3" y2="9" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Attached context (per-chat, ephemeral) */}
      {attached.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <span style={styles.sectionLabel}>Attached</span>
            <span style={styles.sectionCount}>{attached.length}</span>
          </div>
          <div style={styles.chipList}>
            {attached.map((id) => {
              const c = captureMap[id];
              const meta = c ? getTypeMeta(c.capture_type) : getTypeMeta("config");
              return (
                <div key={id} style={styles.chip}>
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      flexShrink: 0,
                      background: meta.dot,
                    }}
                  />
                  <span
                    onClick={() => openDetail(id)}
                    style={styles.chipTitle}
                  >
                    {c?.title ?? id}
                  </span>
                  <button onClick={() => detach(id)} style={styles.chipRemove}>
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 12 12"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    >
                      <line x1="3" y1="3" x2="9" y2="9" />
                      <line x1="9" y1="3" x2="3" y2="9" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Auto-suggested */}
      {suggested.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <span style={styles.sectionLabel}>Auto-suggested</span>
          </div>
          <div style={styles.chipList}>
            {suggested.map((id) => {
              const c = captureMap[id];
              const meta = c
                ? getTypeMeta(c.capture_type)
                : getTypeMeta("config");
              return (
                <div key={id} style={styles.suggestChip}>
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      flexShrink: 0,
                      background: meta.dot,
                    }}
                  />
                  <span
                    onClick={() => openDetail(id)}
                    style={styles.suggestTitle}
                  >
                    {c?.title ?? id}
                  </span>
                  <button
                    onClick={() => attachFromSuggest(id)}
                    title="Attach"
                    style={styles.suggestAction}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 14 14"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    >
                      <line x1="7" y1="2.5" x2="7" y2="11.5" />
                      <line x1="2.5" y1="7" x2="11.5" y2="7" />
                    </svg>
                  </button>
                  <button
                    onClick={() => dismissSuggest(id)}
                    title="Dismiss"
                    style={styles.chipRemove}
                  >
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 12 12"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    >
                      <line x1="3" y1="3" x2="9" y2="9" />
                      <line x1="9" y1="3" x2="3" y2="9" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Knowledge Base tree */}
      <div style={styles.kbSection}>
        <div style={styles.sectionHeader}>
          <span style={styles.sectionLabel}>Knowledge base</span>
        </div>

        {/* Spaces → Projects → Types */}
        {kbData.sections.map((sec) => (
          <div key={sec.heading} style={{ marginTop: 10 }}>
            <div style={styles.kbHeading}>{sec.heading}</div>
            {sec.rows.map((row) => (
              <button
                key={`${row.kind}-${row.value}`}
                onClick={() => goBrowse(row.kind, row.value, `${sec.heading} · ${row.label}`)}
                style={styles.kbRow}
              >
                <span style={{ width: 6, height: 6, borderRadius: 2, flexShrink: 0, background: row.dot }} />
                <span style={styles.kbLabel}>{row.label}</span>
                <span style={styles.kbCount}>{row.count}</span>
              </button>
            ))}
          </div>
        ))}

        {/* Tags — flex-wrap chips with multi-select */}
        {kbData.tagRows.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={styles.kbHeading}>Tags</div>
            <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 5, padding: "2px 3px" }}>
              {kbData.tagRows.map((row) => {
                const active = selectedTags.includes(row.value);
                return (
                  <button
                    key={row.value}
                    onClick={() => toggleTag(row.value)}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 5,
                      border: active ? "1px solid #CDA18C" : "1px solid #E7E1D6",
                      background: active ? "#F6E9E1" : "#FBFAF6",
                      color: active ? "#9A4F30" : "#6B6459",
                      borderRadius: 7, padding: "4px 9px", fontSize: 11.5,
                      cursor: "pointer", fontFamily: "ui-monospace, Menlo, monospace",
                      transition: "all .12s ease",
                    }}
                  >
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: active ? "#BD6A47" : "#BD6A47", opacity: active ? 1 : 0.5 }} />
                    {row.label}
                    <span style={{ fontSize: 10, color: active ? "#BD6A47" : "#B7B1A4", marginLeft: 1 }}>{row.count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ────── inline styles ────── */

const styles: Record<string, React.CSSProperties> = {
  /* ── collapsed ── */
  collapsedRoot: {
    width: 52,
    flexShrink: 0,
    background: "#FAF8F3",
    borderRight: "1px solid #E9E5DC",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
    padding: "12px 0",
    transition: "width .2s ease",
  },
  collapsedBtn: {
    position: "relative" as const,
    width: 36,
    height: 36,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "none",
    background: "transparent",
    color: "#7C7468",
    borderRadius: 9,
    cursor: "pointer",
  },
  badge: {
    position: "absolute" as const,
    top: 3,
    right: 3,
    width: 14,
    height: 14,
    borderRadius: "50%",
    background: "#BD6A47",
    color: "#fff",
    fontSize: 9,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },

  /* ── expanded ── */
  expandedRoot: {
    width: 240,
    flexShrink: 0,
    background: "#FAF8F3",
    borderRight: "1px solid #E9E5DC",
    display: "flex",
    flexDirection: "column",
    overflowY: "auto" as const,
    transition: "width .2s ease",
  },

  /* ── sections ── */
  section: {
    padding: "10px 12px 14px",
  },
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 3px 8px",
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: ".05em",
    textTransform: "uppercase" as const,
    color: "#A09A8C",
  },
  sectionCount: {
    fontSize: 11,
    color: "#B7B1A4",
  },

  /* ── pinned chips ── */
  chipList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 5,
  },
  chip: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "#FFFFFF",
    border: "1px solid #ECE7DC",
    borderRadius: 9,
    padding: "8px 9px",
  },
  chipTitle: {
    flex: 1,
    fontSize: 13,
    color: "#3F3B33",
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
    cursor: "pointer",
  },
  chipRemove: {
    display: "flex",
    border: "none",
    background: "transparent",
    color: "#BBB5A8",
    cursor: "pointer",
    padding: 0,
  },

  /* ── suggested chips ── */
  suggestChip: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    border: "1px solid #ECE7DC",
    borderRadius: 9,
    padding: "8px 9px",
    opacity: 0.78,
  },
  suggestTitle: {
    flex: 1,
    fontSize: 13,
    color: "#56524A",
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
    cursor: "pointer",
  },
  suggestAction: {
    display: "flex",
    border: "none",
    background: "transparent",
    color: "#A8A096",
    cursor: "pointer",
    padding: 0,
  },

  /* ── KB tree ── */
  kbSection: {
    padding: "0 12px 18px",
  },
  kbHeading: {
    fontSize: 11.5,
    color: "#9A958A",
    fontWeight: 600,
    padding: "0 3px 3px",
  },
  kbRow: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    width: "100%",
    border: "none",
    background: "transparent",
    borderRadius: 7,
    padding: "5px 8px",
    cursor: "pointer",
    textAlign: "left" as const,
  },
  kbLabel: {
    flex: 1,
    fontSize: 13,
    color: "#56524A",
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  kbCount: {
    fontSize: 11,
    color: "#B7B1A4",
    fontFamily: "ui-monospace, Menlo, monospace",
  },
};
