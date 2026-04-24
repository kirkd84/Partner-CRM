/**
 * Three color variants each template supports: light / dark / brand-primary.
 * Each variant mixes the brand's colors differently so the same template
 * renders three visibly different but still on-brand compositions.
 */

export type ColorVariant = 'light' | 'dark' | 'brand-primary';

export interface ResolvedPalette {
  background: string;
  surface: string;
  text: string;
  textMuted: string;
  accent: string;
  accentText: string;
  divider: string;
}

export interface VariantInputColors {
  primaryHex: string;
  secondaryHex: string;
  accentHex?: string;
  neutralHex?: string;
}

/** Mix two hex colors by t in [0,1]. Simple sRGB lerp — good enough for UI use. */
export function mix(a: string, b: string, t: number): string {
  const pa = hexToRgb(a);
  const pb = hexToRgb(b);
  if (!pa || !pb) return a;
  const r = Math.round(pa.r + (pb.r - pa.r) * t);
  const g = Math.round(pa.g + (pb.g - pa.g) * t);
  const bl = Math.round(pa.b + (pb.b - pa.b) * t);
  return rgbToHex(r, g, bl);
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  if (full.length !== 6) return null;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

/** Relative luminance per WCAG. */
export function luminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0.5;
  const transform = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * transform(rgb.r) + 0.7152 * transform(rgb.g) + 0.0722 * transform(rgb.b);
}

export function readableOn(bg: string, light = '#ffffff', dark = '#111827'): string {
  return luminance(bg) > 0.55 ? dark : light;
}

export function resolvePalette(variant: ColorVariant, colors: VariantInputColors): ResolvedPalette {
  const primary = colors.primaryHex;
  const secondary = colors.secondaryHex;
  const accent = colors.accentHex ?? primary;

  if (variant === 'light') {
    return {
      background: '#ffffff',
      surface: '#f7f7f8',
      text: '#111827',
      textMuted: '#4b5563',
      accent: primary,
      accentText: readableOn(primary),
      divider: '#e5e7eb',
    };
  }
  if (variant === 'dark') {
    return {
      background: secondary,
      surface: mix(secondary, '#000000', 0.2),
      text: '#ffffff',
      textMuted: mix('#ffffff', secondary, 0.4),
      accent: primary,
      accentText: readableOn(primary),
      divider: mix(secondary, '#ffffff', 0.15),
    };
  }
  // brand-primary: primary-saturated background, secondary as ink, accent pops
  return {
    background: primary,
    surface: mix(primary, '#ffffff', 0.08),
    text: readableOn(primary),
    textMuted: mix(readableOn(primary), primary, 0.35),
    accent: accent,
    accentText: readableOn(accent),
    divider: mix(primary, readableOn(primary), 0.2),
  };
}
