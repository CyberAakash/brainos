import React, { useState, useEffect, useCallback } from "react";
import { useStore, getTypeMeta, TYPE_META } from "@/store";
import type { CaptureStatus } from "@/lib/ipc";

/* ────── NewCaptureModal ────── */

const TYPE_KEYS = Object.keys(TYPE_META);
const SPACES = ["work", "personal"] as const;
const STATUSES: CaptureStatus[] = ["draft", "active", "resolved"];

export default function NewCaptureModal() {
  const newOpen = useStore((s) => s.newOpen);
  const closeNew = useStore((s) => s.closeNew);
  const createCapture = useStore((s) => s.createCapture);
  const showToast = useStore((s) => s.showToast);

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [type, setType] = useState("learning");
  const [space, setSpace] = useState<"work" | "personal">("work");
  const [status, setStatus] = useState<CaptureStatus>("draft");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [body, setBody] = useState("");
  const [customTypeInput, setCustomTypeInput] = useState(false);
  const [customType, setCustomType] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectPath, setProjectPath] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Reset form when modal opens
  useEffect(() => {
    if (newOpen) {
      setTitle("");
      setSummary("");
      setType("learning");
      setSpace("work");
      setStatus("draft");
      setTags([]);
      setTagInput("");
      setBody("");
      setCustomTypeInput(false);
      setCustomType("");
      setProjectName("");
      setProjectPath("");
      setShowAdvanced(false);
    }
  }, [newOpen]);

  // Escape to close
  useEffect(() => {
    if (!newOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeNew();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [newOpen, closeNew]);

  const addTag = useCallback(() => {
    let t = tagInput.trim();
    if (!t) return;
    if (!t.startsWith("#")) t = "#" + t;
    t = t.slice(1); // store without #
    if (t && !tags.includes(t)) {
      setTags((prev) => [...prev, t]);
    }
    setTagInput("");
  }, [tagInput, tags]);

  const handleTagKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addTag();
      } else if (e.key === "Backspace" && tagInput === "" && tags.length > 0) {
        setTags((prev) => prev.slice(0, -1));
      }
    },
    [addTag, tagInput, tags],
  );

  const confirmCustomType = useCallback(() => {
    const trimmed = customType.trim().toLowerCase();
    if (trimmed) {
      setType(trimmed);
    }
    setCustomTypeInput(false);
    setCustomType("");
  }, [customType]);

  const handleCustomTypeKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        confirmCustomType();
      } else if (e.key === "Escape") {
        e.preventDefault();
        setCustomTypeInput(false);
        setCustomType("");
      }
    },
    [confirmCustomType],
  );

  const handleCreate = useCallback(async () => {
    if (!title.trim()) {
      showToast("Add a title first");
      return;
    }
    const opts: any = {};
    if (summary.trim()) opts.summary = summary.trim();
    if (status !== "draft") opts.status = status;
    if (projectName.trim()) opts.projectName = projectName.trim();
    if (projectPath.trim()) opts.projectPath = projectPath.trim();
    await createCapture(title.trim(), space, type, tags, body, Object.keys(opts).length ? opts : undefined);
  }, [title, summary, space, type, status, tags, body, projectName, projectPath, createCapture, showToast]);

  if (!newOpen) return null;

  return (
    <div style={S.backdrop} onClick={closeNew}>
      <div style={S.dialog} onClick={(e) => e.stopPropagation()}>
        {/* ── Header ── */}
        <div style={S.header}>
          <div style={S.headerLeft}>
            <span style={S.headerDot} />
            <span style={S.headerTitle}>New capture</span>
          </div>
          <button style={S.closeBtn} onClick={closeNew}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <line x1="4" y1="4" x2="12" y2="12" />
              <line x1="12" y1="4" x2="4" y2="12" />
            </svg>
          </button>
        </div>

        {/* ── Title ── */}
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Untitled capture"
          style={S.titleInput}
          autoFocus
        />

        {/* ── Summary ── */}
        <input
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="One-line summary (optional)"
          style={S.summaryInput}
        />

        {/* ── Type selector ── */}
        <label style={S.fieldLabel}>TYPE</label>
        <div style={S.pillRow}>
          {TYPE_KEYS.map((t) => {
            const m = getTypeMeta(t);
            const active = type === t;
            return (
              <button
                key={t}
                onClick={() => setType(t)}
                style={{
                  ...S.typePill,
                  background: active ? m.bg : "#F0EBE1",
                  color: active ? m.fg : "#8C887E",
                  boxShadow: active ? `0 0 0 1.5px ${m.dot}` : "none",
                }}
              >
                <span style={{ ...S.pillDot, background: active ? m.dot : "#C4BFAE" }} />
                {t}
              </button>
            );
          })}

          {/* Show custom type as a selected pill if it's not one of the built-in types */}
          {!TYPE_KEYS.includes(type) && type !== "learning" && (
            (() => {
              const m = getTypeMeta(type);
              return (
                <button
                  key={type}
                  onClick={() => setType(type)}
                  style={{
                    ...S.typePill,
                    background: m.bg,
                    color: m.fg,
                    boxShadow: `0 0 0 1.5px ${m.dot}`,
                  }}
                >
                  <span style={{ ...S.pillDot, background: m.dot }} />
                  {type}
                </button>
              );
            })()
          )}

          {/* + button / inline custom type input */}
          {customTypeInput ? (
            <input
              value={customType}
              onChange={(e) => setCustomType(e.target.value)}
              onKeyDown={handleCustomTypeKeyDown}
              onBlur={confirmCustomType}
              placeholder="type name"
              autoFocus
              style={S.customTypeInput}
            />
          ) : (
            <button
              onClick={() => setCustomTypeInput(true)}
              style={S.addTypePill}
              title="Add custom type"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <line x1="6" y1="1" x2="6" y2="11" />
                <line x1="1" y1="6" x2="11" y2="6" />
              </svg>
            </button>
          )}
        </div>

        {/* ── Space + Status ── */}
        <div style={S.twoCol}>
          <div>
            <label style={S.fieldLabel}>SPACE</label>
            <div style={S.segmentedRow}>
              {SPACES.map((s) => (
                <button
                  key={s}
                  onClick={() => setSpace(s)}
                  style={{
                    ...S.segmentBtn,
                    ...(space === s ? S.segmentActive : S.segmentInactive),
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={S.fieldLabel}>STATUS</label>
            <div style={S.segmentedRow}>
              {STATUSES.map((st) => (
                <button
                  key={st}
                  onClick={() => setStatus(st)}
                  style={{
                    ...S.segmentBtn,
                    ...(status === st ? S.segmentActive : S.segmentInactive),
                  }}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Tags ── */}
        <label style={S.fieldLabel}>TAGS</label>
        <div style={S.tagsContainer}>
          {tags.map((t) => (
            <span key={t} style={S.tagChip}>
              #{t}
              <button
                style={S.tagRemove}
                onClick={() => setTags((prev) => prev.filter((x) => x !== t))}
              >
                &times;
              </button>
            </span>
          ))}
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={handleTagKeyDown}
            onBlur={addTag}
            placeholder={tags.length === 0 ? "Add tag, press Enter" : ""}
            style={S.tagTextInput}
          />
        </div>

        {/* ── Advanced (project, path) ── */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          style={S.advancedToggle}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ transform: showAdvanced ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>
            <polyline points="3,1 7,5 3,9" />
          </svg>
          Project &amp; context
        </button>
        {showAdvanced && (
          <div style={S.advancedSection}>
            <div style={S.twoCol}>
              <div style={{ flex: 1 }}>
                <label style={S.fieldLabel}>PROJECT NAME</label>
                <input
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="e.g. brainos"
                  style={S.textInput}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={S.fieldLabel}>PROJECT PATH</label>
                <input
                  value={projectPath}
                  onChange={(e) => setProjectPath(e.target.value)}
                  placeholder="/path/to/project"
                  style={S.textInput}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Body ── */}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write your capture…"
          style={S.bodyTextarea}
        />

        {/* ── Footer ── */}
        <div style={S.footer}>
          <span style={S.footerHint}>Saved to your knowledge base</span>
          <div style={S.footerBtns}>
            <button style={S.cancelBtn} onClick={closeNew}>
              Cancel
            </button>
            <button style={S.createBtn} onClick={handleCreate}>
              Create capture
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ────── Styles ────── */

const S: Record<string, React.CSSProperties> = {
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.35)",
    zIndex: 50,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    animation: "fadeIn 0.12s ease",
  },
  dialog: {
    width: 540,
    background: "#FFFFFF",
    borderRadius: 16,
    padding: 28,
    boxShadow: "0 20px 60px rgba(0,0,0,.18)",
    display: "flex",
    flexDirection: "column",
    animation: "scaleIn 0.18s ease-out",
    maxHeight: "90vh",
    overflowY: "auto",
  },

  /* Header */
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  headerDot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    background: "#BD6A47",
    display: "inline-block",
  },
  headerTitle: {
    fontFamily: "'Newsreader', Georgia, serif",
    fontSize: 20,
    fontWeight: 600,
    color: "#21201C",
  },
  closeBtn: {
    width: 28,
    height: 28,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "none",
    background: "transparent",
    color: "#9A958A",
    borderRadius: 7,
    cursor: "pointer",
  },

  /* Title input */
  titleInput: {
    border: "none",
    borderBottom: "1px solid #E9E5DC",
    outline: "none",
    background: "transparent",
    fontFamily: "'Newsreader', Georgia, serif",
    fontSize: 20,
    fontWeight: 500,
    color: "#21201C",
    padding: "8px 0 12px",
    marginBottom: 8,
    width: "100%",
  },

  /* Summary input */
  summaryInput: {
    border: "none",
    outline: "none",
    background: "transparent",
    fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
    fontSize: 13.5,
    color: "#56524A",
    padding: "4px 0 12px",
    marginBottom: 14,
    width: "100%",
  },

  /* Field label */
  fieldLabel: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.06em",
    color: "#56524A",
    marginBottom: 8,
    display: "block",
  },

  /* Type pills */
  pillRow: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 8,
    marginBottom: 18,
  },
  typePill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 13,
    fontWeight: 500,
    fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
    padding: "6px 12px",
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
    transition: "all 0.12s",
  },
  pillDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    display: "inline-block",
    flexShrink: 0,
  },
  addTypePill: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 34,
    height: 32,
    fontSize: 16,
    fontWeight: 500,
    fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
    borderRadius: 8,
    border: "1.5px dashed #C4BFAE",
    background: "transparent",
    color: "#9A958A",
    cursor: "pointer",
    transition: "all 0.12s",
  },
  customTypeInput: {
    fontSize: 13,
    fontWeight: 500,
    fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
    padding: "6px 12px",
    borderRadius: 8,
    border: "1.5px solid #BD6A47",
    outline: "none",
    background: "#FFFFFF",
    color: "#21201C",
    width: 120,
  },

  /* Space + Status row */
  twoCol: {
    display: "flex",
    gap: 24,
    marginBottom: 18,
  },
  segmentedRow: {
    display: "inline-flex",
    background: "#F0EBE1",
    borderRadius: 9,
    padding: 3,
    gap: 2,
  },
  segmentBtn: {
    fontSize: 13,
    fontWeight: 500,
    fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
    padding: "6px 16px",
    borderRadius: 7,
    border: "none",
    cursor: "pointer",
    transition: "all 0.12s",
  },
  segmentActive: {
    background: "#FFFFFF",
    color: "#21201C",
    boxShadow: "0 1px 3px rgba(0,0,0,.08)",
  },
  segmentInactive: {
    background: "transparent",
    color: "#8C887E",
  },

  /* Tags */
  tagsContainer: {
    display: "flex",
    flexWrap: "wrap" as const,
    alignItems: "center",
    gap: 6,
    border: "1px solid #E7E1D6",
    borderRadius: 10,
    padding: "8px 12px",
    marginBottom: 14,
    minHeight: 38,
  },
  tagChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 12,
    fontWeight: 500,
    color: "#56524A",
    background: "#F0EBE1",
    borderRadius: 6,
    padding: "3px 8px",
  },
  tagRemove: {
    border: "none",
    background: "transparent",
    color: "#9A958A",
    cursor: "pointer",
    fontSize: 14,
    lineHeight: 1,
    padding: 0,
    marginLeft: 2,
  },
  tagTextInput: {
    flex: 1,
    minWidth: 100,
    border: "none",
    outline: "none",
    background: "transparent",
    fontSize: 13,
    fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
    color: "#21201C",
  },

  /* Advanced section */
  advancedToggle: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    fontWeight: 500,
    color: "#9A958A",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    padding: "0 0 10px",
    fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
  },
  advancedSection: {
    marginBottom: 6,
  },
  textInput: {
    width: "100%",
    border: "1px solid #E7E1D6",
    borderRadius: 8,
    padding: "7px 10px",
    fontSize: 13,
    fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
    color: "#21201C",
    outline: "none",
    background: "transparent",
  },

  /* Body textarea */
  bodyTextarea: {
    minHeight: 140,
    border: "1px solid #E7E1D6",
    borderRadius: 10,
    padding: "12px 14px",
    fontSize: 13.5,
    fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
    color: "#21201C",
    background: "transparent",
    resize: "vertical" as const,
    outline: "none",
    marginBottom: 20,
    lineHeight: 1.55,
  },

  /* Footer */
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  footerHint: {
    fontSize: 12,
    color: "#9A958A",
  },
  footerBtns: {
    display: "flex",
    gap: 10,
  },
  cancelBtn: {
    border: "1px solid #E7E1D6",
    background: "#FFFFFF",
    color: "#56524A",
    fontSize: 13,
    fontWeight: 500,
    fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
    padding: "9px 20px",
    borderRadius: 9,
    cursor: "pointer",
  },
  createBtn: {
    border: "none",
    background: "#BD6A47",
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: 600,
    fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
    padding: "9px 22px",
    borderRadius: 9,
    cursor: "pointer",
    boxShadow: "0 1px 4px rgba(120,60,30,.25)",
  },
};
