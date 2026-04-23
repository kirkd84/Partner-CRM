import { type HTMLAttributes, forwardRef } from 'react';
import { cn } from '../lib/cn';

export interface StatusTileProps extends HTMLAttributes<HTMLAnchorElement> {
  label: string;
  count: number;
  amount?: string;
  color?: string;
  href?: string;
}

/**
 * Pipeline stage tile — matches Storm Cloud's "Projects Statuses" widget.
 * Dense layout; stat number colored per stage; subtle lift on hover.
 */
export const StatusTile = forwardRef<HTMLAnchorElement, StatusTileProps>(
  ({ label, count, amount, color, href = '#', className, ...props }, ref) => (
    <a
      ref={ref}
      href={href}
      className={cn(
        'block rounded-md border border-card-border bg-card px-4 py-3.5 shadow-card',
        'transition hover:-translate-y-0.5 hover:shadow-card-hover',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        className,
      )}
      {...props}
    >
      <div className="text-[11px] font-medium uppercase tracking-label text-gray-500">{label}</div>
      <div className="mt-1.5 text-stat font-semibold leading-none" style={{ color }}>
        {count}
      </div>
      {amount && <div className="mt-1.5 text-xs text-gray-500">{amount}</div>}
    </a>
  ),
);
StatusTile.displayName = 'StatusTile';
