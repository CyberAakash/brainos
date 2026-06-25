import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useStore, getColorMeta } from "@/store";
import type { ChatMessage } from "@/store";
import { marked } from "marked";
import { api } from "@/lib/ipc";
import type { ChatHistoryItem, SourceRef } from "@/lib/ipc";
import ChatPattern from "./ChatPattern";

// Configure marked
marked.setOptions({ breaks: true, gfm: true });

/* ─── Markdown + citation renderer (extracted from HomeView) ─── */
function RenderedMarkdown({ text, sourceRefs, onCitationClick }: {
  text: string;
  sourceRefs?: SourceRef[];
  onCitationClick?: (idx: number) => void;
}) {
  const rawHtml = useMemo(() => {
    const html = marked.parse(text, { async: false }) as string;
    return html.replace(/\[(\d+)\]/g, (_match, num) => {
      const n = parseInt(num, 10);
      const ref = sourceRefs?.[n - 1];
      const title = ref?.title ? ` title="${ref.title.replace(/"/g, '&quot;')}"` : ` title="Source ${n}"`;
      return `<button data-cite="${n}"${title} class="cite-badge">${n}</button>`;
    });
  }, [text, sourceRefs]);

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

/* ─── References section ─── */
function ReferencesSection({ sourceRefs, onSourceClick }: {
  sourceRefs: SourceRef[];
  onSourceClick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (sourceRefs.length === 0) return null;
  return (
    <div style={{ marginTop: 4 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          border: "none", background: "transparent", cursor: "pointer",
          fontSize: 11.5, color: "var(--text-faint)", fontWeight: 500,
          padding: "2px 0", fontFamily: "inherit",
        }}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)", transition: "transform .15s" }}>
          <path d="M3.5 1.5L7 5L3.5 8.5" />
        </svg>
        {sourceRefs.length} source{sourceRefs.length !== 1 ? "s" : ""}
      </button>
      {open && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
          {sourceRefs.map((ref, i) => (
            <button
              key={ref.id + i}
              onClick={() => onSourceClick(ref.id)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                background: "var(--bg-elevated)", border: "1px solid var(--border)",
                borderRadius: 7, padding: "4px 9px", cursor: "pointer",
                fontSize: 11.5, color: "var(--text-heading)", fontFamily: "inherit",
                maxWidth: 220, overflow: "hidden", whiteSpace: "nowrap" as const,
                textOverflow: "ellipsis",
              }}
            >
              <span style={{ fontWeight: 600, color: "var(--accent)", fontSize: 10 }}>{i + 1}</span>
              {ref.title || ref.id.slice(0, 12)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Action button ─── */
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
        background: hovered ? "var(--bg-elevated)" : "transparent",
        borderColor: hovered ? "var(--border)" : "transparent",
        color: hovered ? "var(--text-secondary)" : "var(--text-dimmed)",
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

/* ─── Thinking indicator ─── */
const THINKING_PHASES = [
  "Searching knowledge base…",
  "Finding relevant captures…",
  "Building context…",
  "Composing response…",
];

function ThinkingIndicator() {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setPhase((p) => (p + 1) % THINKING_PHASES.length), 2200);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, animation: "fadeUp .2s ease" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)" }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-faint)" }}>BrainOS</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "2px 0" }}>
        <div style={{ display: "flex", gap: 4 }}>
          <span className="typing-dot" style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--text-ghost)" }} />
          <span className="typing-dot" style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--text-ghost)" }} />
          <span className="typing-dot" style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--text-ghost)" }} />
        </div>
        <span key={phase} style={{ fontSize: 13, color: "var(--text-faint)", fontStyle: "italic", animation: "rotateText .3s ease" }}>
          {THINKING_PHASES[phase]}
        </span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ChatPanel — full chat UI for the left dock.
   Tab bar at top, messages area, input at bottom.
   ═══════════════════════════════════════════════════════════════ */
export default function ChatPanel() {
  const captures = useStore((s) => s.captures);
  const openDetail = useStore((s) => s.openDetail);
  const openPaletteAttach = useStore((s) => s.openPaletteAttach);
  const detach = useStore((s) => s.detach);
  const showToast = useStore((s) => s.showToast);

  // Conversation state
  const activeConversationId = useStore((s) => s.activeConversationId);
  const conversations = useStore((s) => s.conversations);
  const newConversation = useStore((s) => s.newConversation);
  const addMessage = useStore((s) => s.addMessage);
  const setChatThinking = useStore((s) => s.setChatThinking);
  const chatThinking = useStore((s) => s.chatThinking);

  // Chat tab state
  const openChatTabs = useStore((s) => s.openChatTabs);
  const openChatTab = useStore((s) => s.openChatTab);
  const closeChatTab = useStore((s) => s.closeChatTab);
  const chatHistoryOpen = useStore((s) => s.chatHistoryOpen);
  const toggleChatHistory = useStore((s) => s.toggleChatHistory);

  const activeConvo = useMemo(
    () => conversations.find((c) => c.id === activeConversationId) || null,
    [conversations, activeConversationId],
  );
  const messages = activeConvo?.messages || [];
  const attached = activeConvo?.attached || [];

  const attachedCaptures = useMemo(
    () => attached.map((id) => captures.find((c) => c.id === id)).filter(Boolean),
    [attached, captures],
  );

  /* ── Local state ── */
  const [draft, setDraft] = useState("");
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null);
  const [attachMenu, setAttachMenu] = useState<null | "open">(null);
  const attachBtnRef = useRef<HTMLButtonElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const tabScrollRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLDivElement>(null);

  // Auto-scroll active tab into view in the tab strip
  useEffect(() => {
    activeTabRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [activeConversationId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, chatThinking]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + "px";
    }
  }, [draft]);

  // Focus textarea on mount or active convo change
  useEffect(() => {
    setTimeout(() => textareaRef.current?.focus(), 60);
  }, [activeConversationId]);

  /* ── Send message ── */
  const handleSend = useCallback(async () => {
    const text = draft.trim();
    if (!text || chatThinking) return;

    const editId = useStore.getState().editingMessageId;
    if (editId) {
      useStore.getState().truncateFromMessage(editId);
    }

    if (!activeConversationId && !editId) {
      newConversation();
    }

    const userMsg = { id: crypto.randomUUID(), isUser: true, text };
    addMessage(userMsg);
    setDraft("");
    setPreDraft("");
    setChatThinking(true);

    try {
      const currentMessages = useStore.getState().getActiveConversation()?.messages || [];
      const history: ChatHistoryItem[] = currentMessages
        .filter((m) => m.id !== userMsg.id)
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

  /* ── Copy ── */
  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(() => showToast("Copied to clipboard"));
  }, [showToast]);

  /* ── Edit message ── */
  const editingMessageId = useStore((s) => s.editingMessageId);
  const setEditingMessageId = useStore((s) => s.setEditingMessageId);
  const [preDraft, setPreDraft] = useState("");

  const handleEditMessage = useCallback((msgId: string) => {
    const convo = useStore.getState().getActiveConversation();
    const msg = convo?.messages.find((m) => m.id === msgId);
    if (!msg) return;
    setPreDraft(draft);
    setDraft(msg.text);
    setEditingMessageId(msgId);
    setTimeout(() => textareaRef.current?.focus(), 60);
  }, [draft, setEditingMessageId]);

  const handleCancelEdit = useCallback(() => {
    setDraft(preDraft);
    setEditingMessageId(null);
  }, [preDraft, setEditingMessageId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      } else if (e.key === "Escape" && useStore.getState().editingMessageId) {
        e.preventDefault();
        handleCancelEdit();
      }
    },
    [handleSend, handleCancelEdit],
  );

  /* ── Regenerate ── */
  const removeLastMessage = useStore((s) => s.removeLastMessage);
  const handleRegenerate = useCallback(async () => {
    if (chatThinking) return;
    const convo = useStore.getState().getActiveConversation();
    if (!convo || convo.messages.length < 2) return;
    removeLastMessage();
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

  /* ── Save to wiki ── */
  const createCapture = useStore((s) => s.createCapture);
  const handleSaveToWiki = useCallback(async (msg: ChatMessage) => {
    const convo = useStore.getState().getActiveConversation();
    const msgs = convo?.messages || [];
    const msgIdx = msgs.findIndex((m) => m.id === msg.id);
    const userQuestion = msgIdx > 0 ? msgs[msgIdx - 1].text : "Chat response";
    const title = userQuestion.length > 80 ? userQuestion.slice(0, 77) + "…" : userQuestion;
    const body = `> ${userQuestion}\n\n${msg.text}`;
    const tags = ["wiki", "chat-saved"];
    const capture = await createCapture(title, "wiki", "reference", tags, body, {
      chainPrev: msg.sourceRefs?.[0]?.id,
    });
    if (capture) showToast("Saved to Wiki");
  }, [createCapture, showToast]);

  /* ── New chat handler ── */
  const handleNewChat = useCallback(() => {
    newConversation();
  }, [newConversation]);

  /* ── Tab data ── */
  const tabConvos = useMemo(
    () => openChatTabs.map((id) => conversations.find((c) => c.id === id)).filter(Boolean),
    [openChatTabs, conversations],
  );

  const hasActiveConvo = activeConvo !== null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", background: "var(--bg-input)" }}>
      {/* ── Tab bar ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 0,
        height: 34, flexShrink: 0,
        background: "var(--bg-surface)",
        borderBottom: "1px solid var(--border)",
        overflow: "hidden",
      }}>
        {/* History toggle — always first, pinned */}
        <button
          onClick={toggleChatHistory}
          title={chatHistoryOpen ? "Hide history" : "Show history"}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 30, height: "100%", border: "none",
            background: chatHistoryOpen ? "var(--bg-elevated)" : "transparent",
            color: "var(--text-muted)", cursor: "pointer",
            borderRight: "1px solid var(--border)",
            flexShrink: 0, padding: 0,
          }}
          onMouseEnter={(e) => { if (!chatHistoryOpen) e.currentTarget.style.background = "var(--bg-hover)"; }}
          onMouseLeave={(e) => { if (!chatHistoryOpen) e.currentTarget.style.background = "transparent"; }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
            <line x1="2" y1="4" x2="14" y2="4" />
            <line x1="2" y1="8" x2="14" y2="8" />
            <line x1="2" y1="12" x2="10" y2="12" />
          </svg>
        </button>

        {/* Scrollable tab strip */}
        <div
          ref={tabScrollRef}
          className="chat-tab-scroll"
          style={{
            display: "flex", alignItems: "center",
            flex: 1, minWidth: 0, height: "100%",
            overflowX: "auto", overflowY: "hidden",
          }}
        >
          {tabConvos.map((c) => {
            if (!c) return null;
            const isActive = c.id === activeConversationId;
            return (
              <div
                key={c.id}
                ref={isActive ? activeTabRef : undefined}
                onClick={() => openChatTab(c.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "0 10px", height: "100%",
                  fontSize: 12, fontWeight: 500,
                  color: isActive ? "var(--text-primary)" : "var(--text-faint)",
                  background: isActive ? "var(--bg-input)" : "transparent",
                  borderRight: "1px solid var(--border)",
                  cursor: "pointer",
                  minWidth: 100, maxWidth: 160, flexShrink: 0,
                  transition: "background .1s, color .1s",
                  fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
                }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                  {c.title || "New chat"}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); closeChatTab(c.id); }}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    width: 16, height: 16, border: "none", background: "transparent",
                    color: "var(--text-ghost)", cursor: "pointer", borderRadius: 3,
                    flexShrink: 0, padding: 0,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = "var(--text-muted)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-ghost)"; }}
                >
                  <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <line x1="2" y1="2" x2="8" y2="8" /><line x1="8" y1="2" x2="2" y2="8" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>

        {/* New tab button — pinned right */}
        <button
          onClick={handleNewChat}
          title="New chat"
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 28, height: 28, border: "none", background: "transparent",
            color: "var(--text-ghost)", cursor: "pointer", borderRadius: 5,
            flexShrink: 0, margin: "0 4px",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = "var(--text-muted)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-ghost)"; }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4">
            <line x1="6" y1="2" x2="6" y2="10" /><line x1="2" y1="6" x2="10" y2="6" />
          </svg>
        </button>
      </div>

      {/* ── Chat content ── */}
      {hasActiveConvo ? (
        <>
          <ChatPattern />
          {/* Messages area */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 14px", position: "relative" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {messages.map((msg, idx) =>
                msg.isUser ? (
                  /* User message */
                  <div
                    key={msg.id}
                    style={{ display: "flex", justifyContent: "flex-end", alignItems: "flex-end", gap: 6, animation: "fadeUp .2s ease" }}
                    onMouseEnter={() => setHoveredMsgId(msg.id)}
                    onMouseLeave={() => setHoveredMsgId(null)}
                  >
                    {hoveredMsgId === msg.id && !chatThinking && (
                      <button
                        onClick={() => handleEditMessage(msg.id)}
                        title="Edit & retry"
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "center",
                          width: 24, height: 24, border: "none", borderRadius: 6,
                          background: "rgba(var(--shadow-color), .05)", cursor: "pointer",
                          color: "var(--text-faint)", flexShrink: 0,
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z" />
                        </svg>
                      </button>
                    )}
                    <div style={{
                      maxWidth: "85%",
                      background: "var(--chat-user-bg)",
                      backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
                      border: editingMessageId === msg.id ? "1px solid var(--accent)" : "1px solid var(--chat-user-border)",
                      borderRadius: "12px 12px 4px 12px", padding: "9px 13px",
                      fontSize: 13.5, lineHeight: 1.5, color: "var(--text-heading)",
                    }}>
                      {msg.text}
                    </div>
                  </div>
                ) : (
                  /* AI message */
                  <div key={msg.id} style={{
                    display: "flex", flexDirection: "column", gap: 9, animation: "fadeUp .2s ease",
                    background: "var(--chat-ai-bg)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
                    border: "1px solid var(--chat-ai-border)", borderRadius: 12, padding: "12px 14px",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--accent)" }} />
                      <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-faint)" }}>BrainOS</span>
                    </div>
                    {(() => {
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
                            <ReferencesSection sourceRefs={effectiveRefs} onSourceClick={(id) => openDetail(id)} />
                          )}
                        </>
                      );
                    })()}
                    <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
                      <ActionBtn
                        icon={<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><rect x="5" y="5" width="8" height="8" rx="1.5"/><path d="M5 11H3.5A1.5 1.5 0 012 9.5v-6A1.5 1.5 0 013.5 2h6A1.5 1.5 0 0111 3.5V5"/></svg>}
                        label="Copy"
                        onClick={() => handleCopy(msg.text)}
                      />
                      <ActionBtn
                        icon={<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M3.5 2h7v10l-3.5-2.4L3.5 12Z"/></svg>}
                        label="Save"
                        onClick={() => handleSaveToWiki(msg)}
                      />
                      {idx === messages.length - 1 && (
                        <ActionBtn
                          icon={<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M2 8a6 6 0 0110.4-4.1M14 8a6 6 0 01-10.4 4.1"/><polyline points="2,3 2,6 5,6"/><polyline points="14,13 14,10 11,10"/></svg>}
                          label="Retry"
                          onClick={handleRegenerate}
                        />
                      )}
                    </div>
                  </div>
                ),
              )}
              {chatThinking && <ThinkingIndicator />}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* ── Input area ── */}
          <div style={{ flexShrink: 0, padding: "10px 14px 14px", zIndex: 2 }}>
            <div style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: "10px 10px 8px",
              boxShadow: "0 1px 3px rgba(var(--shadow-color), .05)",
            }}>
              {/* Attached captures */}
              {attachedCaptures.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 6, paddingBottom: 6, borderBottom: "1px solid var(--bg-input)" }}>
                  {attachedCaptures.map((c) => {
                    if (!c) return null;
                    return (
                      <div key={c.id} style={{
                        display: "inline-flex", alignItems: "center", gap: 5,
                        background: "var(--bg-elevated)", border: "1px solid var(--border)",
                        borderRadius: 6, padding: "3px 7px", maxWidth: 180,
                      }}>
                        <span style={{ width: 5, height: 5, borderRadius: "50%", flexShrink: 0, background: getColorMeta(c.color).dot }} />
                        <span onClick={() => openDetail(c.id)} style={{ fontSize: 11, color: "var(--text-heading)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", cursor: "pointer", flex: 1 }}>{c.title}</span>
                        <button onClick={() => detach(c.id)} style={{ display: "flex", alignItems: "center", justifyContent: "center", border: "none", background: "transparent", color: "var(--text-dimmed)", cursor: "pointer", padding: 0 }}>
                          <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6">
                            <line x1="3" y1="3" x2="9" y2="9" /><line x1="9" y1="3" x2="3" y2="9" />
                          </svg>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Edit banner */}
              {editingMessageId && (
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "5px 7px", marginBottom: 6,
                  background: "var(--accent-bg)", border: "1px solid var(--border)", borderRadius: 6,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="var(--accent)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z" />
                    </svg>
                    <span style={{ fontSize: 11, color: "var(--accent-text)", fontWeight: 500 }}>Editing</span>
                  </div>
                  <button onClick={handleCancelEdit} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 11, color: "var(--accent)", fontWeight: 500, padding: "1px 4px", borderRadius: 3, fontFamily: "inherit" }}>
                    Cancel
                  </button>
                </div>
              )}

              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask a follow-up…"
                rows={1}
                style={{
                  width: "100%", border: "none", outline: "none", resize: "none",
                  background: "transparent", fontFamily: "inherit",
                  fontSize: 13.5, lineHeight: 1.5,
                  color: "var(--text-primary)", minHeight: 22,
                }}
              />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, position: "relative" }}>
                  <button
                    ref={attachBtnRef}
                    onClick={() => setAttachMenu((m) => m ? null : "open")}
                    title="Attach context"
                    style={{
                      width: 28, height: 28,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      border: attachMenu ? "1px solid var(--accent)" : "1px solid var(--border)",
                      background: attachMenu ? "var(--accent-bg)" : "var(--bg-surface)",
                      borderRadius: 7, color: attachMenu ? "var(--accent)" : "var(--text-muted)", cursor: "pointer",
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6">
                      <line x1="7" y1="2.5" x2="7" y2="11.5" /><line x1="2.5" y1="7" x2="11.5" y2="7" />
                    </svg>
                  </button>
                  {attachMenu && (
                    <>
                      <div onClick={() => setAttachMenu(null)} style={{ position: "fixed", inset: 0, zIndex: 99 }} />
                      <div style={{
                        position: "absolute", bottom: "calc(100% + 6px)", left: 0, zIndex: 100,
                        background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10,
                        boxShadow: "0 8px 28px rgba(var(--shadow-color), .12)", minWidth: 180, overflow: "hidden",
                        animation: "fadeUp .12s ease",
                      }}>
                        <button
                          onClick={() => { setAttachMenu(null); openPaletteAttach(); }}
                          style={{
                            width: "100%", display: "flex", alignItems: "center", gap: 8,
                            padding: "9px 12px", border: "none", background: "transparent",
                            cursor: "pointer", fontSize: 12.5, color: "var(--text-heading)",
                            fontFamily: "inherit", textAlign: "left",
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-surface)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                        >
                          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="var(--text-muted)" strokeWidth="1.4" strokeLinecap="round">
                            <circle cx="7" cy="7" r="5" /><path d="M11 11l3 3" />
                          </svg>
                          <div>
                            <div style={{ fontWeight: 500 }}>Attach capture</div>
                            <div style={{ fontSize: 10.5, color: "var(--text-faint)", marginTop: 1 }}>Search knowledge base</div>
                          </div>
                        </button>
                      </div>
                    </>
                  )}
                </div>
                <button
                  onClick={handleSend}
                  title="Send"
                  style={{
                    width: 28, height: 28,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    border: "none", background: "var(--accent)",
                    borderRadius: 7, color: "var(--bg-card)", cursor: "pointer",
                    boxShadow: "0 1px 3px rgba(var(--shadow-accent), .3)",
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="9" y1="14" x2="9" y2="4" /><polyline points="4.5,8.5 9,4 13.5,8.5" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </>
      ) : (
        /* ── Empty state — no active conversation ── */
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 24 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--bg-elevated)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="var(--text-ghost)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 4h14v9H7l-4 3.5V4z" />
            </svg>
          </div>
          <span style={{ fontSize: 13, color: "var(--text-faint)", textAlign: "center" }}>
            Select a conversation or start a new one
          </span>
          <button
            onClick={handleNewChat}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "7px 14px", border: "1px solid var(--border)",
              background: "var(--bg-card)", borderRadius: 8,
              cursor: "pointer", fontSize: 12.5, color: "var(--text-heading)",
              fontFamily: "inherit", fontWeight: 500,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4">
              <line x1="6" y1="2" x2="6" y2="10" /><line x1="2" y1="6" x2="10" y2="6" />
            </svg>
            New chat
          </button>
        </div>
      )}
    </div>
  );
}
