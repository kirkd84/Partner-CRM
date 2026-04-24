/**
 * typography-forward — no photo required. Massive brand-colored
 * headline, spare layout, great for announcements and offers.
 */

import { h } from '../../h';
import { resolvePalette, mix } from '../../variants';
import { companyHeader, contactFooter, fitText } from '../../lib/common';
import type { TemplateModule } from '../../types';

export const typographyForward: TemplateModule = {
  manifest: {
    catalogKey: 'flyer-typography-forward',
    name: 'Typography forward',
    description: 'No photo needed — bold text + brand color do the heavy lifting.',
    contentType: 'FLYER',
    slots: [
      {
        key: 'eyebrow',
        kind: 'text',
        label: 'Eyebrow',
        required: false,
        constraints: { maxChars: 32 },
      },
      {
        key: 'headline',
        kind: 'text',
        label: 'Headline',
        required: true,
        constraints: { maxChars: 80 },
      },
      {
        key: 'body',
        kind: 'text',
        label: 'Body paragraph',
        required: false,
        constraints: { maxChars: 280 },
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
    moodTags: ['minimal', 'announcement', 'offer', 'urgent', 'elegant'],
  },
  render({ slots, brand, size, variant }) {
    const palette = resolvePalette(variant, brand.colors);
    const eyebrow = (slots.text.eyebrow ?? '').trim();
    const headline = (slots.text.headline ?? '').trim() || 'Your Headline Here';
    const body = (slots.text.body ?? '').trim();
    const cta = (slots.text.cta ?? '').trim();
    const w = size.width;
    const hh = size.height;

    const headlineFont = fitText(headline, w - 140, hh * 0.45, { min: 56, max: 160, maxLines: 4 });
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
          padding: `${Math.round(hh * 0.045)}px ${Math.round(w * 0.065)}px`,
          justifyContent: 'space-between',
        },
      },
      // Header
      h('div', { style: { display: 'flex' } }, companyHeader(brand, palette, { size: 56 })),
      // Core
      h(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            paddingTop: Math.round(hh * 0.04),
            paddingBottom: Math.round(hh * 0.04),
            gap: 24,
          },
        },
        eyebrow
          ? h(
              'div',
              {
                style: {
                  display: 'flex',
                  fontFamily: brand.typography.body,
                  fontSize: 22,
                  textTransform: 'uppercase',
                  letterSpacing: '0.18em',
                  color: palette.accent,
                  fontWeight: 700,
                },
              },
              eyebrow,
            )
          : null,
        h(
          'div',
          {
            style: {
              fontFamily: brand.typography.display,
              fontWeight: 800,
              fontSize: headlineFont,
              lineHeight: 1.02,
              letterSpacing: '-0.03em',
              color: palette.text,
            },
          },
          headline,
        ),
        body
          ? h(
              'div',
              {
                style: {
                  fontSize: Math.max(20, Math.round(headlineFont * 0.2)),
                  lineHeight: 1.45,
                  color: palette.textMuted,
                  maxWidth: '78%',
                },
              },
              body,
            )
          : null,
        cta
          ? h(
              'div',
              {
                style: {
                  display: 'flex',
                  alignSelf: 'flex-start',
                  padding: '14px 28px',
                  marginTop: 8,
                  borderRadius: 10,
                  backgroundColor: palette.accent,
                  color: palette.accentText,
                  fontSize: 22,
                  fontWeight: 700,
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
            flexDirection: 'column',
            gap: 16,
            borderTop: `4px solid ${palette.accent}`,
            paddingTop: 20,
          },
        },
        contactFooter(brand, palette),
        h(
          'div',
          { style: { color: mix(palette.textMuted, palette.background, 0.6), fontSize: 11 } },
          '— design in Studio —',
        ),
      ),
    );
  },
};
