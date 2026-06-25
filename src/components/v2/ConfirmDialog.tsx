import React from "react";

/* ════════════════════════════════════════════════════════════════
   ConfirmDialog — flush below TopBar (48px), top colored border,
   icon + title + body layout, action-specific button labels.

   Variants:
     delete  → red border, warning icon, "Delete" button
     archive → blue border, archive icon, "Archive" button
     restore → amber border, rotate icon, "Restore" button
   ════════════════════════════════════════════════════════════════ */

export type ConfirmVariant = "delete" | "archive" | "restore";

interface Props {
  variant: ConfirmVariant;
  title: string;
  body?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const VARIANTS: Record<ConfirmVariant, {
  borderColor: string;
  iconBg: string;
  iconColor: string;
  btnBg: string;
  btnLabel: string;
  icon: React.ReactNode;
  defaultBody: string;
}> = {
  delete: {
    borderColor: "var(--danger)",
    iconBg: "var(--danger-bg)",
    iconColor: "var(--danger)",
    btnBg: "var(--danger)",
    btnLabel: "Delete",
    defaultBody: "This will permanently remove it. This cannot be undone.",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  },
  archive: {
    borderColor: "var(--accent)",
    iconBg: "rgba(55, 138, 221, 0.12)",
    iconColor: "var(--accent)",
    btnBg: "var(--accent)",
    btnLabel: "Archive",
    defaultBody: "Archived items can be restored anytime from the archive section.",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="21 8 21 21 3 21 3 8" />
        <rect x="1" y="3" width="22" height="5" />
        <line x1="10" y1="12" x2="14" y2="12" />
      </svg>
    ),
  },
  restore: {
    borderColor: "var(--highlight)",
    iconBg: "var(--highlight-bg)",
    iconColor: "var(--highlight)",
    btnBg: "var(--highlight)",
    btnLabel: "Restore",
    defaultBody: "This will be moved back to your active items.",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="1 4 1 10 7 10" />
        <path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
      </svg>
    ),
  },
};

export default function ConfirmDialog({ variant, title, body, onConfirm, onCancel }: Props) {
  const v = VARIANTS[variant];

  return (
    <>
      {/* Invisible blocker over TopBar — no blur/tint, just blocks clicks */}
      <div onClick={onCancel} style={{
        position: "fixed", top: 0, left: 0, right: 0, height: 48,
        zIndex: 9998,
      }} />
      {/* Overlay — starts below TopBar, dark blur */}
      <div onClick={onCancel} style={{
        position: "fixed", top: 48, left: 0, right: 0, bottom: 0,
        background: "rgba(0, 0, 0, .45)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        zIndex: 9998,
      }} />
      {/* Dialog — flush below TopBar, centered */}
      <div style={{
        position: "fixed", top: 48, left: "50%", transform: "translateX(-50%)",
        background: "var(--bg-card)", zIndex: 9999,
        border: "1px solid var(--border-subtle)", borderTop: "none",
        borderRadius: "0 0 12px 12px",
        boxShadow: `inset 0 3px 0 ${v.borderColor}, 0 12px 40px rgba(var(--shadow-color), .2)`,
        minWidth: 340, maxWidth: 420, padding: "20px 24px",
        fontFamily: "inherit",
      }}>
        {/* Header — icon + text */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
          <div style={{
            width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: v.iconBg, color: v.iconColor,
          }}>
            {v.icon}
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 500, color: "var(--text-heading)", lineHeight: 1.4 }}>
              {title}
            </p>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>
              {body || v.defaultBody}
            </p>
          </div>
        </div>
        {/* Actions */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={{
            padding: "7px 18px", borderRadius: 8, fontSize: 13, fontWeight: 500,
            border: "1px solid var(--border-subtle)", background: "transparent",
            color: "var(--text-secondary)", cursor: "pointer", fontFamily: "inherit",
          }}>Cancel</button>
          <button onClick={onConfirm} style={{
            padding: "7px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600,
            border: "none", background: v.btnBg, color: "#fff",
            cursor: "pointer", fontFamily: "inherit",
          }}>{v.btnLabel}</button>
        </div>
      </div>
    </>
  );
}
