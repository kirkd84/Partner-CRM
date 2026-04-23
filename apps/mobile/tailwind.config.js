/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        nav: {
          bg: '#0a1929',
          active: '#2563eb',
          text: '#e5e7eb',
          muted: '#94a3b8',
        },
        canvas: '#f5f6f8',
        card: '#ffffff',
        primary: { DEFAULT: '#2563eb', hover: '#1d4ed8' },
        success: '#10b981',
        danger: '#ef4444',
        warning: '#f59e0b',
      },
    },
  },
};
