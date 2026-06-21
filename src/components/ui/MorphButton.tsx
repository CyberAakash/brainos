import { useState, useCallback, useRef, type ReactNode } from 'react';

type MorphState = 'idle' | 'loading' | 'success' | 'error';

interface MorphButtonProps {
  /** Label when idle */
  children: ReactNode;
  /** Label shown during loading (default: "Loading…") */
  loadingLabel?: string;
  /** Label shown on success (default: "Done!") */
  successLabel?: string;
  /** Label shown on error (default: "Failed") */
  errorLabel?: string;
  /** Async action — button morphs through states automatically */
  onAction: () => Promise<void>;
  /** Extra Tailwind classes */
  className?: string;
  /** How long to show success/error state before resetting (ms) */
  resetDelay?: number;
  disabled?: boolean;
}

/**
 * Button that morphs through Idle → Loading → Success/Error states.
 * Automatically manages state transitions based on Promise resolution.
 */
export default function MorphButton({
  children,
  loadingLabel = 'Loading…',
  successLabel = 'Done!',
  errorLabel = 'Failed',
  onAction,
  className = '',
  resetDelay = 1500,
  disabled = false,
}: MorphButtonProps) {
  const [state, setState] = useState<MorphState>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleClick = useCallback(async () => {
    if (state !== 'idle') return;

    setState('loading');
    try {
      await onAction();
      setState('success');
    } catch {
      setState('error');
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setState('idle'), resetDelay);
  }, [onAction, resetDelay, state]);

  const stateStyles: Record<MorphState, string> = {
    idle: 'bg-accent hover:bg-accent-hover text-text-inverse cursor-pointer',
    loading: 'bg-text-muted text-text-inverse cursor-wait',
    success: 'bg-green-600 text-white animate-morph-success cursor-default',
    error: 'bg-red-500 text-white cursor-default',
  };

  const label: Record<MorphState, ReactNode> = {
    idle: children,
    loading: (
      <span className="flex items-center gap-2">
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        {loadingLabel}
      </span>
    ),
    success: (
      <span className="flex items-center gap-1.5">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        {successLabel}
      </span>
    ),
    error: (
      <span className="flex items-center gap-1.5">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
        {errorLabel}
      </span>
    ),
  };

  return (
    <button
      onClick={handleClick}
      disabled={disabled || state === 'loading'}
      className={`
        ripple-container inline-flex items-center justify-center
        px-4 py-2 rounded-lg text-sm font-medium
        transition-all duration-200 ease-out
        disabled:opacity-50
        ${stateStyles[state]}
        ${className}
      `}
    >
      {label[state]}
    </button>
  );
}
