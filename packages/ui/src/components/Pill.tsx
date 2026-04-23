import { type HTMLAttributes, forwardRef } from 'react';
import { cn } from '../lib/cn';

export interface PillProps extends HTMLAttributes<HTMLSpanElement> {
  color?: string;
  tone?: 'solid' | 'soft';
}

export const Pill = forwardRef<HTMLSpanElement, PillProps>(
  ({ className, color, tone = 'soft', style, children, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        tone === 'solid' ? 'text-white' : 'text-gray-700 bg-gray-100',
        className,
      )}
      style={
        color
          ? tone === 'solid'
            ? { backgroundColor: color, ...style }
            : { color, backgroundColor: `${color}1a`, ...style }
          : style
      }
      {...props}
    >
      {children}
    </span>
  ),
);
Pill.displayName = 'Pill';
