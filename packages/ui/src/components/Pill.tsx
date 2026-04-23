import { type HTMLAttributes, forwardRef } from 'react';
import { cn } from '../lib/cn';

export interface PillProps extends HTMLAttributes<HTMLSpanElement> {
  color?: string;
  tone?: 'solid' | 'soft';
}

/**
 * Storm-style pill. Soft tone is the default for stage badges — uses the
 * stage color at ~10% opacity as background with full-strength text, so
 * the pill "glows" with its hue without being loud.
 */
export const Pill = forwardRef<HTMLSpanElement, PillProps>(
  ({ className, color, tone = 'soft', style, children, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium tracking-tight',
        tone === 'solid' ? 'text-white' : 'bg-gray-100 text-gray-700',
        className,
      )}
      style={
        color
          ? tone === 'solid'
            ? { backgroundColor: color, ...style }
            : { color, backgroundColor: `${color}1f`, ...style }
          : style
      }
      {...props}
    >
      {children}
    </span>
  ),
);
Pill.displayName = 'Pill';
