import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useStore, getColorMeta } from "@/store";
import type { ChatMessage } from "@/store";
import { marked } from "marked";

import { api } from "@/lib/ipc";
import type { ChatHistoryItem, SourceRef } from "@/lib/ipc";
import { measureHeight, balancedWidth, FONTS } from "@/lib/pretext";
import ChatPattern from "./ChatPattern";

// Configure marked for inline use — no <p> wrapping for single paragraphs
marked.setOptions({ breaks: true, gfm: true });

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
function getGreeting(name?: string): string {
  const h = new Date().getHours();
  const base = h < 5 ? "Late night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : h < 22 ? "Good evening" : "Late night";
  return name ? `${base}, ${name}` : base;
}

/* ─── Markdown + citation renderer ─── */
// Renders markdown and converts [1], [2] into clickable citation badges
function RenderedMarkdown({ text, sourceRefs, onCitationClick }: {
  text: string;
  sourceRefs?: SourceRef[];
  onCitationClick?: (idx: number) => void;
}) {
  // Parse markdown → HTML
  const rawHtml = useMemo(() => {
    const html = marked.parse(text, { async: false }) as string;
    // Inject citation badges: replace [N] with styled spans
    return html.replace(/\[(\d+)\]/g, (_match, num) => {
      const n = parseInt(num, 10);
      const ref = sourceRefs?.[n - 1];
      const title = ref?.title ? ` title="${ref.title.replace(/"/g, '&quot;')}"` : ` title="Source ${n}"`;
      return `<button data-cite="${n}"${title} class="cite-badge">${n}</button>`;
    });
  }, [text, sourceRefs]);

  // Handle click delegation for citation badges
  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains("cite-badge")) {
      const num = parseInt(target.getAttribute("data-cite") || "0", 10);
      if (num > 0) onCitationClick?.(num);
    }
  }, [onCitationClick]);

  return (
    <div
      className="chat-markdown"
      onClick={handleClick}
      dangerouslySetInnerHTML={{ __html: rawHtml }}
    />
  );
}

/* ─── Collapsible References section ─── */
function ReferencesSection({ sourceRefs, onSourceClick }: {
  sourceRefs: SourceRef[];
  onSourceClick: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  if (sourceRefs.length === 0) return null;

  return (
    <div style={{ marginTop: 4 }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 7,
          background: "#F2EDE3", borderRadius: 8, padding: "6px 11px",
          border: "1px solid #E9E5DC", cursor: "pointer",
          fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
          transition: "all .12s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#CDA18C"; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#E9E5DC"; }}
      >
        <svg width="12" height="12" viewBox="0 0 14 14" fill="#9A847A"><path d="M3.5 2h7v10l-3.5-2.4L3.5 12Z" /></svg>
        <span style={{ fontSize: 12, color: "#7C7468", fontWeight: 500 }}>
          {sourceRefs.length} source{sourceRefs.length > 1 ? "s" : ""}
        </span>
        <svg
          width="10" height="10" viewBox="0 0 10 10" fill="none"
          stroke="#9A847A" strokeWidth="1.5" strokeLinecap="round"
          style={{ transition: "transform .15s", transform: expanded ? "rotate(180deg)" : "rotate(0)" }}
        >
          <polyline points="2,3.5 5,6.5 8,3.5" />
        </svg>
      </button>

      {expanded && (
        <div style={{
          display: "flex", flexDirection: "column", gap: 6,
          marginTop: 8, paddingLeft: 4,
          animation: "fadeUp .15s ease",
        }}>
          {sourceRefs.map((ref, idx) => {
            return (
              <button
                key={ref.id}
                onClick={() => onSourceClick(ref.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  background: "#FCFBF7", border: "1px solid #E7E1D4", borderRadius: 10,
                  padding: "9px 12px", cursor: "pointer", textAlign: "left" as const,
                  fontFamily: "inherit", transition: "all .12s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#CDA18C"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(40,36,28,.05)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#E7E1D4"; e.currentTarget.style.boxShadow = "none"; }}
              >
                {/* Number badge */}
                <span style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                  background: "#FBF3EE", border: "1px solid #E0C4B5",
                  color: "#9A4F30", fontSize: 10.5, fontWeight: 700,
                  fontFamily: "ui-monospace, Menlo, monospace",
                }}>
                  {idx + 1}
                </span>
                {/* Title + meta */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13.5, fontWeight: 500, color: "#21201C",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {ref.title}
                  </div>
                  <div style={{ fontSize: 11, color: "#9A958A", marginTop: 1 }}>
                    {ref.space}
                    {ref.tags.length > 0 && ` · ${ref.tags.slice(0, 3).join(", ")}`}
                  </div>
                </div>
                {/* Neutral dot */}
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#C4BEB2", flexShrink: 0 }} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Action button for chat messages (Copy, Regenerate, etc.) ─── */
function ActionBtn({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={label}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        border: "1px solid transparent", borderRadius: 7,
        background: hovered ? "#F2EDE3" : "transparent",
        borderColor: hovered ? "#E9E5DC" : "transparent",
        color: hovered ? "#5C584E" : "#B0A99C",
        padding: "4px 9px", cursor: "pointer",
        fontSize: 11.5, fontWeight: 500,
        fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
        transition: "all .12s",
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
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

  /* ── Display name from settings ── */
  const [displayName, setDisplayName] = useState("");
  useEffect(() => {
    api.getSettings().then((s) => setDisplayName(s.general.display_name || "")).catch(() => {});
  }, []);

  /* ── Capture streak (consecutive days with at least one capture) ── */
  const streak = useMemo(() => {
    if (captures.length === 0) return 0;
    const daySet = new Set(captures.map((c) => c.date.slice(0, 10)));
    const today = new Date();
    let count = 0;
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      if (daySet.has(key)) count++;
      else break;
    }
    return count;
  }, [captures]);

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
        sourceRefs: response.sources,
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

  /* ── Copy message text ── */
  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(() => showToast("Copied to clipboard"));
  }, [showToast]);

  /* ── Regenerate last AI response ── */
  const removeLastMessage = useStore((s) => s.removeLastMessage);
  const handleRegenerate = useCallback(async () => {
    if (chatThinking) return;
    const convo = useStore.getState().getActiveConversation();
    if (!convo || convo.messages.length < 2) return;

    // Remove the last AI message
    removeLastMessage();

    // Find the last user message (should now be last)
    const msgs = useStore.getState().getActiveConversation()?.messages || [];
    const lastUserMsg = [...msgs].reverse().find((m) => m.isUser);
    if (!lastUserMsg) return;

    setChatThinking(true);
    try {
      const currentMessages = useStore.getState().getActiveConversation()?.messages || [];
      const history: ChatHistoryItem[] = currentMessages
        .filter((m) => m.id !== lastUserMsg.id)
        .map((m) => ({
          role: (m.isUser ? "user" : "assistant") as "user" | "assistant",
          content: m.text,
        }));

      const currentAttached = useStore.getState().getAttached();
      const response = await api.chatSend(lastUserMsg.text, currentAttached, history);

      addMessage({
        id: crypto.randomUUID(),
        isUser: false,
        text: response.text,
        cardIds: response.source_ids,
        sources: response.source_ids.length,
        sourceRefs: response.sources,
      });
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      addMessage({
        id: crypto.randomUUID(),
        isUser: false,
        text: `Sorry, something went wrong: ${errMsg}`,
      });
    }
    setChatThinking(false);
  }, [chatThinking, removeLastMessage, addMessage, setChatThinking]);

  /* ── Save AI response to Wiki ── */
  const createCapture = useStore((s) => s.createCapture);
  const handleSaveToWiki = useCallback(async (msg: ChatMessage) => {
    // Find the user question that prompted this response
    const convo = useStore.getState().getActiveConversation();
    const msgs = convo?.messages || [];
    const msgIdx = msgs.findIndex((m) => m.id === msg.id);
    const userQuestion = msgIdx > 0 ? msgs[msgIdx - 1].text : "Chat response";

    // Title from the user question (truncated)
    const title = userQuestion.length > 80 ? userQuestion.slice(0, 77) + "…" : userQuestion;

    // Build body: question + answer
    const body = `> ${userQuestion}\n\n${msg.text}`;

    // Tags from source refs
    const tags = ["wiki", "chat-saved"];

    const capture = await createCapture(title, "wiki", "reference", tags, body, {
      chainPrev: msg.sourceRefs?.[0]?.id,
    });
    if (capture) showToast("Saved to Wiki");
  }, [createCapture, showToast]);

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
            return (
              <div key={c.id} style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                background: "#F6F0E8", border: "1px solid #E7DFD0",
                borderRadius: 8, padding: "4px 8px 4px 10px", maxWidth: 200,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: getColorMeta(c.color).dot }} />
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
        <ChatPattern />

        {/* Messages area */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px" }}>
          <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
            {messages.map((msg, idx) =>
              msg.isUser ? (
                /* User message */
                <div key={msg.id} style={{ display: "flex", justifyContent: "flex-end", animation: "fadeUp .2s ease" }}>
                  <div style={{
                    maxWidth: "78%", background: "rgba(243,233,225,0.75)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
                    border: "1px solid rgba(235,221,208,0.6)",
                    borderRadius: "14px 14px 4px 14px", padding: "11px 15px",
                    fontSize: 14.5, lineHeight: 1.5, color: "#3F3B33",
                  }}>
                    {msg.text}
                  </div>
                </div>
              ) : (
                /* AI message */
                <div key={msg.id} style={{
                  display: "flex", flexDirection: "column", gap: 11, animation: "fadeUp .2s ease",
                  background: "rgba(250,248,243,0.7)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
                  border: "1px solid rgba(231,225,214,0.5)", borderRadius: 14, padding: "14px 16px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#BD6A47" }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#9A847A" }}>BrainOS</span>
                  </div>
                  {(() => {
                    // Build effective source refs: prefer sourceRefs, fall back to cardIds
                    const effectiveRefs: SourceRef[] = (msg.sourceRefs && msg.sourceRefs.length > 0)
                      ? msg.sourceRefs
                      : (msg.cardIds || []).map((id) => {
                          const c = captures.find((cap) => cap.id === id);
                          return c
                            ? { id: c.id, title: c.title, space: c.space, capture_type: c.capture_type, tags: c.tags }
                            : { id, title: id.slice(0, 12), space: "", capture_type: "", tags: [] };
                        });

                    return (
                      <>
                        <RenderedMarkdown
                          text={msg.text}
                          sourceRefs={effectiveRefs}
                          onCitationClick={(num) => {
                            const ref = effectiveRefs[num - 1];
                            if (ref) openDetail(ref.id);
                          }}
                        />
                        {effectiveRefs.length > 0 && (
                          <ReferencesSection
                            sourceRefs={effectiveRefs}
                            onSourceClick={(id) => openDetail(id)}
                          />
                        )}
                      </>
                    );
                  })()}

                  {/* Action buttons — Copy / Regenerate */}
                  <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
                    <ActionBtn
                      icon={<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><rect x="5" y="5" width="8" height="8" rx="1.5"/><path d="M5 11H3.5A1.5 1.5 0 012 9.5v-6A1.5 1.5 0 013.5 2h6A1.5 1.5 0 0111 3.5V5"/></svg>}
                      label="Copy"
                      onClick={() => handleCopy(msg.text)}
                    />
                    <ActionBtn
                      icon={<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M3.5 2h7v10l-3.5-2.4L3.5 12Z"/></svg>}
                      label="Save to Wiki"
                      onClick={() => handleSaveToWiki(msg)}
                    />
                    {/* Only show regenerate on the last AI message */}
                    {idx === messages.length - 1 && (
                      <ActionBtn
                        icon={<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M2 8a6 6 0 0110.4-4.1M14 8a6 6 0 01-10.4 4.1"/><polyline points="2,3 2,6 5,6"/><polyline points="14,13 14,10 11,10"/></svg>}
                        label="Regenerate"
                        onClick={handleRegenerate}
                      />
                    )}
                  </div>
                </div>
              ),
            )}

            {/* Thinking — rotating text + typing dots */}
            {chatThinking && <ThinkingIndicator />}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input area — floating at bottom */}
        <div style={{
          flexShrink: 0, padding: "14px 28px 20px",
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

      {/* ── Streak badge (only shown when streak ≥ 2) ── */}
      {streak >= 2 && (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "#F3E9E1", border: "1px solid #EBDDD0", borderRadius: 999, padding: "5px 12px", marginBottom: 20, animation: "fadeUp .2s ease" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#BD6A47" }} />
          <span style={{ fontSize: 12, color: "#9A4F30", fontWeight: 500 }}>{streak}-day capture streak</span>
        </div>
      )}

      {/* ── Greeting ── */}
      <p style={{ margin: 0, fontSize: 15, color: "#A4897B" }}>{getGreeting(displayName || undefined)}</p>
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
                    <div style={{ height: 94, background: getColorMeta(c.color).bg, display: "flex", alignItems: "center", justifyContent: "center", borderBottom: "1px solid rgba(40,36,28,.05)" }}>
                      {c.icon ? (
                        <span style={{ fontSize: 32, lineHeight: 1 }}>{c.icon}</span>
                      ) : (
                        <div style={{ width: 62, display: "flex", flexDirection: "column", gap: 5 }}>
                          <div style={{ height: 7, borderRadius: 3, width: "62%", background: getColorMeta(c.color).dot, opacity: 0.9 }} />
                          <div style={{ height: 6, borderRadius: 3, width: "100%", background: getColorMeta(c.color).dot, opacity: 0.5 }} />
                          <div style={{ height: 6, borderRadius: 3, width: "84%", background: getColorMeta(c.color).dot, opacity: 0.5 }} />
                          <div style={{ height: 6, borderRadius: 3, width: "52%", background: getColorMeta(c.color).dot, opacity: 0.32 }} />
                        </div>
                      )}
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
                      <div style={{ fontSize: 11, color: "#A8A194", marginTop: 4 }}>{relativeTime(c.date)}</div>
                    </div>
                  </button>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Favorites grid — Figma project-card style ── */}
      {favCaptures.length > 0 && (
        <div style={{ width: "100%", maxWidth: 1100, marginTop: 48 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
            <svg width="15" height="15" viewBox="0 0 14 14" fill="none" stroke="#BD6A47" strokeWidth="1.2">
              <path d="M7 1.5l1.76 3.57 3.94.57-2.85 2.78.67 3.93L7 10.43l-3.52 1.92.67-3.93L1.3 5.64l3.94-.57Z" fill="#BD6A47" />
            </svg>
            <span style={{ fontSize: 14, color: "#9A958A", fontWeight: 500, letterSpacing: "0.02em" }}>Favorites</span>
            <span style={{ fontSize: 12, color: "#C4BEB2", fontWeight: 400 }}>({favCaptures.length})</span>
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(min(280px, 100%), 1fr))",
            gap: 14,
          }}>
            {favCaptures.map((c) => {
              const snippet = c.summary || "";
              return (
                <button
                  key={c.id}
                  onClick={() => openDetail(c.id)}
                  style={{
                    display: "flex", flexDirection: "column",
                    background: "#FFFFFF",
                    border: "1px solid #E8E3D8",
                    borderRadius: 14,
                    padding: 0, overflow: "hidden",
                    cursor: "pointer", textAlign: "left" as const,
                    fontFamily: "inherit",
                    transition: "all .25s cubic-bezier(.2,.8,.2,1)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "#D8D0C2";
                    e.currentTarget.style.boxShadow = "0 8px 28px rgba(40,36,28,.09)";
                    e.currentTarget.style.transform = "translateY(-3px)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "#E8E3D8";
                    e.currentTarget.style.boxShadow = "none";
                    e.currentTarget.style.transform = "none";
                  }}
                >
                  {/* ── Preview area — neutral warm, with doc-style preview ── */}
                  <div style={{
                    height: 170, background: getColorMeta(c.color).bg,
                    position: "relative", overflow: "hidden",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {/* Faded text preview (mimics document thumbnail) */}
                    {snippet ? (
                      <div style={{
                        position: "absolute", inset: 16, top: 18,
                        fontSize: 10, lineHeight: "15px", color: "#8A8579",
                        opacity: 0.3, overflow: "hidden",
                        fontFamily: "'SF Mono', 'Fira Code', monospace",
                        wordBreak: "break-word",
                        WebkitMaskImage: "linear-gradient(to bottom, black 40%, transparent 95%)",
                        maskImage: "linear-gradient(to bottom, black 40%, transparent 95%)",
                      }}>
                        {snippet.slice(0, 400)}
                      </div>
                    ) : null}
                    {/* Centered document icon or emoji */}
                    <div style={{
                      width: 48, height: 48, borderRadius: 12,
                      background: "rgba(255,255,255,.55)",
                      backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: "#8A8579", zIndex: 1,
                    }}>
                      {c.icon ? (
                        <span style={{ fontSize: 24, lineHeight: 1 }}>{c.icon}</span>
                      ) : (
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/>
                          <polyline points="14 2 14 8 20 8"/>
                          <line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>
                        </svg>
                      )}
                    </div>
                    {/* Star badge */}
                    <div style={{
                      position: "absolute", top: 10, right: 10,
                      width: 24, height: 24, borderRadius: 7,
                      background: "rgba(255,255,255,.8)",
                      backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <svg width="12" height="12" viewBox="0 0 14 14" fill="#BD6A47" stroke="none">
                        <path d="M7 1.5l1.76 3.57 3.94.57-2.85 2.78.67 3.93L7 10.43l-3.52 1.92.67-3.93L1.3 5.64l3.94-.57Z"/>
                      </svg>
                    </div>
                  </div>

                  {/* ── Card body — title, snippet, metadata ── */}
                  <div style={{ padding: "12px 14px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
                    {/* Title */}
                    <span style={{
                      fontSize: 14.5, fontWeight: 600, lineHeight: "20px", color: "#21201C",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
                    }}>{c.title}</span>

                    {/* Snippet */}
                    {snippet && (
                      <span style={{
                        fontSize: 12, lineHeight: "17px", color: "#8A8579",
                        display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const,
                        overflow: "hidden", textOverflow: "ellipsis",
                      }}>{snippet}</span>
                    )}

                    {/* Tags row */}
                    {c.tags.length > 0 && (
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 2 }}>
                        {c.tags.slice(0, 3).map((tag) => (
                          <span key={tag} style={{
                            fontSize: 10, color: "#9A958A", background: "#F5F3ED",
                            borderRadius: 4, padding: "1px 6px", fontWeight: 500,
                          }}>#{tag}</span>
                        ))}
                        {c.tags.length > 3 && (
                          <span style={{ fontSize: 10, color: "#B0A99C" }}>+{c.tags.length - 3}</span>
                        )}
                      </div>
                    )}

                    {/* Avatar + date row */}
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                      <div style={{
                        width: 20, height: 20, borderRadius: "50%",
                        background: "#E8E5DD", color: "#7C7468",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 9, fontWeight: 600, flexShrink: 0,
                      }}>Y</div>
                      <span style={{ fontSize: 11.5, color: "#B0A99C", fontWeight: 450 }}>You</span>
                      <span style={{ fontSize: 11.5, color: "#C4BEB2" }}>·</span>
                      <span style={{ fontSize: 11.5, color: "#B0A99C" }}>{relativeTime(c.date)}</span>
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
