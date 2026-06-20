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

/* ─── Chat message type ─── */
interface LocalMsg {
  id: string;
  isUser: boolean;
  text: string;
  cardIds?: string[];
  sources?: number;
}

/* ─── Component ─── */
export default function HomeView() {
  const captures = useStore((s) => s.captures);
  const openDetail = useStore((s) => s.openDetail);
  const openNew = useStore((s) => s.openNew);
  const togglePalette = useStore((s) => s.togglePalette);
  const ragMode = useStore((s) => s.ragMode);
  const toggleRag = useStore((s) => s.toggleRag);
  const goBrowse = useStore((s) => s.goBrowse);
  const attached = useStore((s) => s.attached);
  const detach = useStore((s) => s.detach);
  const showToast = useStore((s) => s.showToast);

  /* ── Home state ── */
  const [draft, setDraft] = useState("");
  const [phIdx, setPhIdx] = useState(0);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  /* ── Chat state ── */
  const [chatActive, setChatActive] = useState(false);
  const [messages, setMessages] = useState<LocalMsg[]>([]);
  const [thinking, setThinking] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const attachedCaptures = useMemo(
    () => attached.map((id) => captures.find((c) => c.id === id)).filter(Boolean),
    [attached, captures],
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
  }, [messages.length, thinking, chatActive]);

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
    if (!text || thinking) return;

    const userMsg: LocalMsg = { id: crypto.randomUUID(), isUser: true, text };

    if (!chatActive) setChatActive(true);

    setMessages((prev) => [...prev, userMsg]);
    setDraft("");
    setThinking(true);

    try {
      const history: ChatHistoryItem[] = messages.map((m) => ({
        role: (m.isUser ? "user" : "assistant") as "user" | "assistant",
        content: m.text,
      }));

      const response = await api.chatSend(text, attached, history);

      const aiMsg: LocalMsg = {
        id: crypto.randomUUID(),
        isUser: false,
        text: response.text,
        cardIds: response.source_ids,
        sources: response.source_ids.length,
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      const aiMsg: LocalMsg = {
        id: crypto.randomUUID(),
        isUser: false,
        text: errMsg.includes("API key") || errMsg.includes("not configured")
          ? `⚠ ${errMsg}\n\nGo to **Settings** to configure your AI provider and API key.`
          : `Sorry, something went wrong: ${errMsg}`,
      };
      setMessages((prev) => [...prev, aiMsg]);
      showToast("Chat error — check settings");
    }
    setThinking(false);
  }, [draft, thinking, chatActive, messages, attached, showToast]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setChatActive(false);
    setDraft("");
  }, []);

  const handleChipClick = useCallback(
    (s: (typeof SUGGESTIONS)[number]) => {
      if (s.action === "new") openNew();
      else if (s.action === "browse") goBrowse("type", "debugging", "Type · debugging");
      else setDraft(s.label);
    },
    [openNew, goBrowse],
  );

  const ragDotColor = ragMode === "auto" ? "#5F8C5A" : "#A8A096";
  const ragLabel = ragMode === "auto" ? "Auto RAG" : "Manual";

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

  const allCount = captures.length + (captures.length === 1 ? " capture" : " captures");

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
      {/* Context chips — attached captures (shown in chat mode) */}
      {chatActive && attachedCaptures.length > 0 && (
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
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* + attach button */}
          <button
            onClick={() => togglePalette()}
            title="Attach captures"
            style={{
              width: chatActive ? 30 : 32, height: chatActive ? 30 : 32,
              display: "flex", alignItems: "center", justifyContent: "center",
              border: "1px solid #E7E1D6", background: "#FBFAF6",
              borderRadius: chatActive ? 8 : 9, color: "#8C887E", cursor: "pointer",
            }}
          >
            <svg width={chatActive ? 13 : 14} height={chatActive ? 13 : 14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6">
              <line x1="7" y1="2.5" x2="7" y2="11.5" /><line x1="2.5" y1="7" x2="11.5" y2="7" />
            </svg>
          </button>
          {/* RAG toggle (home mode only) */}
          {!chatActive && (
            <button
              onClick={() => toggleRag()}
              style={{
                display: "flex", alignItems: "center", gap: 7,
                border: "1px solid #E7E1D6", background: "#FBFAF6",
                borderRadius: 9, padding: "6px 11px", cursor: "pointer",
                fontSize: 12.5, color: "#56524A", fontFamily: "inherit",
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: ragDotColor }} />
              {ragLabel}
            </button>
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
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Chat header — new chat + back */}
        <div style={{
          flexShrink: 0, display: "flex", alignItems: "center", gap: 12,
          padding: "10px 28px", borderBottom: "1px solid #E9E5DC",
        }}>
          <button
            onClick={handleNewChat}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              border: "none", background: "transparent", color: "#9A968B",
              fontSize: 13, cursor: "pointer", padding: 0, fontFamily: "inherit",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "#4A463E"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "#9A968B"; }}
          >
            <svg width="15" height="15" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <line x1="14" y1="9" x2="4" y2="9" /><polyline points="8,5 4,9 8,13" />
            </svg>
            Home
          </button>
          <span style={{ fontSize: 13, color: "#9A968B" }}>Conversation</span>
          <div style={{ flex: 1 }} />
          <button
            onClick={handleNewChat}
            style={{
              border: "1px solid #E7E1D6", background: "#FFFFFF", color: "#56524A",
              borderRadius: 9, padding: "7px 13px", fontSize: 13, cursor: "pointer", fontFamily: "inherit",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#D8D1C2"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#E7E1D6"; }}
          >
            New chat
          </button>
        </div>

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

            {/* Thinking dots */}
            {thinking && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, animation: "fadeUp .2s ease" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#BD6A47" }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#9A847A" }}>BrainOS</span>
                </div>
                <div style={{ display: "flex", gap: 5, padding: 2 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#C9B8AE", animation: "blink 1s infinite" }} />
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#C9B8AE", animation: "blink 1s infinite .18s" }} />
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#C9B8AE", animation: "blink 1s infinite .36s" }} />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input area — anchored at bottom */}
        <div style={{ flexShrink: 0, padding: "14px 28px 20px", borderTop: "1px solid #E9E5DC", background: "#F5F3ED" }}>
          {inputCard}
        </div>

        <style>{`
          @keyframes blink {
            0%, 100% { opacity: .3; }
            50% { opacity: 1; }
          }
          @keyframes fadeUp {
            from { opacity: 0; transform: translateY(6px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════
   *  HOME MODE (no active chat)
   * ══════════════════════════════════════════════════ */
  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
    <div style={{ width: "100%", padding: "64px 32px 56px", display: "flex", flexDirection: "column", alignItems: "center" }}>

      {/* ── Streak badge ── */}
      <div style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "#F3E9E1", border: "1px solid #EBDDD0", borderRadius: 999, padding: "5px 12px", marginBottom: 20, animation: "fadeUp .2s ease" }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#BD6A47" }} />
        <span style={{ fontSize: 12, color: "#9A4F30", fontWeight: 500 }}>7-day capture streak</span>
      </div>

      {/* ── Greeting ── */}
      <p style={{ margin: 0, fontSize: 15, color: "#A4897B" }}>{getGreeting("Aakash")}</p>
      <h1 style={{ margin: "6px 0 0", fontFamily: "'Newsreader', Georgia, serif", fontWeight: 400, fontSize: 42, lineHeight: 1.1, color: "#21201C", letterSpacing: "-0.015em", textAlign: "center" }}>
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
          <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-end", padding: "18px 0 6px" }}>
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

      {/* ── All captures · list table ── */}
      {captures.length > 0 && (
        <div style={{ width: "100%", maxWidth: 1000, marginTop: 44 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 6, padding: "0 4px" }}>
            <span style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 18, fontWeight: 500, color: "#21201C" }}>All captures</span>
            <span style={{ fontSize: 12, color: "#B0A99C", fontFamily: "ui-monospace, Menlo, monospace" }}>{allCount}</span>
            <div style={{ flex: 1 }} />
            <button
              onClick={() => openNew()}
              style={{ display: "flex", alignItems: "center", gap: 7, border: "1px solid #E7E1D6", background: "#FFFFFF", color: "#56524A", borderRadius: 8, padding: "6px 11px", fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#D8D1C2"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#E7E1D6"; }}
            >
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7"><line x1="7" y1="2.5" x2="7" y2="11.5" /><line x1="2.5" y1="7" x2="11.5" y2="7" /></svg>
              New capture
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderBottom: "1px solid #E6E1D6", fontSize: 11, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase" as const, color: "#A09A8C" }}>
            <span style={{ flex: 1 }}>Name</span>
            <span style={{ width: 130 }}>Type</span>
            <span style={{ width: 120 }}>Space</span>
            <span style={{ width: 90, textAlign: "right" as const }}>Updated</span>
          </div>

          {captures.map((c) => {
            const meta = getTypeMeta(c.capture_type);
            const isRowHovered = hoveredRow === c.id;
            return (
              <div
                key={c.id}
                onClick={() => openDetail(c.id)}
                onMouseEnter={() => setHoveredRow(c.id)}
                onMouseLeave={() => setHoveredRow(null)}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "11px 14px", borderBottom: "1px solid #EEE9DF",
                  cursor: "pointer", borderRadius: 8,
                  transition: "background .14s ease, transform .14s ease, box-shadow .14s ease",
                  background: isRowHovered ? "#FBFAF6" : "transparent",
                  transform: isRowHovered ? "translateX(3px)" : "none",
                  boxShadow: isRowHovered ? "0 2px 12px rgba(40,36,28,.05)" : "none",
                }}
              >
                <div style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 8, background: meta.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: meta.dot }} />
                </div>
                <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: "#2B2823", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.title}</span>
                <span style={{ width: 130 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: meta.bg, color: meta.fg, borderRadius: 6, padding: "3px 9px", fontSize: 11.5, fontWeight: 600 }}>{c.capture_type}</span>
                </span>
                <span style={{ width: 120, fontSize: 13, color: "#7C7468" }}>{c.space}</span>
                <span style={{ width: 90, textAlign: "right" as const, fontSize: 12.5, color: "#A8A194" }}>{relativeTime(c.date)}</span>
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
    </div>
  );
}
