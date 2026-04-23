import { type HTMLAttributes, type ThHTMLAttributes, type TdHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

/**
 * Dense Storm-style tables. Row height ~32px, sticky first column,
 * uppercase header with subtle tracking. Hover + selected states match
 * Storm's Referral Partners list.
 */

export function Table(props: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto">
      <table {...props} className={cn('min-w-full text-[13px]', props.className)} />
    </div>
  );
}

export function THead(props: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      {...props}
      className={cn('border-b border-card-border bg-gray-50 text-gray-600', props.className)}
    />
  );
}

export function TBody(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} className={cn('divide-y divide-gray-100', props.className)} />;
}

export function TR(props: HTMLAttributes<HTMLTableRowElement>) {
  return <tr {...props} className={cn('hover:bg-gray-50/70', props.className)} />;
}

export function TH(props: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      {...props}
      className={cn(
        'px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-label text-gray-600',
        'first:sticky first:left-0 first:z-10 first:bg-gray-50',
        props.className,
      )}
    />
  );
}

export function TD(props: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      {...props}
      className={cn(
        'whitespace-nowrap px-3 py-1.5 align-middle text-gray-900',
        'first:sticky first:left-0 first:bg-white',
        props.className,
      )}
    />
  );
}
