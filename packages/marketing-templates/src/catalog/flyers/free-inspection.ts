/**
 * flyer-free-inspection — the bread-and-butter offer flyer for any
 * roofing brand. Oversized "FREE" stamp + a what's-included checklist
 * + clear CTA. Designed to drop in /studio and immediately ship.
 */

import { h, type SatoriNode } from '../../h';
import { resolvePalette, mix } from '../../variants';
import { companyHeader, contactFooter } from '../../lib/common';
import type { TemplateModule } from '../../types';

export const freeInspection: TemplateModule = {
  manifest: {
    catalogKey: 'flyer-free-inspection',
    name: 'Free inspection',
    description:
      'Massive FREE stamp + what’s-included checklist. The classic roofing lead-magnet flyer.',
    contentType: 'FLYER',
    slots: [
      {
        key: 'headline',
        kind: 'text',
        label: 'Headline',
        required: true,
        constraints: { maxChars: 80 },
      },
      {
        key: 'item1',
        kind: 'text',
        label: 'Checklist item 1',
        required: false,
        constraints: { maxChars: 60 },
      },
      {
        key: 'item2',
        kind: 'text',
        label: 'Checklist item 2',
        required: false,
        constraints: { maxChars: 60 },
      },
      {
        key: 'item3',
        kind: 'text',
        label: 'Checklist item 3',
        required: false,
        constraints: { maxChars: 60 },
      },
      {
        key: 'item4',
        kind: 'text',
        label: 'Checklist item 4',
        required: false,
        constraints: { maxChars: 60 },
      },
      {
        key: 'cta',
        kind: 'text',
        label: 'Call to action',
        required: false,
        constraints: { maxChars: 48 },
      },
    ],
    sizes: [
      { key: 'letter', width: 1275, height: 1650, dpi: 150, purpose: 'print' },
      { key: 'half-letter', width: 1050, height: 1350, dpi: 150, purpose: 'print' },
    ],
    requiredBrandFields: ['companyName', 'colors.primary'],
    moodTags: ['offer', 'free', 'inspection', 'lead-magnet', 'roofing'],
  },
  render({ slots, brand, size, variant }) {
    const palette = resolvePalette(variant, brand.colors);
    const headline = (slots.text.headline ?? 'Free Roof Inspection.').trim();
    const items = [
      slots.text.item1?.trim() || '22-point shingle + flashing audit',
      slots.text.item2?.trim() || 'Hail-impact mapping with photos',
      slots.text.item3?.trim() || 'Insurance-claim support if damage is found',
      slots.text.item4?.trim() || 'Written estimate within 24 hours',
    ].filter(Boolean) as string[];
    const cta = (slots.text.cta ?? 'Schedule today').trim();
    const w = size.width;
    const hh = size.height;

    function checkRow(text: string, idx: number): SatoriNode {
      return h(
        'div',
        {
          key: idx,
          style: {
            display: 'flex',
            alignItems: 'flex-start',
            gap: 16,
          },
        },
        h(
          'div',
          {
            style: {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: palette.accent,
              color: palette.accentText,
              fontSize: 28,
              fontWeight: 800,
            },
          },
          '✓',
        ),
        h(
          'div',
          {
            style: {
              fontSize: 26,
              lineHeight: 1.3,
              fontWeight: 600,
              color: palette.text,
              maxWidth: '90%',
            },
          },
          text,
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
      // Stamp + headline band
      h(
        'div',
        {
          style: {
            display: 'flex',
            padding: `${Math.round(hh * 0.04)}px ${Math.round(w * 0.05)}px`,
            gap: 36,
            alignItems: 'center',
          },
        },
        h(
          'div',
          {
            style: {
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              width: 280,
              height: 280,
              borderRadius: 140,
              backgroundColor: palette.accent,
              color: palette.accentText,
              transform: 'rotate(-7deg)',
              flexShrink: 0,
            },
          },
          h(
            'div',
            {
              style: {
                fontSize: 110,
                fontFamily: brand.typography.display,
                fontWeight: 900,
                letterSpacing: '-0.04em',
                lineHeight: 0.9,
              },
            },
            'FREE',
          ),
          h(
            'div',
            {
              style: {
                fontSize: 22,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.18em',
                marginTop: 4,
              },
            },
            'Inspection',
          ),
        ),
        h(
          'div',
          {
            style: {
              fontFamily: brand.typography.display,
              fontWeight: 800,
              fontSize: 88,
              lineHeight: 1.0,
              letterSpacing: '-0.025em',
              flex: 1,
            },
          },
          headline,
        ),
      ),
      // Checklist
      h(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            padding: `0 ${Math.round(w * 0.05)}px`,
            gap: 22,
            flex: 1,
          },
        },
        ...items.map((it, i) => checkRow(it, i)),
        cta
          ? h(
              'div',
              {
                style: {
                  display: 'flex',
                  alignSelf: 'flex-start',
                  marginTop: 12,
                  padding: '18px 36px',
                  borderRadius: 999,
                  backgroundColor: palette.text,
                  color: palette.background,
                  fontSize: 28,
                  fontWeight: 800,
                  letterSpacing: '-0.01em',
                },
              },
              cta,
            )
          : null,
      ),
      // Footer
      h(
        'div',
        {
          style: {
            display: 'flex',
            padding: `${Math.round(hh * 0.03)}px ${Math.round(w * 0.05)}px`,
            backgroundColor: palette.surface,
            borderTop: `4px solid ${palette.accent}`,
          },
        },
        contactFooter(brand, palette, { compact: true }) ??
          h('div', { style: { color: mix(palette.textMuted, palette.background, 0.4) } }, ''),
      ),
    );
  },
};
