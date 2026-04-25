/**
 * flyer-warranty-spotlight — three big numbers (10/25/50 yr or any
 * combination) stacked or in a row, with a short explainer for each.
 * Built for "why our warranty is the differentiator" pitches.
 */

import { h, type SatoriNode } from '../../h';
import { resolvePalette, mix } from '../../variants';
import { companyHeader, contactFooter } from '../../lib/common';
import type { TemplateModule } from '../../types';

export const warrantySpotlight: TemplateModule = {
  manifest: {
    catalogKey: 'flyer-warranty-spotlight',
    name: 'Warranty spotlight',
    description: 'Three oversized warranty numbers (e.g. 10 / 25 / 50 yr) with explainers.',
    contentType: 'FLYER',
    slots: [
      {
        key: 'headline',
        kind: 'text',
        label: 'Headline',
        required: true,
        constraints: { maxChars: 80 },
        defaultValue: 'A warranty as strong as the roof.',
      },
      {
        key: 'tier1Number',
        kind: 'text',
        label: 'Tier 1 number',
        required: false,
        defaultValue: '10',
        constraints: { maxChars: 5 },
      },
      {
        key: 'tier1Label',
        kind: 'text',
        label: 'Tier 1 label',
        required: false,
        defaultValue: 'Year workmanship',
        constraints: { maxChars: 40 },
      },
      {
        key: 'tier2Number',
        kind: 'text',
        label: 'Tier 2 number',
        required: false,
        defaultValue: '25',
        constraints: { maxChars: 5 },
      },
      {
        key: 'tier2Label',
        kind: 'text',
        label: 'Tier 2 label',
        required: false,
        defaultValue: 'Year material',
        constraints: { maxChars: 40 },
      },
      {
        key: 'tier3Number',
        kind: 'text',
        label: 'Tier 3 number',
        required: false,
        defaultValue: '50',
        constraints: { maxChars: 5 },
      },
      {
        key: 'tier3Label',
        kind: 'text',
        label: 'Tier 3 label',
        required: false,
        defaultValue: 'Year transferable',
        constraints: { maxChars: 40 },
      },
    ],
    sizes: [
      { key: 'letter', width: 1275, height: 1650, dpi: 150, purpose: 'print' },
      { key: 'half-letter', width: 1050, height: 1350, dpi: 150, purpose: 'print' },
    ],
    requiredBrandFields: ['companyName', 'colors.primary'],
    moodTags: ['warranty', 'trust', 'differentiation', 'professional', 'numbers'],
  },
  render({ slots, brand, size, variant }) {
    const palette = resolvePalette(variant, brand.colors);
    const headline = (slots.text.headline ?? 'A warranty as strong as the roof.').trim();
    const tiers: Array<{ n: string; label: string }> = [
      {
        n: (slots.text.tier1Number ?? '10').trim(),
        label: (slots.text.tier1Label ?? 'Year workmanship').trim(),
      },
      {
        n: (slots.text.tier2Number ?? '25').trim(),
        label: (slots.text.tier2Label ?? 'Year material').trim(),
      },
      {
        n: (slots.text.tier3Number ?? '50').trim(),
        label: (slots.text.tier3Label ?? 'Year transferable').trim(),
      },
    ].filter((t) => t.n);
    const w = size.width;
    const hh = size.height;

    function tierBlock(t: { n: string; label: string }, idx: number): SatoriNode {
      const isMiddle = idx === 1;
      return h(
        'div',
        {
          key: idx,
          style: {
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            alignItems: 'center',
            padding: `${Math.round(hh * 0.04)}px 16px`,
            backgroundColor: isMiddle ? palette.accent : palette.surface,
            color: isMiddle ? palette.accentText : palette.text,
            border: isMiddle ? 'none' : `1px solid ${palette.divider}`,
            borderRadius: 18,
            gap: 8,
          },
        },
        h(
          'div',
          {
            style: {
              fontFamily: brand.typography.display,
              fontWeight: 900,
              fontSize: 200,
              lineHeight: 0.92,
              letterSpacing: '-0.05em',
            },
          },
          t.n,
        ),
        h(
          'div',
          {
            style: {
              fontSize: 22,
              textTransform: 'uppercase',
              letterSpacing: '0.18em',
              fontWeight: 700,
              textAlign: 'center',
              color: isMiddle ? mix(palette.accentText, palette.accent, 0.18) : palette.textMuted,
              maxWidth: '85%',
              lineHeight: 1.3,
            },
          },
          t.label,
        ),
      );
    }

    return h(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'column',
          width: w,
          height: hh,
          backgroundColor: palette.background,
          color: palette.text,
          fontFamily: brand.typography.body,
        },
      },
      h(
        'div',
        {
          style: {
            display: 'flex',
            padding: `${Math.round(hh * 0.035)}px ${Math.round(w * 0.05)}px`,
            backgroundColor: palette.surface,
          },
        },
        companyHeader(brand, palette, { size: 56 }),
      ),
      h(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            padding: `${Math.round(hh * 0.04)}px ${Math.round(w * 0.05)}px ${Math.round(hh * 0.025)}px`,
            gap: 16,
          },
        },
        h(
          'div',
          {
            style: {
              fontSize: 22,
              fontWeight: 700,
              color: palette.accent,
              textTransform: 'uppercase',
              letterSpacing: '0.18em',
            },
          },
          'Our Warranty',
        ),
        h(
          'div',
          {
            style: {
              fontFamily: brand.typography.display,
              fontWeight: 800,
              fontSize: 78,
              lineHeight: 1.02,
              letterSpacing: '-0.025em',
              maxWidth: '92%',
            },
          },
          headline,
        ),
      ),
      h(
        'div',
        {
          style: {
            display: 'flex',
            gap: 16,
            padding: `0 ${Math.round(w * 0.05)}px`,
            flex: 1,
          },
        },
        ...tiers.map((t, i) => tierBlock(t, i)),
      ),
      h(
        'div',
        {
          style: {
            display: 'flex',
            padding: `${Math.round(hh * 0.03)}px ${Math.round(w * 0.05)}px`,
          },
        },
        h(
          'div',
          {
            style: {
              fontSize: 18,
              color: palette.textMuted,
              maxWidth: '90%',
              lineHeight: 1.5,
            },
          },
          'Workmanship covers labor + install. Material warranty per manufacturer. Transferable to subsequent owners under standard terms — ask for full coverage details.',
        ),
      ),
      h(
        'div',
        {
          style: {
            display: 'flex',
            padding: `${Math.round(hh * 0.02)}px ${Math.round(w * 0.05)}px`,
            backgroundColor: palette.surface,
            borderTop: `1px solid ${palette.divider}`,
          },
        },
        contactFooter(brand, palette, { compact: true }) ?? h('div', null, ''),
      ),
    );
  },
};
