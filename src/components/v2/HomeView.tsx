import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useStore, getColorMeta } from "@/store";
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
function getGreeting(name?: string): string {
  const h = new Date().getHours();
  const base = h < 5 ? "Late night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : h < 22 ? "Good evening" : "Late night";
  return name ? `${base}, ${name}` : base;
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

/* ═══════════════════════════════════════════════════════════════
   HomeView — Pure dashboard (no chat).
   Chat is now in ChatPanel within the left dock.
   This view shows: greeting, input card (starts new chat),
   suggestion chips, recent captures, favorites.
   ═══════════════════════════════════════════════════════════════ */
export default function HomeView() {
  const captures = useStore((s) => s.captures);
  const openDetail = useStore((s) => s.openDetail);
  const openNew = useStore((s) => s.openNew);
  const goBrowse = useStore((s) => s.goBrowse);
  const favorites = useStore((s) => s.favorites);
  const showToast = useStore((s) => s.showToast);

  // Chat: starting a new conversation from home input opens the chat panel
  const newConversation = useStore((s) => s.newConversation);
  const addMessage = useStore((s) => s.addMessage);
  const setChatThinking = useStore((s) => s.setChatThinking);
  const setLeftDockPanel = useStore((s) => s.setLeftDockPanel);

  /* ── Display name from settings ── */
  const [displayName, setDisplayName] = useState("");
  useEffect(() => {
    api.getSettings().then((s) => setDisplayName(s.general.display_name || "")).catch(() => {});
  }, []);

  /* ── Capture streak ── */
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const favCaptures = useMemo(
    () => captures.filter((c) => favorites.includes(c.id) && c.status !== "archived"),
    [captures, favorites],
  );

  // Cycle placeholders
  useEffect(() => {
    const id = setInterval(() => setPhIdx((i) => (i + 1) % PLACEHOLDERS.length), 3600);
    return () => clearInterval(id);
  }, []);

  /* ── Send from home: creates a new conversation and switches to chat dock ── */
  const handleSend = useCallback(async () => {
    const text = draft.trim();
    if (!text) return;

    // Create conversation, switch to chat dock
    newConversation();
    setLeftDockPanel("chat");

    const userMsg = { id: crypto.randomUUID(), isUser: true, text };
    addMessage(userMsg);
    setDraft("");
    setChatThinking(true);

    try {
      const history: ChatHistoryItem[] = [];
      const response = await api.chatSend(text, [], history);

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
  }, [draft, newConversation, addMessage, setChatThinking, setLeftDockPanel, showToast]);

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

  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
    <div style={{ width: "100%", padding: "clamp(32px, 5vw, 64px) clamp(16px, 3vw, 32px) 56px", display: "flex", flexDirection: "column", alignItems: "center" }}>

      {/* ── Streak badge ── */}
      {streak >= 2 && (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "var(--accent-bg)", border: "1px solid var(--border)", borderRadius: 999, padding: "5px 12px", marginBottom: 20, animation: "fadeUp .2s ease" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)" }} />
          <span style={{ fontSize: 12, color: "var(--accent-text)", fontWeight: 500 }}>{streak}-day capture streak</span>
        </div>
      )}

      {/* ── Greeting ── */}
      <p style={{ margin: 0, fontSize: 15, color: "var(--text-faint)" }}>{getGreeting(displayName || undefined)}</p>
      <h1 style={{ margin: "6px 0 0", fontFamily: "'Newsreader', Georgia, serif", fontWeight: 400, fontSize: "clamp(28px, 4vw, 42px)", lineHeight: 1.1, color: "var(--text-primary)", letterSpacing: "-0.015em", textAlign: "center" }}>
        What did you learn today?
      </h1>

      {/* ── Input card ── */}
      <div style={{ width: "100%", maxWidth: 680, marginTop: 28 }}>
        <div style={{
          width: "100%", maxWidth: 680,
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 18,
          padding: "16px 16px 12px",
          boxShadow: "0 1px 3px rgba(var(--shadow-color), .05), 0 12px 32px rgba(var(--shadow-color), .045)",
        }}>
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={PLACEHOLDERS[phIdx]}
            rows={1}
            style={{
              width: "100%", border: "none", outline: "none", resize: "none",
              background: "transparent", fontFamily: "inherit",
              fontSize: 16.5, lineHeight: 1.5,
              color: "var(--text-primary)", minHeight: 30,
            }}
          />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", marginTop: 10 }}>
            <button
              onClick={handleSend}
              title="Send"
              style={{
                width: 36, height: 36,
                display: "flex", alignItems: "center", justifyContent: "center",
                border: "none", background: "var(--accent)",
                borderRadius: 11, color: "var(--bg-card)", cursor: "pointer",
                boxShadow: "0 1px 3px rgba(var(--shadow-accent), .3)",
              }}
            >
              <svg width="17" height="17" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <line x1="9" y1="14" x2="9" y2="4" /><polyline points="4.5,8.5 9,4 13.5,8.5" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* ── Suggestion chips ── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 9, justifyContent: "center", marginTop: 18 }}>
        {SUGGESTIONS.map((s) => (
          <button
            key={s.label}
            onClick={() => handleChipClick(s)}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 999, padding: "8px 14px", cursor: "pointer", fontSize: 13.5, color: "var(--text-heading)", fontFamily: "inherit", transition: "all .14s ease" }}
            onMouseEnter={(e) => { const t = e.currentTarget; t.style.borderColor = "var(--accent)"; t.style.color = "var(--text-primary)"; t.style.boxShadow = "0 3px 10px rgba(var(--shadow-color), .06)"; t.style.transform = "translateY(-2px)"; }}
            onMouseLeave={(e) => { const t = e.currentTarget; t.style.borderColor = "var(--border)"; t.style.color = "var(--text-heading)"; t.style.boxShadow = "none"; t.style.transform = "none"; }}
          >
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--accent)" }} />
            {s.label}
          </button>
        ))}
      </div>

      {/* ── Recent captures · fanned cards ── */}
      {fanSrc.length > 0 && (
        <div style={{ width: "100%", maxWidth: 1000, marginTop: 58 }}>
          <div style={{ textAlign: "center", fontSize: 14, color: "var(--text-faint)", marginBottom: 8 }}>Recent captures</div>
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
                    position: "relative",
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
                      background: "var(--bg-card)",
                      border: isHovered ? "1px solid var(--border-subtle)" : "1px solid var(--border)",
                      borderRadius: 15, padding: 0, cursor: "pointer", overflow: "hidden",
                      boxShadow: isHovered ? "0 18px 40px rgba(var(--shadow-color), .17)" : "0 6px 18px rgba(var(--shadow-color), .07)",
                      transformOrigin: "bottom center",
                      transform: isHovered ? hoverTransform : baseTransform,
                      transition: "transform .22s cubic-bezier(.2,.8,.2,1), box-shadow .22s ease, border-color .22s ease",
                      fontFamily: "inherit",
                    }}
                  >
                    <div style={{ height: 94, background: getColorMeta(c.color).bg, display: "flex", alignItems: "center", justifyContent: "center", borderBottom: "1px solid rgba(var(--shadow-color), .05)" }}>
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
                        fontSize: 14.5, fontWeight: 500, lineHeight: "17.5px", color: "var(--text-primary)",
                        maxWidth: cm ? cm.titleWidth : undefined,
                        overflow: "hidden",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical" as const,
                      }}>{c.title}</div>
                      <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 4 }}>{relativeTime(c.date)}</div>
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
        <div style={{ width: "100%", maxWidth: 1100, marginTop: 48 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
            <svg width="15" height="15" viewBox="0 0 14 14" fill="none" stroke="var(--accent)" strokeWidth="1.2">
              <path d="M7 1.5l1.76 3.57 3.94.57-2.85 2.78.67 3.93L7 10.43l-3.52 1.92.67-3.93L1.3 5.64l3.94-.57Z" fill="var(--accent)" />
            </svg>
            <span style={{ fontSize: 14, color: "var(--text-faint)", fontWeight: 500, letterSpacing: "0.02em" }}>Favorites</span>
            <span style={{ fontSize: 12, color: "var(--text-ghost)", fontWeight: 400 }}>({favCaptures.length})</span>
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
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderRadius: 14,
                    padding: 0, overflow: "hidden",
                    cursor: "pointer", textAlign: "left" as const,
                    fontFamily: "inherit",
                    transition: "all .25s cubic-bezier(.2,.8,.2,1)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--border-subtle)";
                    e.currentTarget.style.boxShadow = "0 8px 28px rgba(var(--shadow-color), .09)";
                    e.currentTarget.style.transform = "translateY(-3px)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--border)";
                    e.currentTarget.style.boxShadow = "none";
                    e.currentTarget.style.transform = "none";
                  }}
                >
                  {/* Preview area */}
                  <div style={{
                    height: 170, background: getColorMeta(c.color).bg,
                    position: "relative", overflow: "hidden",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {snippet ? (
                      <div style={{
                        position: "absolute", inset: 16, top: 18,
                        fontSize: 10, lineHeight: "15px", color: "var(--text-muted)",
                        opacity: 0.3, overflow: "hidden",
                        fontFamily: "'SF Mono', 'Fira Code', monospace",
                        wordBreak: "break-word",
                        WebkitMaskImage: "linear-gradient(to bottom, black 40%, transparent 95%)",
                        maskImage: "linear-gradient(to bottom, black 40%, transparent 95%)",
                      }}>
                        {snippet.slice(0, 400)}
                      </div>
                    ) : null}
                    <div style={{
                      width: 48, height: 48, borderRadius: 12,
                      background: "var(--bg-card-soft)",
                      backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: "var(--text-muted)", zIndex: 1,
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
                    <div style={{
                      position: "absolute", top: 10, right: 10,
                      width: 24, height: 24, borderRadius: 7,
                      background: "var(--bg-card-translucent)",
                      backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <svg width="12" height="12" viewBox="0 0 14 14" fill="var(--accent)" stroke="none">
                        <path d="M7 1.5l1.76 3.57 3.94.57-2.85 2.78.67 3.93L7 10.43l-3.52 1.92.67-3.93L1.3 5.64l3.94-.57Z"/>
                      </svg>
                    </div>
                  </div>

                  {/* Card body */}
                  <div style={{ padding: "12px 14px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{
                      fontSize: 14.5, fontWeight: 600, lineHeight: "20px", color: "var(--text-primary)",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
                    }}>{c.title}</span>

                    {snippet && (
                      <span style={{
                        fontSize: 12, lineHeight: "17px", color: "var(--text-muted)",
                        display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const,
                        overflow: "hidden", textOverflow: "ellipsis",
                      }}>{snippet}</span>
                    )}

                    {c.tags.length > 0 && (
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 2 }}>
                        {c.tags.slice(0, 3).map((tag) => (
                          <span key={tag} style={{
                            fontSize: 10, color: "var(--text-faint)", background: "var(--bg-elevated)",
                            borderRadius: 4, padding: "1px 6px", fontWeight: 500,
                          }}>#{tag}</span>
                        ))}
                        {c.tags.length > 3 && (
                          <span style={{ fontSize: 10, color: "var(--text-dimmed)" }}>+{c.tags.length - 3}</span>
                        )}
                      </div>
                    )}

                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                      <div style={{
                        width: 20, height: 20, borderRadius: "50%",
                        background: "var(--border)", color: "var(--text-secondary)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 9, fontWeight: 600, flexShrink: 0,
                      }}>Y</div>
                      <span style={{ fontSize: 11.5, color: "var(--text-dimmed)", fontWeight: 450 }}>You</span>
                      <span style={{ fontSize: 11.5, color: "var(--text-ghost)" }}>·</span>
                      <span style={{ fontSize: 11.5, color: "var(--text-dimmed)" }}>{relativeTime(c.date)}</span>
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
