import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useStore, getTypeMeta } from "@/store";

import { api } from "@/lib/ipc";
import type { ChatHistoryItem } from "@/lib/ipc";
import { measureHeight, balancedWidth, FONTS } from "@/lib/pretext";

/* ─── Placeholder strings that cycle in the textarea ─── */
const PLACEHOLDERS = [
  "Ask about your knowledge base…",
  "Search for a capture…",
  "What would you like to learn today?",
  "Find a debugging session…",
];

/* ─── Suggestion chip data ─── */
const SUGGESTIONS = [
  { label: "What's the pattern for error handling?", action: "draft" as const },
  { label: "Find this week's debugging sessions", action: "browse" as const },
  { label: "Summarize my recent Rust learnings", action: "draft" as const },
  { label: "Create a new capture", action: "new" as const },
];

/* ─── Time-of-day greeting ─── */
function getGreeting(name: string): string {
  const h = new Date().getHours();
  const prefix = h < 5 ? "Late night, " : h < 12 ? "Good morning, " : h < 18 ? "Good afternoon, " : h < 22 ? "Good evening, " : "Late night, ";
  return prefix + name;
}

/* ─── Relative time from ISO date string ─── */
function relativeTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    const weeks = Math.floor(days / 7);
    return `${weeks}w ago`;
  } catch {
    return dateStr;
  }
}

/* ─── Attach menu type ─── */
type AttachMenuState = null | "open";

/* ─── Thinking phases for rotating text loader ─── */
const THINKING_PHASES = [
  "Searching knowledge base…",
  "Finding relevant captures…",
  "Building context…",
  "Composing response…",
];

/** Rotating text loader + typing dots (shown while AI is thinking) */
function ThinkingIndicator() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setPhase((p) => (p + 1) % THINKING_PHASES.length), 2200);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, animation: "fadeUp .2s ease" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#BD6A47" }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: "#9A847A" }}>BrainOS</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "2px 0" }}>
        <div style={{ display: "flex", gap: 4 }}>
          <span className="typing-dot" style={{ width: 6, height: 6, borderRadius: "50%", background: "#C9B8AE" }} />
          <span className="typing-dot" style={{ width: 6, height: 6, borderRadius: "50%", background: "#C9B8AE" }} />
          <span className="typing-dot" style={{ width: 6, height: 6, borderRadius: "50%", background: "#C9B8AE" }} />
        </div>
        <span
          key={phase}
          style={{
            fontSize: 13, color: "#A8A194", fontStyle: "italic",
            animation: "rotateText .3s ease",
          }}
        >
          {THINKING_PHASES[phase]}
        </span>
      </div>
    </div>
  );
}

/* ─── Component ─── */
export default function HomeView() {
  const captures = useStore((s) => s.captures);
  const openDetail = useStore((s) => s.openDetail);
  const openNew = useStore((s) => s.openNew);
  const openPaletteAttach = useStore((s) => s.openPaletteAttach);

  const goBrowse = useStore((s) => s.goBrowse);
  const detach = useStore((s) => s.detach);
  const favorites = useStore((s) => s.favorites);
  const showToast = useStore((s) => s.showToast);

  // Conversation state from store
  const activeConversationId = useStore((s) => s.activeConversationId);
  const conversations = useStore((s) => s.conversations);
  const newConversation = useStore((s) => s.newConversation);
  const addMessage = useStore((s) => s.addMessage);
  const setChatThinking = useStore((s) => s.setChatThinking);
  const chatThinking = useStore((s) => s.chatThinking);

  const activeConvo = useMemo(
    () => conversations.find((c) => c.id === activeConversationId) || null,
    [conversations, activeConversationId],
  );
  const chatActive = activeConvo !== null;
  const messages = activeConvo?.messages || [];
  const attached = activeConvo?.attached || [];

  /* ── Home state ── */
  const [draft, setDraft] = useState("");
  const [phIdx, setPhIdx] = useState(0);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const [attachMenu, setAttachMenu] = useState<AttachMenuState>(null);
  const attachBtnRef = useRef<HTMLButtonElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const attachedCaptures = useMemo(
    () => attached.map((id) => captures.find((c) => c.id === id)).filter(Boolean),
    [attached, captures],
  );

  const favCaptures = useMemo(
    () => captures.filter((c) => favorites.includes(c.id)),
    [captures, favorites],
  );

  // Cycle placeholders
  useEffect(() => {
    const id = setInterval(() => setPhIdx((i) => (i + 1) % PLACEHOLDERS.length), 3600);
    return () => clearInterval(id);
  }, []);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (chatActive) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length, chatThinking, chatActive]);

  // Auto-resize textarea in chat mode
  useEffect(() => {
    if (chatActive && textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + "px";
    }
  }, [draft, chatActive]);

  // Focus textarea when entering chat mode
  useEffect(() => {
    if (chatActive) {
      setTimeout(() => textareaRef.current?.focus(), 60);
    }
  }, [chatActive]);

  /* ── Send message ── */
  const handleSend = useCallback(async () => {
    const text = draft.trim();
    if (!text || chatThinking) return;

    // Auto-create conversation if none active
    if (!activeConversationId) {
      newConversation();
    }

    const userMsg = { id: crypto.randomUUID(), isUser: true, text };
    addMessage(userMsg);
    setDraft("");
    setChatThinking(true);

    try {
      // Build history from current conversation messages
      const currentMessages = useStore.getState().getActiveConversation()?.messages || [];
      const history: ChatHistoryItem[] = currentMessages
        .filter((m) => m.id !== userMsg.id) // exclude the message we just added
        .map((m) => ({
          role: (m.isUser ? "user" : "assistant") as "user" | "assistant",
          content: m.text,
        }));

      const currentAttached = useStore.getState().getAttached();
      const response = await api.chatSend(text, currentAttached, history);

      addMessage({
        id: crypto.randomUUID(),
        isUser: false,
        text: response.text,
        cardIds: response.source_ids,
        sources: response.source_ids.length,
      });
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      addMessage({
        id: crypto.randomUUID(),
        isUser: false,
        text: errMsg.includes("API key") || errMsg.includes("not configured")
          ? `⚠ ${errMsg}\n\nGo to **Settings** to configure your AI provider and API key.`
          : `Sorry, something went wrong: ${errMsg}`,
      });
      showToast("Chat error — check settings");
    }
    setChatThinking(false);
  }, [draft, chatThinking, activeConversationId, newConversation, addMessage, setChatThinking, showToast]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleChipClick = useCallback(
    (s: (typeof SUGGESTIONS)[number]) => {
      if (s.action === "new") openNew();
      else if (s.action === "browse") goBrowse("type", "debugging", "Type · debugging");
      else setDraft(s.label);
    },
    [openNew, goBrowse],
  );

  // Fan cards (first 5)
  const fanSrc = captures.slice(0, 5);
  const fmid = (fanSrc.length - 1) / 2;

  // Pretext: measure card titles for balanced wrapping
  const cardMetrics = useMemo(() => {
    const CARD_W = 158;
    const TITLE_PAD = 24;
    const titleMaxW = CARD_W - TITLE_PAD;
    const titleFont = FONTS.heading(14.5, 500);
    const titleLH = 17.5;
    return fanSrc.map((c) => {
      const { lineCount } = measureHeight(c.title, titleFont, titleMaxW, titleLH);
      const balanced = balancedWidth(c.title, titleFont, titleMaxW);
      const clampedLines = Math.min(lineCount, 2);
      return {
        id: c.id,
        lineCount: clampedLines,
        titleWidth: Math.min(balanced, titleMaxW),
        titleHeight: clampedLines * titleLH,
      };
    });
  }, [fanSrc]);


  /* ══════════════════════════════════════════════════
   *  INPUT CARD — shared between home & chat mode
   * ══════════════════════════════════════════════════ */
  const inputCard = (
    <div style={{
      width: "100%",
      maxWidth: chatActive ? 720 : 680,
      background: "#FFFFFF",
      border: "1px solid #E7E1D6",
      borderRadius: chatActive ? 14 : 18,
      padding: chatActive ? "12px 12px 10px" : "16px 16px 12px",
      boxShadow: "0 1px 3px rgba(40,36,28,.05), 0 12px 32px rgba(40,36,28,.045)",
      margin: chatActive ? "0 auto" : undefined,
    }}>
      {/* Context chips — attached captures (always visible when present) */}
      {attachedCaptures.length > 0 && (
        <div style={{
          display: "flex", flexWrap: "wrap", gap: 6,
          marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid #F0EBE1",
        }}>
          {attachedCaptures.map((c) => {
            if (!c) return null;
            const meta = getTypeMeta(c.capture_type);
            return (
              <div key={c.id} style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                background: "#F6F0E8", border: "1px solid #E7DFD0",
                borderRadius: 8, padding: "4px 8px 4px 10px", maxWidth: 200,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: meta.dot }} />
                <span onClick={() => openDetail(c.id)} style={{
                  fontSize: 12, color: "#4A463E", whiteSpace: "nowrap",
                  overflow: "hidden", textOverflow: "ellipsis", cursor: "pointer", flex: 1,
                }}>{c.title}</span>
                <button onClick={() => detach(c.id)} style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  border: "none", background: "transparent", color: "#B3AE9F", cursor: "pointer", padding: 0, flexShrink: 0,
                }}>
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <line x1="3" y1="3" x2="9" y2="9" /><line x1="9" y1="3" x2="3" y2="9" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      )}

      <textarea
        ref={textareaRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={chatActive ? "Ask a follow-up…" : PLACEHOLDERS[phIdx]}
        rows={1}
        style={{
          width: "100%", border: "none", outline: "none", resize: "none",
          background: "transparent", fontFamily: "inherit",
          fontSize: chatActive ? 15 : 16.5, lineHeight: 1.5,
          color: "#21201C", minHeight: chatActive ? 24 : 30,
        }}
      />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: chatActive ? 8 : 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, position: "relative" }}>
          {/* + attach button with popover */}
          <button
            ref={attachBtnRef}
            onClick={() => setAttachMenu((m) => m ? null : "open")}
            title="Attach context"
            style={{
              width: chatActive ? 30 : 32, height: chatActive ? 30 : 32,
              display: "flex", alignItems: "center", justifyContent: "center",
              border: attachMenu ? "1px solid #CDA18C" : "1px solid #E7E1D6",
              background: attachMenu ? "#FBF5EF" : "#FBFAF6",
              borderRadius: chatActive ? 8 : 9, color: attachMenu ? "#BD6A47" : "#8C887E", cursor: "pointer",
              transition: "all .12s ease",
            }}
          >
            <svg width={chatActive ? 13 : 14} height={chatActive ? 13 : 14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6">
              <line x1="7" y1="2.5" x2="7" y2="11.5" /><line x1="2.5" y1="7" x2="11.5" y2="7" />
            </svg>
          </button>
          {/* Attach popover */}
          {attachMenu && (
            <>
              {/* Backdrop */}
              <div onClick={() => setAttachMenu(null)} style={{ position: "fixed", inset: 0, zIndex: 99 }} />
              <div style={{
                position: "absolute", bottom: "calc(100% + 8px)", left: 0, zIndex: 100,
                background: "#FFFFFF", border: "1px solid #E7E1D6", borderRadius: 12,
                boxShadow: "0 8px 28px rgba(40,36,28,.12), 0 2px 6px rgba(40,36,28,.06)",
                minWidth: 200, overflow: "hidden",
                animation: "fadeUp .12s ease",
              }}>
                <button
                  onClick={() => { setAttachMenu(null); openPaletteAttach(); }}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 14px", border: "none", background: "transparent",
                    cursor: "pointer", fontSize: 13.5, color: "#4A463E",
                    fontFamily: "inherit", textAlign: "left",
                    transition: "background .1s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#FAF8F3"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="#8A8578" strokeWidth="1.4" strokeLinecap="round">
                    <circle cx="7" cy="7" r="5" /><path d="M11 11l3 3" />
                  </svg>
                  <div>
                    <div style={{ fontWeight: 500 }}>Attach capture</div>
                    <div style={{ fontSize: 11.5, color: "#A8A194", marginTop: 1 }}>Search your knowledge base</div>
                  </div>
                </button>
                <div style={{ height: 1, background: "#F0EBE1", margin: "0 10px" }} />
                <button
                  onClick={() => { setAttachMenu(null); showToast("File upload coming soon"); }}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 14px", border: "none", background: "transparent",
                    cursor: "pointer", fontSize: 13.5, color: "#4A463E",
                    fontFamily: "inherit", textAlign: "left",
                    transition: "background .1s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#FAF8F3"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="#8A8578" strokeWidth="1.4" strokeLinecap="round">
                    <path d="M8 10V3M5 5.5L8 3l3 2.5" /><path d="M3 10v2.5h10V10" />
                  </svg>
                  <div>
                    <div style={{ fontWeight: 500 }}>Upload file</div>
                    <div style={{ fontSize: 11.5, color: "#A8A194", marginTop: 1 }}>Attach external data</div>
                  </div>
                </button>
              </div>
            </>
          )}
        </div>
        {/* Send button */}
        <button
          onClick={handleSend}
          title="Send"
          style={{
            width: chatActive ? 32 : 36, height: chatActive ? 32 : 36,
            display: "flex", alignItems: "center", justifyContent: "center",
            border: "none", background: "#BD6A47",
            borderRadius: chatActive ? 9 : 11, color: "#FFF", cursor: "pointer",
            boxShadow: "0 1px 3px rgba(120,60,30,.3)",
          }}
        >
          <svg width={chatActive ? 15 : 17} height={chatActive ? 15 : 17} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <line x1="9" y1="14" x2="9" y2="4" /><polyline points="4.5,8.5 9,4 13.5,8.5" />
          </svg>
        </button>
      </div>
    </div>
  );

  /* ══════════════════════════════════════════════════
   *  CHAT MODE
   * ══════════════════════════════════════════════════ */
  if (chatActive) {
    return (
      <div style={{
        flex: 1, display: "flex", flexDirection: "column", overflow: "hidden",
        position: "relative",
        backgroundColor: "#F0EDE6",
      }}>
        {/* Telegram-style doodle background */}
        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 0, opacity: 0.18, pointerEvents: "none" }} xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="chat-bg" x="0" y="0" width="200" height="200" patternUnits="userSpaceOnUse">
              <g transform="translate(15,12) rotate(-15) scale(0.55)"><path d="M12 2C8 2 6 4.5 6 7c-2 .5-3 2-3 4 0 2.5 2 4 4 4h1c0 2 2 3 4 3s4-1 4-3h1c2 0 4-1.5 4-4 0-2-1-3.5-3-4 0-2.5-2-5-6-5z" fill="none" stroke="#9A8E7A" strokeWidth="1.4"/></g>
              <g transform="translate(72,9) rotate(12) scale(0.45)"><path d="M10 1l2.5 6.5H20l-5.5 4.5 2 7L10 14.5 3.5 19l2-7L0 7.5h7.5z" fill="none" stroke="#9A8E7A" strokeWidth="1.5"/></g>
              <g transform="translate(140,20) rotate(-8) scale(0.5)"><path d="M3 3h14a2 2 0 012 2v8a2 2 0 01-2 2H8l-4 3v-3H3a2 2 0 01-2-2V5a2 2 0 012-2z" fill="none" stroke="#9A8E7A" strokeWidth="1.3"/></g>
              <g transform="translate(30,50) rotate(10) scale(0.5)"><path d="M9 2a6 6 0 00-2 11.7V16h6v-2.3A6 6 0 009 2z" fill="none" stroke="#9A8E7A" strokeWidth="1.3"/><line x1="7" y1="18" x2="11" y2="18" stroke="#9A8E7A" strokeWidth="1.3"/></g>
              <g transform="translate(100,42) rotate(-5) scale(0.5)"><path d="M2 3h7a2 2 0 012 2v12a1 1 0 01-1-1H3a1 1 0 01-1-1V3z" fill="none" stroke="#9A8E7A" strokeWidth="1.3"/><path d="M18 3h-7a2 2 0 00-2 2v12a1 1 0 011-1h7a1 1 0 001-1V3z" fill="none" stroke="#9A8E7A" strokeWidth="1.3"/></g>
              <g transform="translate(170,47) rotate(25) scale(0.45)"><path d="M14 2l4 4-10 10H4v-4z" fill="none" stroke="#9A8E7A" strokeWidth="1.4"/><line x1="11" y1="5" x2="15" y2="9" stroke="#9A8E7A" strokeWidth="1.4"/></g>
              <g transform="translate(50,95) rotate(-12) scale(0.5)"><polyline points="6,4 2,10 6,16" fill="none" stroke="#9A8E7A" strokeWidth="1.4" strokeLinecap="round"/><polyline points="14,4 18,10 14,16" fill="none" stroke="#9A8E7A" strokeWidth="1.4" strokeLinecap="round"/></g>
              <g transform="translate(125,87) rotate(8) scale(0.45)"><path d="M10 17S1 12 1 6.5C1 3 3.5 1 6 1c1.7 0 3.3 1 4 2.5C10.7 2 12.3 1 14 1c2.5 0 5 2 5 5.5C19 12 10 17 10 17z" fill="none" stroke="#9A8E7A" strokeWidth="1.4"/></g>
              <g transform="translate(185,90) rotate(-20) scale(0.5)"><circle cx="8" cy="8" r="6" fill="none" stroke="#9A8E7A" strokeWidth="1.3"/><line x1="13" y1="13" x2="18" y2="18" stroke="#9A8E7A" strokeWidth="1.5" strokeLinecap="round"/></g>
              <g transform="translate(10,137) rotate(15) scale(0.5)"><path d="M1 10l18-8-7 16-3-6-8-2z" fill="none" stroke="#9A8E7A" strokeWidth="1.3"/><line x1="12" y1="2" x2="9" y2="12" stroke="#9A8E7A" strokeWidth="1.3"/></g>
              <g transform="translate(82,130) rotate(-10) scale(0.45)"><circle cx="6" cy="14" r="3" fill="none" stroke="#9A8E7A" strokeWidth="1.3"/><line x1="9" y1="14" x2="9" y2="2" stroke="#9A8E7A" strokeWidth="1.3"/><path d="M9 2c4 1 5 4 5 4" fill="none" stroke="#9A8E7A" strokeWidth="1.3"/></g>
              <g transform="translate(155,132) rotate(-30) scale(0.5)"><path d="M10 18s-1-5 0-10c1-4 4-6 4-6s3 2 4 6c1 5 0 10 0 10" fill="none" stroke="#9A8E7A" strokeWidth="1.3"/><circle cx="14" cy="8" r="1.5" fill="none" stroke="#9A8E7A" strokeWidth="1.2"/></g>
              <g transform="translate(27,175) rotate(22) scale(0.45)"><circle cx="10" cy="10" r="3" fill="none" stroke="#9A8E7A" strokeWidth="1.3"/><path d="M10 1v3M10 16v3M1 10h3M16 10h3M3.5 3.5l2 2M14.5 14.5l2 2M3.5 16.5l2-2M14.5 5.5l2-2" stroke="#9A8E7A" strokeWidth="1.3" strokeLinecap="round"/></g>
              <g transform="translate(97,172) rotate(5) scale(0.5)"><path d="M6 16h10a4 4 0 000-8 6 6 0 00-12 2 3 3 0 000 6z" fill="none" stroke="#9A8E7A" strokeWidth="1.3"/></g>
              <g transform="translate(167,177) rotate(-15) scale(0.5)"><polyline points="12,2 6,10 10,10 8,18 16,8 12,8 14,2" fill="none" stroke="#9A8E7A" strokeWidth="1.3" strokeLinejoin="round"/></g>
              <g transform="translate(60,27) rotate(20) scale(0.4)"><circle cx="10" cy="10" r="8" fill="none" stroke="#9A8E7A" strokeWidth="1.5"/><path d="M10 2v3M10 15v3M2 10h3M15 10h3" stroke="#9A8E7A" strokeWidth="1.2" strokeLinecap="round"/><path d="M13 7l-6 2 3 5z" fill="none" stroke="#9A8E7A" strokeWidth="1.2"/></g>
              <g transform="translate(165,70) rotate(5) scale(0.45)"><rect x="2" y="6" width="16" height="11" rx="2" fill="none" stroke="#9A8E7A" strokeWidth="1.3"/><path d="M6 6l1.5-3h5L14 6" fill="none" stroke="#9A8E7A" strokeWidth="1.3"/><circle cx="10" cy="11.5" r="3" fill="none" stroke="#9A8E7A" strokeWidth="1.3"/></g>
              <g transform="translate(120,175) rotate(-25) scale(0.5)"><path d="M17 2C12 2 3 7 3 17c4-2 7-4 14-15z" fill="none" stroke="#9A8E7A" strokeWidth="1.3"/><path d="M3 17C8 12 10 9 17 2" fill="none" stroke="#9A8E7A" strokeWidth="1"/></g>
              <g transform="translate(25,105) rotate(10) scale(0.45)"><path d="M10 1L18 8 10 19 2 8z" fill="none" stroke="#9A8E7A" strokeWidth="1.3"/><line x1="2" y1="8" x2="18" y2="8" stroke="#9A8E7A" strokeWidth="1"/></g>
              <g transform="translate(190,15) rotate(-8) scale(0.45)"><path d="M5 2h10v5a5 5 0 01-10 0V2z" fill="none" stroke="#9A8E7A" strokeWidth="1.3"/><path d="M5 4H2v2a3 3 0 003 3" fill="none" stroke="#9A8E7A" strokeWidth="1.2"/><path d="M15 4h3v2a3 3 0 01-3 3" fill="none" stroke="#9A8E7A" strokeWidth="1.2"/><line x1="10" y1="12" x2="10" y2="15" stroke="#9A8E7A" strokeWidth="1.3"/><line x1="7" y1="15" x2="13" y2="15" stroke="#9A8E7A" strokeWidth="1.3"/></g>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#chat-bg)" />
        </svg>

        {/* Messages area */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px" }}>
          <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
            {messages.map((msg) =>
              msg.isUser ? (
                /* User message */
                <div key={msg.id} style={{ display: "flex", justifyContent: "flex-end", animation: "fadeUp .2s ease" }}>
                  <div style={{
                    maxWidth: "78%", background: "#F3E9E1", border: "1px solid #EBDDD0",
                    borderRadius: "14px 14px 4px 14px", padding: "11px 15px",
                    fontSize: 14.5, lineHeight: 1.5, color: "#3F3B33",
                  }}>
                    {msg.text}
                  </div>
                </div>
              ) : (
                /* AI message */
                <div key={msg.id} style={{ display: "flex", flexDirection: "column", gap: 11, animation: "fadeUp .2s ease" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#BD6A47" }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#9A847A" }}>BrainOS</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.65, color: "#3F3B33", whiteSpace: "pre-wrap" }}>
                    {msg.text}
                  </p>

                  {/* Source cards */}
                  {msg.cardIds?.map((id) => {
                    const overview = captures.find((c) => c.id === id);
                    if (!overview) return null;
                    const meta = getTypeMeta(overview.capture_type);
                    return (
                      <button
                        key={id}
                        onClick={() => openDetail(id)}
                        style={{
                          textAlign: "left" as const, display: "flex", flexDirection: "column", gap: 6,
                          background: "#FCFBF7", border: "1px solid #E7E1D4", borderRadius: 12,
                          padding: "12px 14px", cursor: "pointer", transition: "all .12s ease", fontFamily: "inherit",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#CDA18C"; e.currentTarget.style.boxShadow = "0 3px 12px rgba(40,36,28,.06)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#E7E1D4"; e.currentTarget.style.boxShadow = "none"; }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ width: 7, height: 7, borderRadius: "50%", background: meta.dot }} />
                          <span style={{ fontFamily: "'Newsreader',Georgia,serif", fontSize: 15, fontWeight: 500, color: "#21201C", flex: 1 }}>
                            {overview.title}
                          </span>
                          <span style={{ fontSize: 11, color: "#7C7468", background: "#F2EDE3", borderRadius: 5, padding: "2px 6px", fontFamily: "ui-monospace,Menlo,monospace" }}>
                            {overview.capture_type}
                          </span>
                        </div>
                        <div style={{ fontSize: 12.5, color: "#7C7468", lineHeight: 1.5 }}>
                          {overview.tags?.join(", ") || `${overview.space} capture`}
                        </div>
                      </button>
                    );
                  })}

                  {/* Sources badge */}
                  {msg.sources && msg.sources > 0 && (
                    <div style={{
                      display: "inline-flex", alignItems: "center", gap: 7,
                      background: "#F2EDE3", borderRadius: 8, padding: "6px 11px", alignSelf: "flex-start",
                    }}>
                      <span style={{ color: "#9A847A", display: "flex" }}>
                        <svg width="12" height="12" viewBox="0 0 14 14" fill="currentColor"><path d="M3.5 2h7v10l-3.5-2.4L3.5 12Z" /></svg>
                      </span>
                      <span style={{ fontSize: 12, color: "#7C7468" }}>
                        {msg.sources} source{msg.sources > 1 ? "s" : ""} cited
                      </span>
                    </div>
                  )}
                </div>
              ),
            )}

            {/* Thinking — rotating text + typing dots */}
            {chatThinking && <ThinkingIndicator />}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input area — floating at bottom with transparent bg */}
        <div style={{
          flexShrink: 0, padding: "14px 28px 20px",
          background: "linear-gradient(to top, rgba(240,237,230,.95) 60%, rgba(240,237,230,0))",
          zIndex: 2,
        }}>
          {inputCard}
        </div>

      </div>
    );
  }

  /* ══════════════════════════════════════════════════
   *  HOME MODE (no active chat)
   * ══════════════════════════════════════════════════ */
  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
    <div style={{ width: "100%", padding: "clamp(32px, 5vw, 64px) clamp(16px, 3vw, 32px) 56px", display: "flex", flexDirection: "column", alignItems: "center" }}>

      {/* ── Streak badge ── */}
      <div style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "#F3E9E1", border: "1px solid #EBDDD0", borderRadius: 999, padding: "5px 12px", marginBottom: 20, animation: "fadeUp .2s ease" }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#BD6A47" }} />
        <span style={{ fontSize: 12, color: "#9A4F30", fontWeight: 500 }}>7-day capture streak</span>
      </div>

      {/* ── Greeting ── */}
      <p style={{ margin: 0, fontSize: 15, color: "#A4897B" }}>{getGreeting("Aakash")}</p>
      <h1 style={{ margin: "6px 0 0", fontFamily: "'Newsreader', Georgia, serif", fontWeight: 400, fontSize: "clamp(28px, 4vw, 42px)", lineHeight: 1.1, color: "#21201C", letterSpacing: "-0.015em", textAlign: "center" }}>
        What did you learn today?
      </h1>

      {/* ── Input card (centered) ── */}
      <div style={{ width: "100%", maxWidth: 680, marginTop: 28 }}>
        {inputCard}
      </div>

      {/* ── Suggestion chips ── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 9, justifyContent: "center", marginTop: 18 }}>
        {SUGGESTIONS.map((s) => (
          <button
            key={s.label}
            onClick={() => handleChipClick(s)}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#FFFFFF", border: "1px solid #E7E1D6", borderRadius: 999, padding: "8px 14px", cursor: "pointer", fontSize: 13.5, color: "#4A463E", fontFamily: "inherit", transition: "all .14s ease" }}
            onMouseEnter={(e) => { const t = e.currentTarget; t.style.borderColor = "#CDA18C"; t.style.color = "#21201C"; t.style.boxShadow = "0 3px 10px rgba(40,36,28,.06)"; t.style.transform = "translateY(-2px)"; }}
            onMouseLeave={(e) => { const t = e.currentTarget; t.style.borderColor = "#E7E1D6"; t.style.color = "#4A463E"; t.style.boxShadow = "none"; t.style.transform = "none"; }}
          >
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#BD6A47" }} />
            {s.label}
          </button>
        ))}
      </div>

      {/* ── Recent captures · fanned cards ── */}
      {fanSrc.length > 0 && (
        <div style={{ width: "100%", maxWidth: 1000, marginTop: 58 }}>
          <div style={{ textAlign: "center", fontSize: 14, color: "#9A958A", marginBottom: 8 }}>Recent captures</div>
          <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-end", padding: "36px 0 6px", overflow: "hidden" }}>
            {fanSrc.map((c, i) => {
              const cm = cardMetrics[i];
              const d = i - fmid;
              const ad = Math.abs(d);
              const meta = getTypeMeta(c.capture_type);
              const isHovered = hoveredCard === c.id;
              const baseTransform = `rotate(${(d * 6).toFixed(2)}deg) translateY(${(-(ad * ad) * 6).toFixed(1)}px)`;
              const hoverTransform = "rotate(0deg) translateY(-14px) scale(1.05)";
              const zBase = 20 - Math.round(ad);

              return (
                <span
                  key={c.id}
                  style={{
                    display: "inline-block", flexShrink: 0,
                    marginLeft: i === 0 ? 0 : -20,
                    zIndex: isHovered ? 60 : zBase,
                    animation: `fanIn .55s cubic-bezier(.2,.85,.25,1) both`,
                    animationDelay: `${(i * 0.07).toFixed(2)}s`,
                  }}
                  onMouseEnter={() => setHoveredCard(c.id)}
                  onMouseLeave={() => setHoveredCard(null)}
                >
                  <button
                    onClick={() => openDetail(c.id)}
                    style={{
                      display: "block", width: 158, textAlign: "left" as const,
                      background: "#FFFFFF",
                      border: isHovered ? "1px solid #E0BCA8" : "1px solid #E7E1D6",
                      borderRadius: 15, padding: 0, cursor: "pointer", overflow: "hidden",
                      boxShadow: isHovered ? "0 18px 40px rgba(40,36,28,.17)" : "0 6px 18px rgba(40,36,28,.07)",
                      transformOrigin: "bottom center",
                      transform: isHovered ? hoverTransform : baseTransform,
                      transition: "transform .22s cubic-bezier(.2,.8,.2,1), box-shadow .22s ease, border-color .22s ease",
                      fontFamily: "inherit",
                    }}
                  >
                    <div style={{ height: 94, background: meta.bg, display: "flex", alignItems: "center", justifyContent: "center", borderBottom: "1px solid rgba(40,36,28,.05)" }}>
                      <div style={{ width: 62, display: "flex", flexDirection: "column", gap: 5 }}>
                        <div style={{ height: 7, borderRadius: 3, width: "62%", background: meta.dot, opacity: 0.9 }} />
                        <div style={{ height: 6, borderRadius: 3, width: "100%", background: meta.dot, opacity: 0.5 }} />
                        <div style={{ height: 6, borderRadius: 3, width: "84%", background: meta.dot, opacity: 0.5 }} />
                        <div style={{ height: 6, borderRadius: 3, width: "52%", background: meta.dot, opacity: 0.32 }} />
                      </div>
                    </div>
                    <div style={{ padding: "11px 12px 13px" }}>
                      <div style={{
                        fontFamily: "'Newsreader', Georgia, serif",
                        fontSize: 14.5, fontWeight: 500, lineHeight: "17.5px", color: "#21201C",
                        maxWidth: cm ? cm.titleWidth : undefined,
                        overflow: "hidden",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical" as const,
                      }}>{c.title}</div>
                      <div style={{ fontSize: 11, color: "#A8A194", marginTop: 4 }}>{c.capture_type} · {relativeTime(c.date)}</div>
                    </div>
                  </button>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Favorites grid ── */}
      {favCaptures.length > 0 && (
        <div style={{ width: "100%", maxWidth: 1000, marginTop: 48 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <svg width="15" height="15" viewBox="0 0 14 14" fill="none" stroke="#BD6A47" strokeWidth="1.2">
              <path d="M7 1.5l1.76 3.57 3.94.57-2.85 2.78.67 3.93L7 10.43l-3.52 1.92.67-3.93L1.3 5.64l3.94-.57Z" fill="#BD6A47" />
            </svg>
            <span style={{ fontSize: 14, color: "#9A958A", fontWeight: 500, letterSpacing: "0.02em" }}>Favorites</span>
            <span style={{ fontSize: 12, color: "#C4BEB2", fontWeight: 400 }}>({favCaptures.length})</span>
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(min(180px, 100%), 1fr))",
            gap: 10,
          }}>
            {favCaptures.map((c) => {
              const meta = getTypeMeta(c.capture_type);
              return (
                <button
                  key={c.id}
                  onClick={() => openDetail(c.id)}
                  style={{
                    display: "flex", flexDirection: "column",
                    background: "#FFFFFF",
                    border: "1px solid #ECE7DC",
                    borderRadius: 10,
                    padding: 0, overflow: "hidden",
                    cursor: "pointer", textAlign: "left" as const,
                    fontFamily: "inherit",
                    transition: "all .2s cubic-bezier(.2,.8,.2,1)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "#E0D8C8";
                    e.currentTarget.style.boxShadow = "0 6px 18px rgba(40,36,28,.07)";
                    e.currentTarget.style.transform = "translateY(-2px)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "#ECE7DC";
                    e.currentTarget.style.boxShadow = "none";
                    e.currentTarget.style.transform = "none";
                  }}
                >
                  {/* Preview area with icon + star badge */}
                  <div style={{
                    height: 80, background: meta.bg,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    position: "relative", color: meta.fg,
                  }}>
                    {/* Type icon */}
                    <svg width="22" height="22" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
                      <rect x="3" y="2" width="12" height="14" rx="1.5"/><line x1="6" y1="6" x2="12" y2="6"/><line x1="6" y1="9" x2="12" y2="9"/><line x1="6" y1="12" x2="10" y2="12"/>
                    </svg>
                    {/* Star badge */}
                    <div style={{
                      position: "absolute", top: 6, right: 6,
                      width: 20, height: 20, borderRadius: 5,
                      background: "rgba(255,255,255,.85)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <svg width="10" height="10" viewBox="0 0 14 14" fill="#BD6A47" stroke="none">
                        <path d="M7 1.5l1.76 3.57 3.94.57-2.85 2.78.67 3.93L7 10.43l-3.52 1.92.67-3.93L1.3 5.64l3.94-.57Z"/>
                      </svg>
                    </div>
                  </div>
                  {/* Title + avatar + date */}
                  <div style={{ padding: "8px 10px 10px", display: "flex", flexDirection: "column", gap: 5 }}>
                    <span style={{
                      fontSize: 13, fontWeight: 500, lineHeight: "17px", color: "#21201C",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
                    }}>{c.title}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <div style={{
                        width: 16, height: 16, borderRadius: "50%",
                        background: "#BD6A47", color: "#FFF",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 8, fontWeight: 600, flexShrink: 0,
                      }}>A</div>
                      <span style={{ fontSize: 11, color: "#B0A99C" }}>{relativeTime(c.date)}</span>
                    </div>
                  </div>
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
