import { type HTMLAttributes, forwardRef, useMemo } from 'react';
import { cn } from '../lib/cn';
import { hashToColor } from '../tokens';

const SIZE_MAP = {
  xs: 'h-5 w-5 text-[9px]',
  sm: 'h-6 w-6 text-[10px]',
  md: 'h-7 w-7 text-[11px]',
  lg: 'h-8 w-8 text-xs',
  xl: 'h-10 w-10 text-sm',
} as const;

export interface AvatarProps extends HTMLAttributes<HTMLDivElement> {
  name: string;
  color?: string;
  size?: keyof typeof SIZE_MAP;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0]![0]!}${parts[parts.length - 1]![0]!}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export const Avatar = forwardRef<HTMLDivElement, AvatarProps>(
  ({ name, color, size = 'md', className, style, ...props }, ref) => {
    const resolved = useMemo(() => color ?? hashToColor(name), [color, name]);
    return (
      <div
        ref={ref}
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white select-none',
          SIZE_MAP[size],
          className,
        )}
        style={{ backgroundColor: resolved, ...style }}
        aria-label={name}
        {...props}
      >
        {initials(name)}
      </div>
    );
  },
);
Avatar.displayName = 'Avatar';
