import React from "react";
import { useStore } from "@/store";

/* ────── Toast ────── */

export default function Toast() {
  const toast = useStore((s) => s.toast);

  if (!toast) return null;

  return (
    <div style={S.container}>
      {toast}
    </div>
  );
}

/* ────── Styles ────── */

const S: Record<string, React.CSSProperties> = {
  container: {
    position: "fixed",
    left: "50%",
    bottom: 54,
    transform: "translateX(-50%)",
    zIndex: 60,
    background: "#2B2823",
    color: "#F3EFE8",
    fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
    fontSize: 13,
    fontWeight: 500,
    padding: "10px 16px",
    borderRadius: 10,
    boxShadow: "0 10px 30px rgba(0,0,0,.25)",
    animation: "toastFadeUp 0.15s ease",
    whiteSpace: "nowrap" as const,
    pointerEvents: "none" as const,
  },
};
