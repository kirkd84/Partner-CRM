/**
 * hero-photo-overlay — big photo, gradient scrim, overlaid headline.
 * Matches the pattern of Kirk's "Supporting Your Client's Property"
 * flyer. Works when the user has an image; gracefully degrades to an
 * accent-color panel when they don't.
 */

import { h } from '../../h';
import { resolvePalette, mix } from '../../variants';
import { companyHeader, contactFooter, fitText } from '../../lib/common';
import type { TemplateModule } from '../../types';

export const heroPhotoOverlay: TemplateModule = {
  manifest: {
    catalogKey: 'flyer-hero-photo-overlay',
    name: 'Hero photo with overlay',
    description: 'Big photo. Bold headline in a dark scrim across the bottom. Classic flyer.',
    contentType: 'FLYER',
    slots: [
      {
        key: 'headline',
        kind: 'text',
        label: 'Headline',
        required: true,
        constraints: { maxChars: 70 },
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
      { key: 'hero', kind: 'image', label: 'Hero photo', required: false },
    ],
    sizes: [
      { key: 'letter', width: 1275, height: 1650, dpi: 150, purpose: 'print' },
      { key: 'half-letter', width: 1050, height: 1350, dpi: 150, purpose: 'print' },
    ],
    requiredBrandFields: ['companyName', 'colors.primary', 'colors.secondary'],
    moodTags: ['bold', 'photo-forward', 'trust', 'professional'],
  },
  render({ slots, brand, size, variant }) {
    const palette = resolvePalette(variant, brand.colors);
    const headline = (slots.text.headline ?? "Supporting Your Client's Property").trim();
    const subhead = (slots.text.subhead ?? '').trim();
    const cta = (slots.text.cta ?? '').trim();
    const hero = slots.image.hero;
    const w = size.width;
    const hh = size.height;

    const scrimHeight = Math.round(hh * 0.42);
    const headlineFont = fitText(headline, w - 120, scrimHeight * 0.55, {
      min: 40,
      max: 110,
      maxLines: 3,
    });

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
          position: 'relative',
        },
      },
      // Header band
      h(
        'div',
        {
          style: {
            display: 'flex',
            padding: `${Math.round(hh * 0.035)}px ${Math.round(w * 0.05)}px`,
            backgroundColor: palette.surface,
            borderBottom: `2px solid ${palette.accent}`,
          },
        },
        companyHeader(brand, palette, { size: 52 }),
      ),
      // Hero image / accent panel
      h(
        'div',
        {
          style: {
            display: 'flex',
            position: 'relative',
            flex: 1,
            backgroundColor: palette.accent,
            overflow: 'hidden',
          },
        },
        hero
          ? h('img', {
              src: hero,
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
        // Bottom scrim with headline
        h(
          'div',
          {
            style: {
              display: 'flex',
              flexDirection: 'column',
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: scrimHeight,
              padding: `${Math.round(hh * 0.03)}px ${Math.round(w * 0.06)}px`,
              backgroundImage: `linear-gradient(to bottom, ${mix(palette.background, '#000000', 0.85)}00, ${mix(palette.background, '#000000', 0.85)} 40%)`,
              justifyContent: 'flex-end',
              color: '#ffffff',
            },
          },
          h(
            'div',
            {
              style: {
                fontFamily: brand.typography.display,
                fontWeight: 800,
                fontSize: headlineFont,
                lineHeight: 1.05,
                letterSpacing: '-0.02em',
                color: '#ffffff',
              },
            },
            headline,
          ),
          subhead
            ? h(
                'div',
                {
                  style: {
                    marginTop: 16,
                    fontSize: Math.max(20, Math.round(headlineFont * 0.35)),
                    lineHeight: 1.35,
                    color: mix('#ffffff', palette.accent, 0.2),
                    fontFamily: brand.typography.body,
                    maxWidth: '75%',
                  },
                },
                subhead,
              )
            : null,
          cta
            ? h(
                'div',
                {
                  style: {
                    display: 'flex',
                    marginTop: 20,
                    alignSelf: 'flex-start',
                    padding: '12px 24px',
                    borderRadius: 8,
                    backgroundColor: palette.accent,
                    color: palette.accentText,
                    fontWeight: 700,
                    fontSize: Math.max(18, Math.round(headlineFont * 0.3)),
                  },
                },
                cta,
              )
            : null,
        ),
      ),
      // Footer
      h(
        'div',
        {
          style: {
            display: 'flex',
            padding: `${Math.round(hh * 0.025)}px ${Math.round(w * 0.05)}px`,
            backgroundColor: palette.surface,
            borderTop: `1px solid ${palette.divider}`,
          },
        },
        contactFooter(brand, palette),
      ),
    );
  },
};
