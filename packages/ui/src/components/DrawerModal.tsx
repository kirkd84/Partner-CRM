'use client';
import { type ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '../lib/cn';

export interface DrawerModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}

export function DrawerModal({
  open,
  onClose,
  title,
  children,
  footer,
  width = '420px',
}: DrawerModalProps) {
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/40"
        role="presentation"
        onClick={onClose}
      />
      <aside
        className={cn(
          'absolute right-0 top-0 h-full bg-white shadow-xl flex flex-col',
          'w-full md:w-[var(--drawer-w,420px)]',
          'animate-[slideIn_.15s_ease-out]',
        )}
        style={{ ['--drawer-w' as string]: width }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="flex items-center justify-between px-5 h-12 border-b border-gray-200">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-900"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer && (
          <footer className="border-t border-gray-200 px-5 py-3 flex justify-end gap-2 bg-gray-50">
            {footer}
          </footer>
        )}
      </aside>
    </div>
  );
}
