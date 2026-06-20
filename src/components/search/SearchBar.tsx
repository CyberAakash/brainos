import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

interface SearchBarProps {
  onClose: () => void;
}

interface SearchResult {
  capture: {
    id: string;
    title: string;
    capture_type: string;
    date: string;
    tags: string[];
  };
  score: number;
  snippet: string;
}

export function SearchBar({ onClose }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();

    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await invoke<SearchResult[]>("search", { query, limit: 10 });
        setResults(res);
      } catch (e) {
        console.error("Search failed:", e);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-full max-w-xl bg-white dark:bg-zinc-900 rounded-xl shadow-2xl border border-zinc-200 dark:border-zinc-700 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center px-4 border-b border-zinc-200 dark:border-zinc-800">
          <svg className="w-4 h-4 text-zinc-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search captures..."
            className="flex-1 py-3 px-3 bg-transparent outline-none text-sm"
          />
          <kbd className="text-xs text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">Esc</kbd>
        </div>
        {results.length > 0 && (
          <div className="max-h-96 overflow-y-auto py-2">
            {results.map((r) => (
              <button
                key={r.capture.id}
                className="w-full text-left px-4 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                <div className="text-sm font-medium">{r.capture.title}</div>
                <div className="text-xs text-zinc-400 mt-0.5 line-clamp-1">{r.snippet}</div>
              </button>
            ))}
          </div>
        )}
        {query.length >= 2 && results.length === 0 && (
          <div className="py-8 text-center text-sm text-zinc-400">No results</div>
        )}
      </div>
    </div>
  );
}
