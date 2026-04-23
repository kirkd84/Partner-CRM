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
        sans: [
          'var(--font-inter)',
          'Inter',
          'ui-sans-serif',
          'system-ui',
          'sans-serif',
        ],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 3px 0 rgb(0 0 0 / 0.06)',
      },
      borderRadius: {
        md: '0.5rem',
      },
    },
  },
};

export default preset;
