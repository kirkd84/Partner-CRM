import { type HTMLAttributes, type ThHTMLAttributes, type TdHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

export function Table(props: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto">
      <table {...props} className={cn('min-w-full text-sm', props.className)} />
    </div>
  );
}

export function THead(props: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      {...props}
      className={cn('bg-gray-50 border-b border-card-border', props.className)}
    />
  );
}

export function TBody(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} className={cn('divide-y divide-gray-100', props.className)} />;
}

export function TR(props: HTMLAttributes<HTMLTableRowElement>) {
  return <tr {...props} className={cn('hover:bg-gray-50', props.className)} />;
}

export function TH(props: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      {...props}
      className={cn(
        'px-3 py-2 text-left text-xs font-medium text-gray-700 first:sticky first:left-0 first:bg-gray-50 first:z-10',
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
        'px-3 py-2 text-gray-900 text-sm first:sticky first:left-0 first:bg-white',
        props.className,
      )}
    />
  );
}
