import { useEffect, useState, useRef } from "react";
import { useStore, getTypeMeta } from "@/store";
import { api } from "@/lib/ipc";
import type { Capture, CaptureStatus } from "@/lib/ipc";
import CanvasMarkdown from "./CanvasMarkdown";

/* ── Parse markdown body into blocks ── */
interface BodyBlock {
  kind: "heading" | "paragraph" | "code";
  content: string;
  lang?: string;
}

function parseBody(text: string): BodyBlock[] {
  if (!text) return [];
  const blocks: BodyBlock[] = [];
  const parts = text.split(/(```[\s\S]*?```)/g);
  for (const part of parts) {
    if (part.startsWith("```")) {
      const nl = part.indexOf("\n");
      const lang = nl > 3 ? part.slice(3, nl).trim() : "";
      const code = nl > -1 ? part.slice(nl + 1).replace(/```$/, "") : part.slice(3).replace(/```$/, "");
      blocks.push({ kind: "code", content: code.trimEnd(), lang });
    } else {
      for (const p of part.split(/\n\n+/)) {
        const t = p.trim();
        if (!t) continue;
        if (/^#{1,4}\s/.test(t)) blocks.push({ kind: "heading", content: t.replace(/^#{1,4}\s+/, "") });
        else blocks.push({ kind: "paragraph", content: t });
      }
    }
  }
  return blocks;
}

/* ── Render parsed blocks ── */
/* ── Toolbar icon button helper ── */
function TBtn({ title, onClick, children, active, style: extra }: {
  title: string; onClick: () => void; children: React.ReactNode;
  active?: boolean; style?: React.CSSProperties;
}) {
  return (
    <button
      title={title} onClick={onClick}
      style={{
        width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center",
        border: "none", background: active ? "#EFEAE0" : "transparent",
        color: active ? "#4A463E" : "#8C887E", borderRadius: 7, cursor: "pointer", flexShrink: 0,
        ...extra,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "#EFEAE0"; e.currentTarget.style.color = "#4A463E"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = active ? "#EFEAE0" : "transparent"; e.currentTarget.style.color = active ? "#4A463E" : "#8C887E"; }}
    >{children}</button>
  );
}

/* ════════════════════════════════════════════════════════════ */

export default function DetailPanel() {
  const detailOpen = useStore((s) => s.detailOpen);
  const selectedId = useStore((s) => s.selectedId);
  const closeDetail = useStore((s) => s.closeDetail);
  const loadCapture = useStore((s) => s.loadCapture);
  const captureCache = useStore((s) => s.captureCache);
  const attach = useStore((s) => s.attach);
  const bookmark = useStore((s) => s.bookmark);
  const unbookmark = useStore((s) => s.unbookmark);
  const bookmarks = useStore((s) => s.bookmarks);
  const deleteCapture = useStore((s) => s.deleteCapture);
  const openDetail = useStore((s) => s.openDetail);
  const showToast = useStore((s) => s.showToast);
  const setMainMode = useStore((s) => s.setMainMode);

  const [capture, setCapture] = useState<Capture | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"preview" | "edit">("preview");
  const [editBody, setEditBody] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editTagInput, setEditTagInput] = useState("");
  const [copied, setCopied] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [addingTag, setAddingTag] = useState(false);
  const [newTagValue, setNewTagValue] = useState("");
  const titleRef = useRef<HTMLDivElement>(null);

  // Load capture data
  useEffect(() => {
    if (!selectedId || !detailOpen) { setCapture(null); return; }
    const cached = captureCache[selectedId];
    if (cached) { setCapture(cached); return; }
    setLoading(true);
    loadCapture(selectedId).then((r) => { setCapture(r); setLoading(false); });
  }, [selectedId, detailOpen, captureCache, loadCapture]);

  // Reset state when capture changes
  useEffect(() => {
    setTab("preview");
    setEditBody("");
    setCopied(false);
    setShowDeleteConfirm(false);
    setAddingTag(false);
    setFullscreen(false);
  }, [selectedId]);


  if (!detailOpen) return null;

  const meta = capture ? getTypeMeta(capture.capture_type) : null;
  const bodyBlocks = capture ? parseBody(capture.body_text) : [];

  const handleCopy = () => {
    if (!capture) return;
    navigator.clipboard.writeText(capture.body_text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const handleSave = async () => {
    if (!capture) return;
    try {
      // Rebuild full markdown with frontmatter (including v2 fields)
      const fmLines = [
        "---",
        `id: "${capture.id}"`,
        `title: "${editTitle.replace(/"/g, '\\"')}"`,
        `type: ${capture.capture_type}`,
        `space: ${capture.space}`,
        `status: ${capture.status}`,
        `date: ${capture.date}`,
      ];
      if (capture.summary) fmLines.push(`summary: "${capture.summary.replace(/"/g, '\\"')}"`);
      if (capture.project_info) {
        fmLines.push("project:");
        fmLines.push(`  name: "${capture.project_info.name}"`);
        if (capture.project_info.path) fmLines.push(`  path: "${capture.project_info.path}"`);
      }
      if (capture.git_info) {
        fmLines.push("git:");
        if (capture.git_info.repo) fmLines.push(`  repo: "${capture.git_info.repo}"`);
        if (capture.git_info.branch) fmLines.push(`  branch: "${capture.git_info.branch}"`);
        if (capture.git_info.remote) fmLines.push(`  remote: "${capture.git_info.remote}"`);
      }
      if (capture.chain) {
        fmLines.push("chain:");
        if (capture.chain.prev) fmLines.push(`  prev: "${capture.chain.prev}"`);
        if (capture.chain.refs.length > 0) fmLines.push(`  refs: [${capture.chain.refs.map((r) => `"${r}"`).join(", ")}]`);
      }
      if (capture.links && capture.links.length > 0) {
        fmLines.push("links:");
        for (const link of capture.links) {
          fmLines.push(`  - url: "${link.url}"`);
          if (link.label) fmLines.push(`    label: "${link.label}"`);
        }
      }
      fmLines.push(`tags: [${editTags.map((t) => `"${t}"`).join(", ")}]`);
      if (capture.projects.length > 0) fmLines.push(`projects: [${capture.projects.map((p) => `"${p}"`).join(", ")}]`);
      if (capture.related.length > 0) fmLines.push(`related: [${capture.related.map((r) => `"${r}"`).join(", ")}]`);
      if (capture.files.length > 0) fmLines.push(`files: [${capture.files.map((f) => `"${f}"`).join(", ")}]`);
      fmLines.push("---", "");
      const fullContent = fmLines.join("\n") + editBody;
      const updated = await api.saveCaptureContent(capture.id, fullContent);
      setCapture(updated);
      setTab("preview");
      showToast("Changes saved");
    } catch { showToast("Save failed"); }
  };

  const handleAttachToChat = () => {
    if (!capture) return;
    attach(capture.id);
    closeDetail();
    setMainMode("home");
    showToast("Attached to chat context");
  };

  /* ── Shared toolbar ── */
  const toolbar = (
    <div style={{
      flex: "none", display: "flex", alignItems: "center", gap: 4,
      padding: "7px 12px", borderBottom: "1px solid #E9E5DC", background: "#FAF8F3",
    }}>
      {/* File label */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0, overflow: "hidden" }}>
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="#8C887E" strokeWidth="1.3">
          <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
          <line x1="5" y1="6" x2="11" y2="6" /><line x1="5" y1="8.5" x2="9" y2="8.5" />
        </svg>
        <span style={{ fontSize: 12.5, fontWeight: 500, color: "#21201C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {capture?.title ?? "…"}
        </span>
        <span style={{ fontSize: 11, color: "#A8A194", flexShrink: 0 }}>· MD</span>
      </div>

      {/* Preview / Edit toggle */}
      <div style={{ display: "inline-flex", background: "#EFEAE0", borderRadius: 7, padding: 2, gap: 1 }}>
        <TBtn title="Preview" onClick={() => setTab("preview")} active={tab === "preview"}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8s-2.5 4.5-6.5 4.5S1.5 8 1.5 8z" /><circle cx="8" cy="8" r="2" />
          </svg>
        </TBtn>
        <TBtn title="Edit" onClick={() => { if (tab !== "edit" && capture) { setEditBody(capture.body_text); setEditTitle(capture.title); setEditTags([...capture.tags]); } setTab("edit"); }} active={tab === "edit"}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="5,4 1.5,8 5,12" /><polyline points="11,4 14.5,8 11,12" /><line x1="9.5" y1="3" x2="6.5" y2="13" />
          </svg>
        </TBtn>
      </div>

      <div style={{ width: 1, height: 16, background: "#E3DED3" }} />

      {/* Copy */}
      <TBtn title="Copy markdown" onClick={handleCopy}>
        {copied ? (
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="#5F8C5A" strokeWidth="1.8" strokeLinecap="round"><polyline points="3.5,8.5 6.5,11.5 12.5,4.5" /></svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><rect x="5" y="5" width="8" height="8" rx="1.5" /><path d="M3 11V3.5A1.5 1.5 0 014.5 2H11" /></svg>
        )}
      </TBtn>

      {/* Attach to chat */}
      <button
        title="Attach to chat context"
        onClick={handleAttachToChat}
        style={{
          display: "flex", alignItems: "center", gap: 4,
          border: "1px solid #E7E1D6", background: "#FFFFFF", color: "#56524A",
          borderRadius: 7, padding: "4px 9px", fontSize: 11.5, fontWeight: 500, cursor: "pointer", flexShrink: 0,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#CDA18C"; e.currentTarget.style.background = "#FBF3EE"; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#E7E1D6"; e.currentTarget.style.background = "#FFFFFF"; }}
      >
        <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M3.5 2h7v10l-3.5-2.4L3.5 12Z" /></svg>
        Attach
      </button>

      <div style={{ width: 1, height: 16, background: "#E3DED3" }} />

      {/* Fullscreen toggle */}
      <TBtn title={fullscreen ? "Exit fullscreen" : "Fullscreen"} onClick={() => setFullscreen(!fullscreen)}>
        {fullscreen ? (
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><polyline points="6,2 6,6 2,6" /><polyline points="10,14 10,10 14,10" /></svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><polyline points="10,2 14,2 14,6" /><polyline points="6,14 2,14 2,10" /></svg>
        )}
      </TBtn>

      {/* Close */}
      <TBtn title="Close" onClick={() => { closeDetail(); setFullscreen(false); }}>
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <line x1="4" y1="4" x2="12" y2="12" /><line x1="12" y1="4" x2="4" y2="12" />
        </svg>
      </TBtn>
    </div>
  );

  const statusColors: Record<CaptureStatus, { bg: string; fg: string }> = {
    draft: { bg: "#F2EDE3", fg: "#8C887E" },
    active: { bg: "#E0EDDE", fg: "#4A6B45" },
    resolved: { bg: "#DDE6F0", fg: "#3F5A7A" },
  };

  /* ── Meta section (shown in preview tab) ── */
  const metaSection = capture && meta && (
    <div style={{ padding: "20px 20px 0" }}>
      {/* Title */}
      <div
        ref={titleRef} contentEditable suppressContentEditableWarning
        style={{
          fontFamily: "'Newsreader',Georgia,serif", fontSize: fullscreen ? 26 : 23,
          fontWeight: 500, lineHeight: 1.25, color: "#21201C", outline: "none",
          borderRadius: 6, padding: "2px 4px", margin: "-2px -4px",
        }}
        onFocus={(e) => { e.currentTarget.style.background = "#F3EFE6"; e.currentTarget.style.boxShadow = "0 0 0 2px #E3D8C6"; }}
        onBlur={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.boxShadow = "none"; }}
      >{capture.title}</div>

      {/* Summary */}
      {capture.summary && (
        <div style={{ fontSize: 13.5, color: "#6B6459", lineHeight: 1.45, marginTop: 8, fontStyle: "italic" }}>
          {capture.summary}
        </div>
      )}

      {/* Badges */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "none", borderRadius: 7, padding: "5px 10px", fontSize: "12.5px", fontWeight: 600, background: meta.bg, color: meta.fg }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: meta.dot }} />{capture.capture_type}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", border: "1px solid #E7E1D6", background: "#FBFAF6", borderRadius: 7, padding: "5px 10px", fontSize: "12.5px", color: "#56524A" }}>{capture.space}</span>
        <span style={{ display: "inline-flex", alignItems: "center", background: statusColors[capture.status]?.bg ?? "#F2EDE3", borderRadius: 7, padding: "5px 10px", fontSize: "12.5px", fontWeight: 500, color: statusColors[capture.status]?.fg ?? "#8C887E" }}>{capture.status}</span>
        <span style={{ display: "inline-flex", alignItems: "center", background: "#F2EDE3", borderRadius: 7, padding: "5px 10px", fontSize: "12.5px", color: "#8C887E" }}>{capture.date}</span>
      </div>

      {/* Project info */}
      {capture.project_info && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10 }}>
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="#9A958A" strokeWidth="1.3"><path d="M2 3.5h10M2 3.5v7a1 1 0 001 1h8a1 1 0 001-1v-7M5 1.5h4l1 2H4l1-2z" /></svg>
          <span style={{ fontSize: 12.5, color: "#56524A", fontWeight: 500 }}>{capture.project_info.name}</span>
          {capture.project_info.path && <span style={{ fontSize: 11.5, color: "#A09A8C", fontFamily: "ui-monospace,Menlo,monospace" }}>{capture.project_info.path}</span>}
        </div>
      )}

      {/* Git info */}
      {capture.git_info && (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginTop: 8 }}>
          {capture.git_info.branch && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "#6B6459", fontFamily: "ui-monospace,Menlo,monospace", background: "#F2EDE3", borderRadius: 5, padding: "3px 8px" }}>
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3"><circle cx="3" cy="3" r="1.5" /><circle cx="9" cy="9" r="1.5" /><path d="M3 4.5v2c0 1.4 1.1 2.5 2.5 2.5H7.5" /></svg>
              {capture.git_info.branch}
            </span>
          )}
          {capture.git_info.repo && (
            <span style={{ fontSize: 12, color: "#8C887E" }}>{capture.git_info.repo}</span>
          )}
        </div>
      )}

      {/* Tags */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 14 }}>
        {capture.tags.map((tag) => (
          <span key={tag} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#F2EDE3", borderRadius: 6, padding: "4px 8px", fontFamily: "ui-monospace,Menlo,monospace", fontSize: 12, color: "#6B6459" }}>
            {tag}
            <button
              style={{ display: "flex", border: "none", background: "transparent", color: "#B3AE9F", cursor: "pointer", padding: 0 }}
              onClick={() => showToast(`Remove tag "${tag}" (not yet implemented)`)}
              onMouseEnter={(e) => { e.currentTarget.style.color = "#8A4A38"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "#B3AE9F"; }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="2.5" y1="2.5" x2="7.5" y2="7.5" /><line x1="7.5" y1="2.5" x2="2.5" y2="7.5" /></svg>
            </button>
          </span>
        ))}
        {addingTag ? (
          <input autoFocus value={newTagValue} onChange={(e) => setNewTagValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && newTagValue.trim()) { showToast("Tag added (save not implemented)"); setNewTagValue(""); setAddingTag(false); } else if (e.key === "Escape") { setNewTagValue(""); setAddingTag(false); } }}
            onBlur={() => { if (newTagValue.trim()) showToast("Tag added (save not implemented)"); setNewTagValue(""); setAddingTag(false); }}
            placeholder="tag name"
            style={{ display: "inline-flex", border: "1px solid #BD6A47", borderRadius: 6, padding: "3px 8px", fontSize: 12, fontFamily: "ui-monospace,Menlo,monospace", color: "#21201C", background: "#FFFFFF", outline: "none", width: 90 }}
          />
        ) : (
          <button
            onClick={() => setAddingTag(true)}
            style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "transparent", border: "1px dashed #D8D1C2", borderRadius: 6, padding: "4px 8px", fontSize: 12, color: "#B3AE9F", cursor: "pointer" }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#BD6A47"; e.currentTarget.style.color = "#BD6A47"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#D8D1C2"; e.currentTarget.style.color = "#B3AE9F"; }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4"><line x1="5" y1="2" x2="5" y2="8" /><line x1="2" y1="5" x2="8" y2="5" /></svg>
            Add tag
          </button>
        )}
      </div>

      {/* Action buttons */}
      {showDeleteConfirm ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 18, background: "#FDF5F0", border: "1px solid #E8C4B2", borderRadius: 10, padding: "12px 16px" }}>
          <span style={{ fontSize: 13, color: "#56524A", fontWeight: 500 }}>Delete this capture?</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setShowDeleteConfirm(false)} style={{ border: "1px solid #E7E1D6", background: "#FFFFFF", color: "#56524A", borderRadius: 8, padding: "5px 14px", fontSize: "12.5px", cursor: "pointer" }}>Cancel</button>
            <button onClick={() => { deleteCapture(capture!.id); setShowDeleteConfirm(false); }} style={{ border: "1px solid #BD6A47", background: "#BD6A47", color: "#FFFFFF", borderRadius: 8, padding: "5px 14px", fontSize: "12.5px", cursor: "pointer", fontWeight: 600 }}>Delete</button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
          {(() => {
            const isBm = bookmarks.includes(capture.id);
            return (
              <button
                onClick={() => isBm ? unbookmark(capture.id) : bookmark(capture.id)}
                style={{ display: "flex", alignItems: "center", gap: 6, border: "1px solid #E7E1D6", background: isBm ? "#F6E9E1" : "#FFFFFF", color: isBm ? "#9A4F30" : "#56524A", borderRadius: 8, padding: "6px 12px", fontSize: "12.5px", cursor: "pointer" }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#CDA18C"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#E7E1D6"; }}
              >
                <svg width="13" height="13" viewBox="0 0 14 14" fill={isBm ? "#BD6A47" : "none"} stroke={isBm ? "#BD6A47" : "#9A847A"} strokeWidth="1.3"><path d="M3.5 2h7v10l-3.5-2.4L3.5 12Z" /></svg>
                {isBm ? "Bookmarked" : "Bookmark"}
              </button>
            );
          })()}
          <button
            onClick={() => { attach(capture.id); showToast("Attached to chat"); }}
            style={{ display: "flex", alignItems: "center", gap: 6, border: "1px solid #E7E1D6", background: "#FFFFFF", color: "#56524A", borderRadius: 8, padding: "6px 12px", fontSize: "12.5px", cursor: "pointer" }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#D8D1C2"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#E7E1D6"; }}
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4"><line x1="7" y1="2.5" x2="7" y2="11.5" /><line x1="2.5" y1="7" x2="11.5" y2="7" /></svg>
            Attach
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            style={{ display: "flex", alignItems: "center", gap: 6, border: "1px solid #E7E1D6", background: "#FFFFFF", color: "#BD6A47", borderRadius: 8, padding: "6px 12px", fontSize: "12.5px", cursor: "pointer" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#FDF5F0"; e.currentTarget.style.borderColor = "#E8C4B2"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "#FFFFFF"; e.currentTarget.style.borderColor = "#E7E1D6"; }}
          >
            Delete
          </button>
        </div>
      )}

      <div style={{ height: 1, background: "#EBE6DC", margin: "22px 0 0" }} />
    </div>
  );

  /* ── Related / Chain / Links / Files (shown in preview) ── */
  const relatedSection = capture && (
    <>
      {/* Chain navigation */}
      {capture.chain && (capture.chain.prev || capture.chain.refs.length > 0) && (
        <div style={{ marginTop: 24, padding: "0 20px" }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase", color: "#A09A8C", marginBottom: 8 }}>Chain</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {capture.chain.prev && (
              <button onClick={() => openDetail(capture.chain!.prev!)}
                style={{ textAlign: "left", display: "flex", alignItems: "center", gap: 8, background: "transparent", border: "none", cursor: "pointer", padding: "4px 0", fontSize: "13px", color: "#56524A" }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "#BD6A47"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "#56524A"; }}
              >
                <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4"><polyline points="9,3 5,7 9,11" /></svg>
                <span style={{ fontSize: 11, color: "#A09A8C", marginRight: 2 }}>prev</span>
                {capture.chain.prev}
              </button>
            )}
            {capture.chain.refs.map((refId) => (
              <button key={refId} onClick={() => openDetail(refId)}
                style={{ textAlign: "left", display: "flex", alignItems: "center", gap: 8, background: "transparent", border: "none", cursor: "pointer", padding: "4px 0", fontSize: "13px", color: "#56524A" }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "#BD6A47"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "#56524A"; }}
              >
                <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4"><polyline points="5,3 9,7 5,11" /></svg>
                <span style={{ fontSize: 11, color: "#A09A8C", marginRight: 2 }}>ref</span>
                {refId}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Links */}
      {capture.links && capture.links.length > 0 && (
        <div style={{ marginTop: 18, padding: "0 20px" }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase", color: "#A09A8C", marginBottom: 8 }}>Links</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {capture.links.map((link, i) => (
              <a key={i} href={link.url} target="_blank" rel="noopener noreferrer"
                style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#56524A", textDecoration: "none", overflow: "hidden" }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "#BD6A47"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "#56524A"; }}
              >
                <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" style={{ flexShrink: 0 }}><path d="M6 8l2-2M4.5 9.5l-1 1a2 2 0 002.83 2.83l1-1M7.67 4.67l1-1a2 2 0 012.83 2.83l-1 1" /></svg>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{link.label || link.url}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {capture.related.length > 0 && (
        <div style={{ marginTop: 18, padding: "0 20px" }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase", color: "#A09A8C", marginBottom: 8 }}>Related captures</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {capture.related.map((relId) => (
              <button key={relId} onClick={() => openDetail(relId)}
                style={{ textAlign: "left", display: "flex", alignItems: "center", gap: 8, background: "transparent", border: "none", cursor: "pointer", padding: "4px 0", fontSize: "13.5px", color: "#56524A" }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "#BD6A47"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "#56524A"; }}
              >
                <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4"><polyline points="5,3 9,7 5,11" /></svg>
                {relId}
              </button>
            ))}
          </div>
        </div>
      )}
      {capture.files.length > 0 && (
        <div style={{ marginTop: 18, padding: "0 20px" }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase", color: "#A09A8C", marginBottom: 8 }}>Files</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {capture.files.map((file) => (
              <span key={file} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#F2EDE3", borderRadius: 6, padding: "4px 9px", fontSize: 12, color: "#6B6459", fontFamily: "ui-monospace,Menlo,monospace" }}>
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M3 1.5h4l2.5 2.5V10a1 1 0 01-1 1H3a1 1 0 01-1-1V2.5A1 1 0 013 1.5z" /><polyline points="6.5,1.5 6.5,4.5 9.5,4.5" /></svg>
                {file}
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  );

  /* ── Edit metadata fields (title + tags) ── */
  const editMetaFields = (large?: boolean) => (
    <div style={{ padding: large ? "20px 24px 0" : "16px 18px 0", borderBottom: "1px solid #3A3730" }}>
      {/* Title */}
      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase" as const, color: "#8C887E", marginBottom: 4, display: "block" }}>Title</label>
        <input
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          style={{
            width: "100%", border: "1px solid #3A3730", background: "#33302B", color: "#E8E4DB",
            borderRadius: 7, padding: "8px 10px", fontSize: large ? 15 : 13.5,
            fontFamily: "'Newsreader',Georgia,serif", outline: "none", boxSizing: "border-box",
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = "#BD6A47"; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = "#3A3730"; }}
        />
      </div>
      {/* Tags */}
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase" as const, color: "#8C887E", marginBottom: 4, display: "block" }}>Tags</label>
        <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 5, alignItems: "center" }}>
          {editTags.map((tag) => (
            <span key={tag} style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              background: "#3A3730", borderRadius: 5, padding: "3px 8px",
              fontSize: 12, color: "#D0CBBD", fontFamily: "ui-monospace,Menlo,monospace",
            }}>
              {tag}
              <button
                onClick={() => setEditTags((prev) => prev.filter((t) => t !== tag))}
                style={{ display: "flex", border: "none", background: "transparent", color: "#8C887E", cursor: "pointer", padding: 0 }}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="2.5" y1="2.5" x2="7.5" y2="7.5" /><line x1="7.5" y1="2.5" x2="2.5" y2="7.5" /></svg>
              </button>
            </span>
          ))}
          <input
            value={editTagInput}
            onChange={(e) => setEditTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && editTagInput.trim()) {
                const t = editTagInput.trim();
                if (!editTags.includes(t)) setEditTags((prev) => [...prev, t]);
                setEditTagInput("");
              } else if (e.key === "Backspace" && !editTagInput && editTags.length > 0) {
                setEditTags((prev) => prev.slice(0, -1));
              }
            }}
            placeholder="add tag…"
            style={{
              border: "none", background: "transparent", color: "#D0CBBD", outline: "none",
              fontSize: 12, fontFamily: "ui-monospace,Menlo,monospace", width: 80, padding: "3px 0",
            }}
          />
        </div>
      </div>
    </div>
  );

  /* ══════════════════════════════════════════════════════════ */
  /* Fullscreen mode — fixed overlay, content centered         */
  /* ══════════════════════════════════════════════════════════ */
  if (fullscreen) {
    return (
      <div style={{
        position: "absolute", inset: 0, zIndex: 55, background: "#FCFBF7",
        display: "flex", flexDirection: "column", animation: "fadeIn 0.12s ease",
      }}>
        {toolbar}

        {tab === "preview" ? (
          <div style={{ flex: 1, overflowY: "auto", display: "flex", justifyContent: "center", padding: "32px 24px 48px" }}>
            <div style={{ maxWidth: 800, width: "100%" }}>
              {metaSection && <div style={{ marginBottom: 22 }}>{metaSection}</div>}
              <div style={{ padding: "0 20px" }}>
                <CanvasMarkdown blocks={bodyBlocks} large />
              </div>
              {relatedSection}
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "#2B2823" }}>
            {editMetaFields(true)}
            <textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} spellCheck={false}
              style={{ flex: 1, border: "none", outline: "none", resize: "none", fontFamily: "ui-monospace,Menlo,'Cascadia Code',monospace", fontSize: 13.5, lineHeight: 1.6, color: "#E8E4DB", background: "#2B2823", padding: "20px 24px", boxSizing: "border-box" }}
            />
            <div style={{ flex: "none", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, padding: "8px 14px", borderTop: "1px solid #E9E5DC", background: "#FAF8F3" }}>
              <span style={{ flex: 1, fontSize: 12, color: "#A8A194" }}>Editing raw markdown</span>
              <button onClick={() => { if (capture) { setEditBody(capture.body_text); setEditTitle(capture.title); setEditTags([...capture.tags]); } setTab("preview"); }}
                style={{ border: "1px solid #E7E1D6", background: "#FFFFFF", color: "#56524A", borderRadius: 8, padding: "5px 14px", fontSize: 12.5, cursor: "pointer" }}>Cancel</button>
              <button onClick={handleSave}
                style={{ border: "none", background: "#BD6A47", color: "#FFFFFF", borderRadius: 8, padding: "5px 16px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", boxShadow: "0 1px 4px rgba(120,60,30,.25)" }}>Save</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════ */
  /* Normal mode — floating panel on right, on top of content  */
  /* ══════════════════════════════════════════════════════════ */
  return (
    <div
      className="animate-slideInRight"
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        width: 440,
        maxWidth: "92%",
        zIndex: 45,
        background: "#FCFBF7",
        borderLeft: "1px solid #E7E3DA",
        boxShadow: "-12px 0 40px rgba(40,36,28,.14)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {toolbar}

      {loading && (
        <div style={{ fontSize: 13, color: "#9A958A", padding: "20px" }}>Loading...</div>
      )}

      {tab === "preview" ? (
        <div style={{ flex: 1, overflowY: "auto", paddingBottom: 28 }}>
          {metaSection}
          <div style={{ padding: "0 20px" }}>
            <CanvasMarkdown blocks={bodyBlocks} />
          </div>
          {relatedSection}
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "#2B2823" }}>
          {editMetaFields()}
          <textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} spellCheck={false}
            style={{ flex: 1, border: "none", outline: "none", resize: "none", fontFamily: "ui-monospace,Menlo,'Cascadia Code',monospace", fontSize: 13, lineHeight: 1.6, color: "#E8E4DB", background: "#2B2823", padding: "16px 18px", boxSizing: "border-box" }}
          />
          <div style={{ flex: "none", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, padding: "8px 12px", borderTop: "1px solid #E9E5DC", background: "#FAF8F3" }}>
            <span style={{ flex: 1, fontSize: 12, color: "#A8A194" }}>Editing raw markdown</span>
            <button onClick={() => { if (capture) { setEditBody(capture.body_text); setEditTitle(capture.title); setEditTags([...capture.tags]); } setTab("preview"); }}
              style={{ border: "1px solid #E7E1D6", background: "#FFFFFF", color: "#56524A", borderRadius: 8, padding: "5px 14px", fontSize: 12.5, cursor: "pointer" }}>Cancel</button>
            <button onClick={handleSave}
              style={{ border: "none", background: "#BD6A47", color: "#FFFFFF", borderRadius: 8, padding: "5px 16px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", boxShadow: "0 1px 4px rgba(120,60,30,.25)" }}>Save</button>
          </div>
        </div>
      )}
    </div>
  );
}
