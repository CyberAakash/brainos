import type { View } from "../../App";

interface SidebarProps {
  activeView: View;
  onNavigate: (view: View) => void;
}

const navItems: { id: View; label: string; icon: string }[] = [
  { id: "browse", label: "Browse", icon: "📁" },
  { id: "graph", label: "Graph", icon: "🕸️" },
  { id: "chat", label: "Chat", icon: "💬" },
  { id: "timeline", label: "Timeline", icon: "📅" },
  { id: "settings", label: "Settings", icon: "⚙️" },
];

export function Sidebar({ activeView, onNavigate }: SidebarProps) {
  return (
    <aside className="w-60 border-r border-zinc-200 dark:border-zinc-800 flex flex-col bg-white dark:bg-zinc-950 shrink-0">
      <div className="h-12 flex items-center px-4 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="14" stroke="#6366f1" strokeWidth="2.5"/>
            <circle cx="12" cy="13" r="2" fill="#6366f1"/>
            <circle cx="20" cy="13" r="2" fill="#6366f1"/>
            <circle cx="16" cy="20" r="2" fill="#6366f1"/>
            <line x1="12" y1="13" x2="20" y2="13" stroke="#6366f1" strokeWidth="1.5"/>
            <line x1="12" y1="13" x2="16" y2="20" stroke="#6366f1" strokeWidth="1.5"/>
            <line x1="20" y1="13" x2="16" y2="20" stroke="#6366f1" strokeWidth="1.5"/>
          </svg>
          <span className="font-semibold text-sm">BrainOS</span>
        </div>
      </div>

      <nav className="flex-1 py-2 px-2">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
              activeView === item.id || (item.id === "browse" && activeView === "editor")
                ? "bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 font-medium"
                : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900"
            }`}
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      <div className="p-3 border-t border-zinc-200 dark:border-zinc-800">
        <div className="text-xs text-zinc-400 dark:text-zinc-600">
          BrainOS v0.1.0
        </div>
      </div>
    </aside>
  );
}
