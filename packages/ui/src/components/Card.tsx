import { type HTMLAttributes, type ReactNode, forwardRef } from 'react';
import { Pencil } from 'lucide-react';
import { cn } from '../lib/cn';

// Omit the DOM `title` attribute (tooltip text — string only) so we can
// reuse the prop name for a ReactNode card heading.
export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode;
  actions?: ReactNode;
  onEdit?: () => void;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ title, actions, onEdit, className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-lg border border-card-border bg-card p-4 shadow-card md:p-5',
        className,
      )}
      {...props}
    >
      {(title ?? actions ?? onEdit) && (
        <div className="mb-3 flex items-center justify-between">
          {title ? (
            <h3 className="text-sm font-semibold text-gray-900 md:text-[15px]">{title}</h3>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            {actions}
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
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
