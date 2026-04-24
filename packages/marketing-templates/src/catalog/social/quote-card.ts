/**
 * social/quote-card — 1080x1080 Instagram/Facebook square with a large
 * quote, attribution line, and brand footer. Great for testimonials or
 * founder-quote reposts.
 */

import { h } from '../../h';
import { resolvePalette } from '../../variants';
import { logoBadge, fitText } from '../../lib/common';
import type { TemplateModule } from '../../types';

export const quoteCard: TemplateModule = {
  manifest: {
    catalogKey: 'social-quote-card',
    name: 'Quote card',
    description: 'Big quote on brand color. Attribution line in muted text.',
    contentType: 'SOCIAL_POST',
    slots: [
      {
        key: 'quote',
        kind: 'text',
        label: 'Quote',
        required: true,
        constraints: { maxChars: 220 },
      },
      {
        key: 'attribution',
        kind: 'text',
        label: 'Attribution',
        required: false,
        constraints: { maxChars: 80 },
      },
    ],
    sizes: [
      { key: 'instagram-square', width: 1080, height: 1080, purpose: 'instagram-square' },
      { key: 'facebook-feed', width: 1200, height: 1200, purpose: 'facebook-feed' },
    ],
    requiredBrandFields: ['companyName', 'colors.primary'],
    moodTags: ['testimonial', 'social', 'quote', 'celebration'],
  },
  render({ slots, brand, size, variant }) {
    const palette = resolvePalette(variant, brand.colors);
    const quote = (slots.text.quote ?? 'Add a quote that feels unmistakably you.').trim();
    const attribution = (slots.text.attribution ?? '').trim();
    const w = size.width;
    const hh = size.height;
    const quoteFont = fitText(quote, w - 180, hh * 0.55, { min: 36, max: 90, maxLines: 6 });

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
          padding: 80,
          justifyContent: 'space-between',
        },
      },
      h(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: 14 } },
        logoBadge(brand, palette, 56),
        h(
          'div',
          {
            style: {
              display: 'flex',
              fontSize: 28,
              fontFamily: brand.typography.display,
              fontWeight: 700,
              color: palette.text,
              letterSpacing: '-0.01em',
            },
          },
          brand.companyName,
        ),
      ),
      h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: 24 } },
        h(
          'div',
          {
            style: {
              fontSize: 120,
              lineHeight: 0.85,
              fontFamily: brand.typography.display,
              color: palette.accent,
              fontWeight: 800,
            },
          },
          '\u201C',
        ),
        h(
          'div',
          {
            style: {
              fontFamily: brand.typography.display,
              fontSize: quoteFont,
              fontWeight: 700,
              color: palette.text,
              lineHeight: 1.2,
              letterSpacing: '-0.01em',
            },
          },
          quote,
        ),
        attribution
          ? h(
              'div',
              {
                style: {
                  fontSize: 28,
                  color: palette.textMuted,
                  fontFamily: brand.typography.body,
                },
              },
              `— ${attribution}`,
            )
          : null,
      ),
      h('div', {
        style: {
          display: 'flex',
          height: 8,
          width: 140,
          backgroundColor: palette.accent,
          borderRadius: 4,
        },
      }),
    );
  },
};
