/**
 * before-after — split layout with BEFORE on the left, AFTER on the
 * right, divided by a vertical brand-color seam. Storm-damage repair
 * and roof-replacement use cases love this format.
 */

import { h, type SatoriNode } from '../../h';
import { resolvePalette, mix } from '../../variants';
import { companyHeader, contactFooter, fitText } from '../../lib/common';
import type { TemplateModule } from '../../types';

export const beforeAfter: TemplateModule = {
  manifest: {
    catalogKey: 'flyer-before-after',
    name: 'Before / after',
    description: 'Side-by-side before/after photos with a banded headline and CTA.',
    contentType: 'FLYER',
    slots: [
      {
        key: 'headline',
        kind: 'text',
        label: 'Headline',
        required: true,
        constraints: { maxChars: 64 },
      },
      {
        key: 'subhead',
        kind: 'text',
        label: 'Subhead',
        required: false,
        constraints: { maxChars: 140 },
      },
      {
        key: 'cta',
        kind: 'text',
        label: 'Call to action',
        required: false,
        constraints: { maxChars: 48 },
      },
      { key: 'before', kind: 'image', label: 'Before photo', required: false },
      { key: 'after', kind: 'image', label: 'After photo', required: false },
    ],
    sizes: [
      { key: 'letter', width: 1275, height: 1650, dpi: 150, purpose: 'print' },
      { key: 'half-letter', width: 1050, height: 1350, dpi: 150, purpose: 'print' },
    ],
    requiredBrandFields: ['companyName', 'colors.primary', 'colors.secondary'],
    moodTags: ['transformation', 'showcase', 'results', 'professional'],
  },
  render({ slots, brand, size, variant }) {
    const palette = resolvePalette(variant, brand.colors);
    const headline = (slots.text.headline ?? 'Storm Damage to Showroom Finish').trim();
    const subhead = (slots.text.subhead ?? '').trim();
    const cta = (slots.text.cta ?? '').trim();
    const w = size.width;
    const hh = size.height;
    const headlineFont = fitText(headline, w - 160, hh * 0.1, { min: 32, max: 72, maxLines: 2 });

    const labelPanel = (label: string, src: string | undefined, accentBg: string): SatoriNode =>
      h(
        'div',
        {
          style: {
            display: 'flex',
            flex: 1,
            position: 'relative',
            backgroundColor: accentBg,
            overflow: 'hidden',
          },
        },
        src
          ? h('img', {
              src,
              style: {
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              },
            })
          : null,
        h(
          'div',
          {
            style: {
              display: 'flex',
              position: 'absolute',
              top: 18,
              left: 18,
              padding: '6px 12px',
              backgroundColor: 'rgba(17,17,17,0.85)',
              color: '#ffffff',
              fontSize: 16,
              fontWeight: 800,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              borderRadius: 4,
            },
          },
          label,
        ),
      );

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
      // Header
      h(
        'div',
        {
          style: {
            display: 'flex',
            padding: `${Math.round(hh * 0.03)}px ${Math.round(w * 0.045)}px`,
            backgroundColor: palette.surface,
          },
        },
        companyHeader(brand, palette, { size: 50 }),
      ),
      // Headline band
      h(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            padding: `${Math.round(hh * 0.03)}px ${Math.round(w * 0.045)}px`,
            backgroundColor: palette.accent,
            color: palette.accentText,
            gap: 6,
          },
        },
        h(
          'div',
          {
            style: {
              fontFamily: brand.typography.display,
              fontSize: headlineFont,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: '-0.02em',
            },
          },
          headline,
        ),
        subhead
          ? h(
              'div',
              {
                style: {
                  fontSize: 20,
                  lineHeight: 1.4,
                  color: mix(palette.accentText, palette.accent, 0.25),
                },
              },
              subhead,
            )
          : null,
      ),
      // Before / after panels with a thin brand seam between them
      h(
        'div',
        { style: { display: 'flex', flex: 1 } },
        labelPanel('Before', slots.image.before, mix(palette.accent, '#000000', 0.45)),
        h('div', { style: { display: 'flex', width: 6, backgroundColor: palette.accent } }),
        labelPanel('After', slots.image.after, palette.accent),
      ),
      // Footer
      h(
        'div',
        {
          style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: `${Math.round(hh * 0.025)}px ${Math.round(w * 0.045)}px`,
            backgroundColor: palette.surface,
            borderTop: `1px solid ${palette.divider}`,
          },
        },
        contactFooter(brand, palette, { compact: true }) ?? h('div', null, ''),
        cta
          ? h(
              'div',
              {
                style: {
                  display: 'flex',
                  padding: '12px 24px',
                  borderRadius: 10,
                  backgroundColor: palette.accent,
                  color: palette.accentText,
                  fontWeight: 700,
                  fontSize: 20,
                },
              },
              cta,
            )
          : null,
      ),
    );
  },
};
