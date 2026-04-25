/**
 * social-customer-review — five-star testimonial card. Renders the star
 * row in pure-text glyphs (★) so we don't depend on an icon font; the
 * count is configurable but defaults to 5.
 */

import { h } from '../../h';
import { resolvePalette, mix } from '../../variants';
import { logoBadge, fitText } from '../../lib/common';
import type { TemplateModule } from '../../types';

export const customerReview: TemplateModule = {
  manifest: {
    catalogKey: 'social-customer-review',
    name: 'Customer review',
    description: 'Five-star review card with quote + customer name + city.',
    contentType: 'SOCIAL_POST',
    slots: [
      {
        key: 'stars',
        kind: 'text',
        label: 'Star count (1-5)',
        required: false,
        defaultValue: '5',
        constraints: { maxChars: 1 },
      },
      {
        key: 'quote',
        kind: 'text',
        label: 'Review quote',
        required: true,
        constraints: { maxChars: 240 },
      },
      {
        key: 'customerName',
        kind: 'text',
        label: 'Customer name',
        required: true,
        constraints: { maxChars: 40 },
      },
      {
        key: 'city',
        kind: 'text',
        label: 'City / neighborhood',
        required: false,
        constraints: { maxChars: 40 },
      },
      {
        key: 'platform',
        kind: 'text',
        label: 'Source platform (Google, Yelp, …)',
        required: false,
        constraints: { maxChars: 24 },
      },
    ],
    sizes: [
      { key: 'instagram-square', width: 1080, height: 1080, purpose: 'instagram-square' },
      { key: 'facebook-feed', width: 1200, height: 1200, purpose: 'facebook-feed' },
    ],
    requiredBrandFields: ['companyName', 'colors.primary'],
    moodTags: ['testimonial', 'review', 'social-proof', 'trust', 'social'],
  },
  render({ slots, brand, size, variant }) {
    const palette = resolvePalette(variant, brand.colors);
    const starCount = Math.max(0, Math.min(5, Number(slots.text.stars ?? '5') || 5));
    const quote = (
      slots.text.quote ??
      'They handled the whole insurance claim for us — from inspection to final pay-out. Truly painless.'
    ).trim();
    const customer = (slots.text.customerName ?? 'Sandra K.').trim();
    const city = (slots.text.city ?? '').trim();
    const platform = (slots.text.platform ?? '').trim();
    const w = size.width;
    const hh = size.height;
    const quoteFont = fitText(quote, w - 200, hh * 0.5, { min: 30, max: 78, maxLines: 7 });

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
              fontSize: 26,
              fontWeight: 800,
              fontFamily: brand.typography.display,
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
              display: 'flex',
              fontSize: 80,
              color: '#fbbf24',
              letterSpacing: '0.04em',
              fontWeight: 800,
              lineHeight: 1,
            },
          },
          '★'.repeat(starCount) + '☆'.repeat(5 - starCount),
        ),
        h(
          'div',
          {
            style: {
              fontFamily: brand.typography.display,
              fontWeight: 700,
              fontSize: quoteFont,
              lineHeight: 1.2,
              letterSpacing: '-0.01em',
              color: palette.text,
            },
          },
          `“${quote}”`,
        ),
      ),
      h(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            borderLeft: `4px solid ${palette.accent}`,
            paddingLeft: 18,
          },
        },
        h(
          'div',
          {
            style: {
              fontSize: 28,
              fontWeight: 800,
              color: palette.text,
              fontFamily: brand.typography.display,
            },
          },
          customer,
        ),
        h(
          'div',
          {
            style: {
              display: 'flex',
              fontSize: 20,
              color: palette.textMuted,
              gap: 12,
            },
          },
          city ? h('span', null, city) : null,
          city && platform
            ? h('span', { style: { color: mix(palette.textMuted, palette.background, 0.5) } }, '·')
            : null,
          platform ? h('span', null, `via ${platform}`) : null,
        ),
      ),
    );
  },
};
