/* ═══════════════════════════════════════════════════════════════
   ChatPattern — Telegram-style tiled doodle background
   Stroke-outlined developer icons, densely packed,
   with small star/dot fillers. Uses external SVG tile.
   ═══════════════════════════════════════════════════════════════ */

export default function ChatPattern() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        opacity: 0.07,
        backgroundImage: 'url("/chat-pattern.svg")',
        backgroundRepeat: "repeat",
        backgroundSize: "400px 450px",
        filter: "sepia(0.3) saturate(0.5)",
      }}
    />
  );
}
