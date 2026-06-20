import { useState } from "react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export function ChatView() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");

  function handleSend() {
    if (!input.trim()) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: input,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    // TODO: invoke Claude CLI via Tauri command
    const assistantMsg: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "Chat integration coming in Phase 3. This will use Claude CLI with RAG context from your captures.",
    };
    setTimeout(() => {
      setMessages((prev) => [...prev, assistantMsg]);
    }, 500);
  }

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-zinc-400 gap-3">
            <div className="text-4xl">💬</div>
            <div className="text-lg font-medium text-zinc-600 dark:text-zinc-300">Chat with your knowledge</div>
            <p className="text-sm text-center max-w-md">
              Ask questions and get answers grounded in your captured learnings, with citations.
            </p>
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`max-w-2xl ${msg.role === "user" ? "ml-auto" : ""}`}
          >
            <div
              className={`rounded-xl px-4 py-3 text-sm ${
                msg.role === "user"
                  ? "bg-indigo-600 text-white"
                  : "bg-zinc-100 dark:bg-zinc-900"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-zinc-200 dark:border-zinc-800 p-4">
        <div className="flex gap-2 max-w-3xl mx-auto">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Ask about your captures..."
            className="flex-1 px-4 py-2.5 rounded-lg bg-zinc-100 dark:bg-zinc-900 outline-none text-sm border border-zinc-200 dark:border-zinc-800 focus:border-indigo-500 transition-colors"
          />
          <button
            onClick={handleSend}
            className="px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
