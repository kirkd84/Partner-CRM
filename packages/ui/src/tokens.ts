/**
 * Design tokens — must stay in lock-step with SPEC.md §3.1.
 * Consumed by the shared Tailwind preset.
 */
export const colors = {
  nav: {
    bg: '#0a1929',
    active: '#2563eb',
    text: '#e5e7eb',
    muted: '#94a3b8',
  },
  canvas: '#f5f6f8',
  card: '#ffffff',
  'card-border': '#e5e7eb',
  primary: {
    DEFAULT: '#2563eb',
    hover: '#1d4ed8',
  },
  success: '#10b981',
  danger: '#ef4444',
  warning: '#f59e0b',
  stage: {
    newLead: '#9ca3af',
    researched: '#f97316',
    initial: '#f59e0b',
    meeting: '#3b82f6',
    conv: '#a855f7',
    proposal: '#ec4899',
    activated: '#10b981',
    inactive: '#94a3b8',
  },
} as const;

export const avatarPalette = [
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#eab308',
  '#84cc16',
  '#10b981',
  '#14b8a6',
  '#06b6d4',
  '#3b82f6',
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
] as const;

/** Hash a string into a deterministic avatar color — same user always gets same color. */
export function hashToColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return avatarPalette[Math.abs(hash) % avatarPalette.length]!;
}
