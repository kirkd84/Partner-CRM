/**
 * Shared Tailwind preset — import into apps/web tailwind.config.ts
 *   presets: [partnerRadarPreset]
 */
import type { Config } from 'tailwindcss';
import { colors } from './src/tokens';

const preset: Partial<Config> = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        nav: colors.nav,
        canvas: colors.canvas,
        card: colors.card,
        'card-border': colors['card-border'],
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
        // Stat/count numbers on Radar tiles — slightly smaller than before
        // so the page feels denser.
        stat: ['30px', { lineHeight: '1.1', fontWeight: '600' }],
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
