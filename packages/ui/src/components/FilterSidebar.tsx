'use client';
import { type ReactNode } from 'react';
import { Button } from './Button';

export interface FilterSidebarProps {
  children: ReactNode;
  onClear?: () => void;
}

export function FilterSidebar({ children, onClear }: FilterSidebarProps) {
  return (
    <aside className="hidden md:flex w-[200px] shrink-0 flex-col border-r border-card-border bg-white">
      <div className="px-4 py-3 border-b border-card-border">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">
          Filters
        </h3>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">{children}</div>
      {onClear && (
        <div className="p-3 border-t border-card-border">
          <Button variant="secondary" size="sm" onClick={onClear} className="w-full">
            Clear Filters
          </Button>
        </div>
      )}
    </aside>
  );
}
