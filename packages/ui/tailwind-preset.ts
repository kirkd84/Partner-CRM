/**
 * Shared Tailwind preset — import into apps/web tailwind.config.ts
 *   presets: [partnerRadarPreset]
 */
import type { Config } from 'tailwindcss';
import { colors } from './src/tokens';

const preset: Partial<Config> = {
  // System preference — Tailwind `media` strategy uses
  // `@media (prefers-color-scheme: dark)`. Users don't toggle in-app;
  // the theme follows their OS setting.
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        nav: colors.nav,
        // Surface tokens use CSS variables so they flip automatically in
        // `prefers-color-scheme: dark` — the variables are defined in
        // apps/web/src/app/globals.css. Tailwind's `<alpha-value>`
        // placeholder lets classes like `bg-canvas/50` keep working.
        canvas: 'rgb(var(--pr-canvas) / <alpha-value>)',
        card: 'rgb(var(--pr-card) / <alpha-value>)',
        'card-border': 'rgb(var(--pr-card-border) / <alpha-value>)',
        primary: colors.primary,
        success: colors.success,
        danger: colors.danger,
        warning: colors.warning,
        stage: colors.stage,
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        // Lighter + tighter than before — Storm's cards have a very
        // subtle "lifted paper" feel rather than a pronounced shadow.
        card: '0 1px 2px 0 rgb(17 24 39 / 0.04)',
        'card-hover': '0 2px 4px 0 rgb(17 24 39 / 0.06), 0 1px 2px 0 rgb(17 24 39 / 0.04)',
      },
      fontSize: {
        // Stat/count numbers on Radar tiles — the visual anchor. Storm
        // uses big confident numbers (~44px) — these carry the page.
        stat: ['44px', { lineHeight: '1', fontWeight: '600', letterSpacing: '-0.025em' }],
        // Smaller stat for secondary widgets (30-day stats, etc.)
        'stat-sm': ['26px', { lineHeight: '1', fontWeight: '600', letterSpacing: '-0.015em' }],
      },
      letterSpacing: {
        // Uppercase labels (tile headers, table headers) get a touch of
        // tracking for that Storm "navigator" feel.
        label: '0.04em',
      },
      borderRadius: {
        md: '0.5rem',
      },
    },
  },
};

export default preset;
