import { type HTMLAttributes, forwardRef } from 'react';
import { cn } from '../lib/cn';

export interface StatusTileProps extends HTMLAttributes<HTMLAnchorElement> {
  label: string;
  count: number;
  amount?: string;
  color?: string;
  href?: string;
}

export const StatusTile = forwardRef<HTMLAnchorElement, StatusTileProps>(
  ({ label, count, amount, color, href = '#', className, ...props }, ref) => (
    <a
      ref={ref}
      href={href}
      className={cn(
        'block rounded-lg border border-card-border bg-card shadow-card p-4 transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        className,
      )}
      {...props}
    >
      <div className="text-xs text-gray-500">{label}</div>
      <div
        className="text-[36px] font-semibold leading-none mt-1"
        style={{ color }}
      >
        {count}
      </div>
      {amount && <div className="text-xs text-gray-500 mt-1">{amount}</div>}
    </a>
  ),
);
StatusTile.displayName = 'StatusTile';
