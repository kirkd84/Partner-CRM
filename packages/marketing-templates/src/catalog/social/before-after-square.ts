/**
 * social/before-after — square version of the flyer's before/after,
 * tuned for the feed: stacked top/bottom on Stories-style 9:16 if we
 * ever add it; for now it ships as a 1080×1080 left/right.
 */

import { h, type SatoriNode } from '../../h';
import { resolvePalette, mix } from '../../variants';
import { logoBadge, fitText } from '../../lib/common';
import type { TemplateModule } from '../../types';

export const beforeAfterSquare: TemplateModule = {
  manifest: {
    catalogKey: 'social-before-after',
    name: 'Before / after (square)',
    description: 'IG-friendly square. Photos left/right, banded headline, contact strip.',
    contentType: 'SOCIAL_POST',
    slots: [
      {
        key: 'headline',
        kind: 'text',
        label: 'Headline',
        required: true,
        constraints: { maxChars: 56 },
      },
      {
        key: 'subhead',
        kind: 'text',
        label: 'Subhead',
        required: false,
        constraints: { maxChars: 80 },
      },
      { key: 'before', kind: 'image', label: 'Before photo', required: false },
      { key: 'after', kind: 'image', label: 'After photo', required: false },
    ],
    sizes: [
      { key: 'instagram-square', width: 1080, height: 1080, purpose: 'instagram-square' },
      { key: 'facebook-feed', width: 1200, height: 1200, purpose: 'facebook-feed' },
    ],
    requiredBrandFields: ['companyName', 'colors.primary', 'colors.secondary'],
    moodTags: ['transformation', 'showcase', 'results', 'social'],
  },
  render({ slots, brand, size, variant }) {
    const palette = resolvePalette(variant, brand.colors);
    const headline = (slots.text.headline ?? 'See the difference.').trim();
    const subhead = (slots.text.subhead ?? '').trim();
    const w = size.width;
    const hh = size.height;
    const headlineFont = fitText(headline, w - 200, hh * 0.13, { min: 40, max: 84, maxLines: 2 });

    const labelPanel = (label: string, src: string | undefined): SatoriNode =>
      h(
        'div',
        {
          style: {
            display: 'flex',
            flex: 1,
            position: 'relative',
            backgroundColor: palette.accent,
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
          fontFamily: brand.typography.body,
        },
      },
      h(
        'div',
        {
          style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '32px 48px',
            backgroundColor: palette.surface,
          },
        },
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 12 } },
          logoBadge(brand, palette, 44),
          h(
            'div',
            {
              style: {
                fontFamily: brand.typography.display,
                fontWeight: 700,
                fontSize: 22,
                color: palette.text,
              },
            },
            brand.companyName,
          ),
        ),
        brand.contact.phone
          ? h(
              'div',
              {
                style: {
                  display: 'flex',
                  fontSize: 18,
                  color: palette.accent,
                  fontWeight: 700,
                },
              },
              brand.contact.phone,
            )
          : null,
      ),
      h(
        'div',
        { style: { display: 'flex', flex: 1 } },
        labelPanel('Before', slots.image.before),
        h('div', { style: { display: 'flex', width: 4, backgroundColor: palette.accent } }),
        labelPanel('After', slots.image.after),
      ),
      h(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            padding: '32px 48px',
            backgroundColor: palette.accent,
            color: palette.accentText,
            gap: 4,
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
                  color: mix(palette.accentText, palette.accent, 0.25),
                },
              },
              subhead,
            )
          : null,
      ),
    );
  },
};
