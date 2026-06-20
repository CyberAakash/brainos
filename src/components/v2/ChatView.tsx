import { useState, useRef, useEffect, useMemo } from "react";
import { useStore, getTypeMeta } from "@/store";
import { api } from "@/lib/ipc";
import type { ChatHistoryItem } from "@/lib/ipc";

export default function ChatView() {
  const captures = useStore((s) => s.captures);
  const openDetail = useStore((s) => s.openDetail);
  const setMainMode = useStore((s) => s.setMainMode);
  const togglePalette = useStore((s) => s.togglePalette);
  const chat = useStore((s) => s.chat);
  const thinking = useStore((s) => s.thinking);
  const attached = useStore((s) => s.attached);
  const detach = useStore((s) => s.detach);

  const attachedCaptures = useMemo(
    () => attached.map((id) => captures.find((c) => c.id === id)).filter(Boolean),
    [attached, captures],
  );

  const [input, setInput] = useState("");
  const [localMessages, setLocalMessages] = useState<
    Array<{
      id: string;
      isUser: boolean;
      text: string;
      cardIds?: string[];
      sources?: number;
    }>
  >([]);
  const [localThinking, setLocalThinking] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const allMessages = [...chat, ...localMessages];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [allMessages.length, thinking, localThinking]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 120) + "px";
    }
  }, [input]);

  const showToast = useStore((s) => s.showToast);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || localThinking) return;

    const userMsg = {
      id: crypto.randomUUID(),
      isUser: true,
      text,
    };
    setLocalMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLocalThinking(true);

    try {
      // Build history from existing messages
      const history: ChatHistoryItem[] = [...chat, ...localMessages]
        .map((m) => ({
          role: (m.isUser ? "user" : "assistant") as "user" | "assistant",
          content: m.text,
        }));

      const response = await api.chatSend(text, attached, history);

      const aiMsg = {
        id: crypto.randomUUID(),
        isUser: false,
        text: response.text,
        cardIds: response.source_ids,
        sources: response.source_ids.length,
      };
      setLocalMessages((prev) => [...prev, aiMsg]);
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      // Check if it's an API key issue
      if (errMsg.includes("API key") || errMsg.includes("not configured")) {
        const aiMsg = {
          id: crypto.randomUUID(),
          isUser: false,
          text: `⚠ ${errMsg}\n\nGo to **Settings** to configure your AI provider and API key.`,
        };
        setLocalMessages((prev) => [...prev, aiMsg]);
      } else {
        const aiMsg = {
          id: crypto.randomUUID(),
          isUser: false,
          text: `Sorry, something went wrong: ${errMsg}`,
        };
        setLocalMessages((prev) => [...prev, aiMsg]);
      }
      showToast("Chat error — check settings");
    }
    setLocalThinking(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewChat = () => {
    setLocalMessages([]);
  };

  const handleGoHome = () => {
    setMainMode("home");
  };

  const isThinking = thinking || localThinking;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header bar */}
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 28px",
          borderBottom: "1px solid #E9E5DC",
        }}
      >
        <button
          onClick={handleGoHome}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            border: "none",
            background: "transparent",
            color: "#9A968B",
            fontSize: 13,
            cursor: "pointer",
            padding: 0,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.color = "#4A463E";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.color = "#9A968B";
          }}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 18 18"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="14" y1="9" x2="4" y2="9" />
            <polyline points="8,5 4,9 8,13" />
          </svg>
          Home
        </button>
        <span style={{ fontSize: 13, color: "#9A968B" }}>Conversation</span>
        <div style={{ flex: 1 }} />
        <button
          onClick={handleNewChat}
          style={{
            border: "1px solid #E7E1D6",
            background: "#FFFFFF",
            color: "#56524A",
            borderRadius: 9,
            padding: "7px 13px",
            fontSize: 13,
            cursor: "pointer",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = "#D8D1C2";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = "#E7E1D6";
          }}
        >
          New chat
        </button>
      </div>

      {/* Messages area */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px" }}>
        <div
          style={{
            maxWidth: 720,
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            gap: 20,
          }}
        >
          {allMessages.map((msg) =>
            msg.isUser ? (
              /* User message */
              <div
                key={msg.id}
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  animation: "fadeUp .2s ease",
                }}
              >
                <div
                  style={{
                    maxWidth: "78%",
                    background: "#F3E9E1",
                    border: "1px solid #EBDDD0",
                    borderRadius: "14px 14px 4px 14px",
                    padding: "11px 15px",
                    fontSize: 14.5,
                    lineHeight: 1.5,
                    color: "#3F3B33",
                  }}
                >
                  {msg.text}
                </div>
              </div>
            ) : (
              /* AI message */
              <div
                key={msg.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 11,
                  animation: "fadeUp .2s ease",
                }}
              >
                {/* BrainOS label */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: "#BD6A47",
                    }}
                  />
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#9A847A",
                    }}
                  >
                    BrainOS
                  </span>
                </div>

                {/* Message text */}
                <p
                  style={{
                    margin: 0,
                    fontSize: 14.5,
                    lineHeight: 1.65,
                    color: "#3F3B33",
                  }}
                >
                  {msg.text}
                </p>

                {/* Source cards */}
                {msg.cardIds &&
                  msg.cardIds.map((id) => {
                    const overview = captures.find((c) => c.id === id);
                    if (!overview) return null;
                    const meta = getTypeMeta(overview.capture_type);
                    return (
                      <button
                        key={id}
                        onClick={() => openDetail(id)}
                        style={{
                          textAlign: "left" as const,
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                          background: "#FCFBF7",
                          border: "1px solid #E7E1D4",
                          borderRadius: 12,
                          padding: "12px 14px",
                          cursor: "pointer",
                          transition: "all .12s ease",
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLElement).style.borderColor =
                            "#CDA18C";
                          (e.currentTarget as HTMLElement).style.boxShadow =
                            "0 3px 12px rgba(40,36,28,.06)";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.borderColor =
                            "#E7E1D4";
                          (e.currentTarget as HTMLElement).style.boxShadow =
                            "none";
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <span
                            style={{
                              width: 7,
                              height: 7,
                              borderRadius: "50%",
                              background: meta.dot,
                            }}
                          />
                          <span
                            style={{
                              fontFamily:
                                "'Newsreader',Georgia,serif",
                              fontSize: 15,
                              fontWeight: 500,
                              color: "#21201C",
                              flex: 1,
                            }}
                          >
                            {overview.title}
                          </span>
                          <span
                            style={{
                              fontSize: 11,
                              color: "#7C7468",
                              background: "#F2EDE3",
                              borderRadius: 5,
                              padding: "2px 6px",
                              fontFamily:
                                "ui-monospace,Menlo,monospace",
                            }}
                          >
                            {overview.capture_type}
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: 12.5,
                            color: "#7C7468",
                            lineHeight: 1.5,
                          }}
                        >
                          {overview.tags?.join(", ") ||
                            `${overview.space} capture`}
                        </div>
                      </button>
                    );
                  })}

                {/* Sources badge */}
                {msg.sources && msg.sources > 0 && (
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 7,
                      background: "#F2EDE3",
                      borderRadius: 8,
                      padding: "6px 11px",
                      alignSelf: "flex-start",
                    }}
                  >
                    <span style={{ color: "#9A847A", display: "flex" }}>
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 14 14"
                        fill="currentColor"
                      >
                        <path d="M3.5 2h7v10l-3.5-2.4L3.5 12Z" />
                      </svg>
                    </span>
                    <span style={{ fontSize: 12, color: "#7C7468" }}>
                      {msg.sources} source{msg.sources > 1 ? "s" : ""} cited
                    </span>
                  </div>
                )}
              </div>
            )
          )}

          {/* Thinking dots */}
          {isThinking && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                animation: "fadeUp .2s ease",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "#BD6A47",
                  }}
                />
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#9A847A",
                  }}
                >
                  BrainOS
                </span>
              </div>
              <div style={{ display: "flex", gap: 5, padding: 2 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "#C9B8AE",
                    animation: "blink 1s infinite",
                  }}
                />
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "#C9B8AE",
                    animation: "blink 1s infinite .18s",
                  }}
                />
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "#C9B8AE",
                    animation: "blink 1s infinite .36s",
                  }}
                />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area */}
      <div
        style={{
          flexShrink: 0,
          padding: "14px 28px 20px",
          borderTop: "1px solid #E9E5DC",
          background: "#F5F3ED",
        }}
      >
        <div
          style={{
            maxWidth: 720,
            margin: "0 auto",
            background: "#FFFFFF",
            border: "1px solid #E7E1D6",
            borderRadius: 14,
            padding: "12px 12px 10px",
            boxShadow: "0 1px 3px rgba(40,36,28,.05)",
          }}
        >
          {/* Context chips — attached captures (Cursor-style) */}
          {attachedCaptures.length > 0 && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                marginBottom: 8,
                paddingBottom: 8,
                borderBottom: "1px solid #F0EBE1",
              }}
            >
              {attachedCaptures.map((c) => {
                if (!c) return null;
                const meta = getTypeMeta(c.capture_type);
                return (
                  <div
                    key={c.id}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      background: "#F6F0E8",
                      border: "1px solid #E7DFD0",
                      borderRadius: 8,
                      padding: "4px 8px 4px 10px",
                      maxWidth: 200,
                      animation: "fadeUp .15s ease",
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        flexShrink: 0,
                        background: meta.dot,
                      }}
                    />
                    <span
                      onClick={() => openDetail(c.id)}
                      style={{
                        fontSize: 12,
                        color: "#4A463E",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        cursor: "pointer",
                        flex: 1,
                      }}
                    >
                      {c.title}
                    </span>
                    <button
                      onClick={() => detach(c.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        border: "none",
                        background: "transparent",
                        color: "#B3AE9F",
                        cursor: "pointer",
                        padding: 0,
                        flexShrink: 0,
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.color = "#7C7468";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.color = "#B3AE9F";
                      }}
                    >
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 12 12"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                      >
                        <line x1="3" y1="3" x2="9" y2="9" />
                        <line x1="9" y1="3" x2="3" y2="9" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a follow-up…"
            rows={1}
            style={{
              width: "100%",
              border: "none",
              outline: "none",
              resize: "none",
              background: "transparent",
              fontFamily: "inherit",
              fontSize: 15,
              lineHeight: 1.5,
              color: "#21201C",
              minHeight: 24,
            }}
          />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 8,
            }}
          >
            <button
              title="Attach captures"
              onClick={togglePalette}
              style={{
                width: 30,
                height: 30,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "1px solid #E7E1D6",
                background: "#FBFAF6",
                borderRadius: 8,
                color: "#8C887E",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = "#D8D1C2";
                (e.currentTarget as HTMLElement).style.color = "#4A463E";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = "#E7E1D6";
                (e.currentTarget as HTMLElement).style.color = "#8C887E";
              }}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 14 14"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
              >
                <line x1="7" y1="2.5" x2="7" y2="11.5" />
                <line x1="2.5" y1="7" x2="11.5" y2="7" />
              </svg>
            </button>
            <button
              title="Send"
              onClick={handleSend}
              style={{
                width: 32,
                height: 32,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "none",
                background: "#BD6A47",
                borderRadius: 9,
                color: "#FFF",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "#A85B3B";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "#BD6A47";
              }}
              onMouseDown={(e) => {
                (e.currentTarget as HTMLElement).style.transform = "scale(0.95)";
              }}
              onMouseUp={(e) => {
                (e.currentTarget as HTMLElement).style.transform = "scale(1)";
              }}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 18 18"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="9" y1="14" x2="9" y2="4" />
                <polyline points="4.5,8.5 9,4 13.5,8.5" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Blink keyframe for thinking dots */}
      <style>{`
        @keyframes blink {
          0%, 100% { opacity: .3; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
