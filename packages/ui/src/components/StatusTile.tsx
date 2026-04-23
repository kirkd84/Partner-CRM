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
 * Pipeline stage tile — Storm "Projects Statuses" mirror.
 * The big count number is the visual anchor; label sits small and
 * uppercase above it, optional $ amount in small gray below.
 */
export const StatusTile = forwardRef<HTMLAnchorElement, StatusTileProps>(
  ({ label, count, amount, color, href = '#', className, ...props }, ref) => (
    <a
      ref={ref}
      href={href}
      className={cn(
        'group block rounded-md border border-card-border bg-card px-4 py-4 shadow-card',
        'transition-all duration-150 hover:-translate-y-0.5 hover:shadow-card-hover',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        className,
      )}
      {...props}
    >
      <div className="text-[11px] font-semibold uppercase tracking-label text-gray-500 group-hover:text-gray-700">
        {label}
      </div>
      <div className="mt-1 text-stat leading-none" style={{ color }}>
        {count}
      </div>
      {amount ? (
        <div className="mt-1.5 text-[11px] tabular-nums text-gray-500">{amount}</div>
      ) : (
        <div className="mt-1.5 h-[11px]" aria-hidden />
      )}
    </a>
  ),
);
StatusTile.displayName = 'StatusTile';
