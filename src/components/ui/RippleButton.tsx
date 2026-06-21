import { useCallback, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

interface RippleButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  /** Extra Tailwind classes */
  className?: string;
  /** Ripple color override (default: semi-transparent white) */
  rippleColor?: string;
}

/**
 * Button with material-style ripple effect on click.
 * - Tracks click position relative to button
 * - Creates expanding circle animation from click point
 * - Multiple ripples can exist simultaneously
 * - Auto-cleanup after 600ms
 */
export default function RippleButton({
  children,
  className = '',
  rippleColor = 'rgba(255, 255, 255, 0.35)',
  onClick,
  ...rest
}: RippleButtonProps) {
  const btnRef = useRef<HTMLButtonElement>(null);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const btn = btnRef.current;
      if (!btn) return;

      const rect = btn.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const size = Math.max(rect.width, rect.height) * 2;

      const circle = document.createElement('span');
      circle.className = 'ripple-circle';
      circle.style.width = `${size}px`;
      circle.style.height = `${size}px`;
      circle.style.left = `${x - size / 2}px`;
      circle.style.top = `${y - size / 2}px`;
      circle.style.background = rippleColor;

      btn.appendChild(circle);
      setTimeout(() => circle.remove(), 600);

      onClick?.(e);
    },
    [onClick, rippleColor],
  );

  return (
    <button
      ref={btnRef}
      className={`ripple-container ${className}`}
      onClick={handleClick}
      {...rest}
    >
      {children}
    </button>
  );
}
