import { type HTMLAttributes, type ReactNode, forwardRef } from 'react';
import { Pencil } from 'lucide-react';
import { cn } from '../lib/cn';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  title?: ReactNode;
  actions?: ReactNode;
  onEdit?: () => void;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ title, actions, onEdit, className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-lg border border-card-border bg-card shadow-card p-4 md:p-5',
        className,
      )}
      {...props}
    >
      {(title ?? actions ?? onEdit) && (
        <div className="flex items-center justify-between mb-3">
          {title ? (
            <h3 className="text-sm md:text-[15px] font-semibold text-gray-900">{title}</h3>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            {actions}
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                className="text-xs text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </button>
            )}
          </div>
        </div>
      )}
      {children}
    </div>
  ),
);
Card.displayName = 'Card';
