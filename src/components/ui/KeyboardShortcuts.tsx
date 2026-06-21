import { useState, useEffect, useCallback } from 'react';

export interface Shortcut {
  /** Unique key ID */
  id: string;
  /** Human label */
  label: string;
  /** Key combo string for display (e.g. "⌘K") */
  keys: string;
  /** Category for grouping */
  category: 'navigation' | 'actions' | 'editing' | 'view';
  /** Whether currently active */
  enabled?: boolean;
}

/** Registry of all keyboard shortcuts */
export const SHORTCUTS: Shortcut[] = [
  // Navigation
  { id: 'search', label: 'Open Search', keys: '⌘K', category: 'navigation' },
  { id: 'home', label: 'Go Home', keys: '⌘1', category: 'navigation' },
  { id: 'browse', label: 'Browse Captures', keys: '⌘2', category: 'navigation' },
  { id: 'settings', label: 'Open Settings', keys: '⌘,', category: 'navigation' },

  // Actions
  { id: 'new', label: 'New Capture', keys: '⌘N', category: 'actions' },
  { id: 'sidebar', label: 'Toggle Sidebar', keys: '⌘B', category: 'actions' },
  { id: 'shortcuts', label: 'Show Shortcuts', keys: '⌘/', category: 'actions' },

  // View
  { id: 'close', label: 'Close Panel / Modal', keys: 'Esc', category: 'view' },
  { id: 'fullscreen', label: 'Toggle Fullscreen', keys: '⌘⇧F', category: 'view' },
];

const CATEGORY_LABELS: Record<string, string> = {
  navigation: 'Navigation',
  actions: 'Actions',
  editing: 'Editing',
  view: 'View',
};

interface ShortcutsOverlayProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Keyboard shortcuts overlay — shows all available hotkeys.
 * Triggered by ⌘/
 */
export function ShortcutsOverlay({ open, onClose }: ShortcutsOverlayProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const grouped = SHORTCUTS.reduce(
    (acc, s) => {
      (acc[s.category] ??= []).push(s);
      return acc;
    },
    {} as Record<string, Shortcut[]>,
  );

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-bg-overlay"
      onClick={onClose}
    >
      <div
        className="
          bg-bg-card rounded-xl shadow-xl border border-border
          w-[420px] max-h-[70vh] overflow-y-auto
          animate-scale-in
        "
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-light">
          <h2 className="font-semibold text-sm text-text-primary">Keyboard Shortcuts</h2>
          <kbd className="
            text-[10px] font-mono px-1.5 py-0.5 rounded
            bg-bg-input text-text-muted border border-border
          ">
            Esc
          </kbd>
        </div>

        {/* Groups */}
        <div className="p-4 space-y-4">
          {Object.entries(grouped).map(([cat, shortcuts]) => (
            <div key={cat}>
              <h3 className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-2">
                {CATEGORY_LABELS[cat] || cat}
              </h3>
              <div className="space-y-1">
                {shortcuts.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-bg-input transition-colors"
                  >
                    <span className="text-sm text-text-secondary">{s.label}</span>
                    <KbdCombo keys={s.keys} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Renders a keyboard shortcut combo as styled kbd elements.
 */
export function KbdCombo({ keys, className = '' }: { keys: string; className?: string }) {
  // Split on + but keep individual chars like ⌘ ⇧ together
  const parts = keys.split(/(?=[⌘⇧⌥⌃])|(?<=\w)\+/).filter(Boolean);

  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`}>
      {parts.map((part, i) => (
        <kbd
          key={i}
          className="
            inline-flex items-center justify-center
            min-w-[22px] h-[22px] px-1.5
            text-[11px] font-mono font-medium
            bg-bg-input text-text-muted
            border border-border rounded
          "
        >
          {part}
        </kbd>
      ))}
    </span>
  );
}

/**
 * Hook to register the ⌘/ shortcut for opening the shortcuts overlay.
 */
export function useShortcutsOverlay() {
  const [open, setOpen] = useState(false);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === '/') {
      e.preventDefault();
      setOpen((prev) => !prev);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return { open, close: () => setOpen(false) };
}
