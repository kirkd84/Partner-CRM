import { type ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface EmptyStateProps {
  icon?: ReactNode;
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-10 text-center', className)}>
      {icon ? <div className="text-gray-400 mb-3">{icon}</div> : null}
      {title && <div className="text-sm font-medium text-gray-700">{title}</div>}
      {description && <div className="text-sm text-gray-500 mt-1 max-w-sm">{description}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
