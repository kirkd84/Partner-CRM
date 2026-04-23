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
 * Big bold count is the visual anchor; small uppercase label above,
 * optional $ amount in small gray below.
 */
export const StatusTile = forwardRef<HTMLAnchorElement, StatusTileProps>(
  ({ label, count, amount, color, href = '#', className, ...props }, ref) => (
    <a
      ref={ref}
      href={href}
      className={cn(
        'group block rounded-md border border-card-border bg-card px-4 py-3 shadow-card',
        'transition-all duration-150 hover:-translate-y-0.5 hover:shadow-card-hover',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        className,
      )}
      {...props}
    >
      <div className="text-[10.5px] font-semibold uppercase tracking-label text-gray-500 group-hover:text-gray-700">
        {label}
      </div>
      <div className="mt-1 text-stat leading-none" style={{ color }}>
        {count}
      </div>
      {amount ? (
        <div className="mt-1 text-[11px] tabular-nums text-gray-500">{amount}</div>
      ) : (
        <div className="mt-1 h-[11px]" aria-hidden />
      )}
    </a>
  ),
);
StatusTile.displayName = 'StatusTile';

/**
 * Secondary stat card — used in the 30-day stats row beneath the pipeline
 * tiles. Smaller count, no colored accent by default.
 */
export interface StatCardProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
  value: string | number;
  delta?: string;
  deltaTrend?: 'up' | 'down' | 'flat';
}

export const StatCard = forwardRef<HTMLDivElement, StatCardProps>(
  ({ label, value, delta, deltaTrend, className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-md border border-card-border bg-card px-4 py-3 shadow-card',
        className,
      )}
      {...props}
    >
      <div className="text-[10.5px] font-semibold uppercase tracking-label text-gray-500">
        {label}
      </div>
      <div className="mt-1 text-stat-sm tabular-nums leading-none text-gray-900">{value}</div>
      {delta ? (
        <div
          className={cn(
            'mt-1 text-[11px] tabular-nums',
            deltaTrend === 'up' && 'text-success',
            deltaTrend === 'down' && 'text-danger',
            (!deltaTrend || deltaTrend === 'flat') && 'text-gray-500',
          )}
        >
          {delta}
        </div>
      ) : (
        <div className="mt-1 h-[11px]" aria-hidden />
      )}
    </div>
  ),
);
StatCard.displayName = 'StatCard';
