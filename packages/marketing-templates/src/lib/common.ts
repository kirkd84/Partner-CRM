/**
 * Shared pieces templates reuse: logo badge, contact footer, text
 * auto-sizer. Keeps each template file focused on its layout.
 */

import { h, type SatoriNode } from '../h';
import type { BrandRenderProfile } from '../types';
import type { ResolvedPalette } from '../variants';

/**
 * Estimate the font-size needed to fit a string inside a box. Satori
 * doesn't measure text so we approximate: assume ~0.58em char width
 * at the given weight. Conservative — designers can increase min.
 */
export function fitText(
  text: string,
  boxWidth: number,
  boxHeight: number,
  opts: { min?: number; max?: number; charRatio?: number; maxLines?: number } = {},
): number {
  const { min = 14, max = 96, charRatio = 0.58, maxLines = 3 } = opts;
  const safeText = text.trim() || 'A';
  // Start from the max and step down until the text fits. Crude but fast.
  for (let size = max; size >= min; size -= 2) {
    const charsPerLine = Math.max(1, Math.floor(boxWidth / (size * charRatio)));
    const lines = Math.ceil(safeText.length / charsPerLine);
    const totalHeight = lines * size * 1.1;
    if (lines <= maxLines && totalHeight <= boxHeight) return size;
  }
  return min;
}

export function logoBadge(
  brand: BrandRenderProfile,
  palette: ResolvedPalette,
  size = 44,
): SatoriNode {
  if (brand.logoDataUrl) {
    return h('img', {
      src: brand.logoDataUrl,
      width: size,
      height: size,
      style: { objectFit: 'contain', display: 'block' },
    });
  }
  // Fallback monogram: first letter(s) of company in accent box.
  const initials =
    brand.companyName
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0] ?? '')
      .join('')
      .toUpperCase() || 'R';
  return h(
    'div',
    {
      style: {
        display: 'flex',
        width: size,
        height: size,
        borderRadius: size / 6,
        backgroundColor: palette.accent,
        color: palette.accentText,
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.42,
        fontWeight: 800,
        letterSpacing: '0.02em',
      },
    },
    initials,
  );
}

export function contactFooter(
  brand: BrandRenderProfile,
  palette: ResolvedPalette,
  opts: { compact?: boolean } = {},
): SatoriNode {
  const items: string[] = [];
  if (brand.contact.phone) items.push(brand.contact.phone);
  if (brand.contact.website) items.push(brand.contact.website);
  else if (brand.contact.email) items.push(brand.contact.email);
  if (brand.contact.physicalAddress && !opts.compact) items.push(brand.contact.physicalAddress);
  if (items.length === 0) return null;
  return h(
    'div',
    {
      style: {
        display: 'flex',
        gap: 14,
        flexWrap: 'wrap',
        color: palette.textMuted,
        fontSize: opts.compact ? 13 : 15,
        fontFamily: brand.typography.body,
      },
    },
    ...items.map((item, i) =>
      h(
        'div',
        { key: i, style: { display: 'flex', gap: 8 } },
        i > 0 ? h('span', { style: { color: palette.divider } }, '·') : null,
        h('span', null, item),
      ),
    ),
  );
}

export function companyHeader(
  brand: BrandRenderProfile,
  palette: ResolvedPalette,
  opts: { size?: number; align?: 'left' | 'right' } = {},
): SatoriNode {
  const size = opts.size ?? 44;
  return h(
    'div',
    {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexDirection: opts.align === 'right' ? 'row-reverse' : 'row',
      },
    },
    logoBadge(brand, palette, size),
    h(
      'div',
      { style: { display: 'flex', flexDirection: 'column' } },
      h(
        'div',
        {
          style: {
            fontSize: Math.round(size * 0.45),
            fontWeight: 800,
            color: palette.text,
            fontFamily: brand.typography.display,
            letterSpacing: '-0.01em',
          },
        },
        brand.companyName,
      ),
      brand.tagline
        ? h(
            'div',
            {
              style: {
                fontSize: Math.round(size * 0.28),
                color: palette.textMuted,
                fontFamily: brand.typography.body,
              },
            },
            brand.tagline,
          )
        : null,
    ),
  );
}
