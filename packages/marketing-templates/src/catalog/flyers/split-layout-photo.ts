/**
 * split-layout-photo — left: photo (or accent-color panel),
 * right: copy stack. Good for testimonial / services flyers.
 */

import { h } from '../../h';
import { resolvePalette, mix } from '../../variants';
import { companyHeader, contactFooter, fitText } from '../../lib/common';
import type { TemplateModule } from '../../types';

export const splitLayoutPhoto: TemplateModule = {
  manifest: {
    catalogKey: 'flyer-split-layout-photo',
    name: 'Split photo + copy',
    description: 'Left half photo, right half headline + details. Clean and readable.',
    contentType: 'FLYER',
    slots: [
      {
        key: 'headline',
        kind: 'text',
        label: 'Headline',
        required: true,
        constraints: { maxChars: 80 },
      },
      { key: 'body', kind: 'text', label: 'Body', required: false, constraints: { maxChars: 300 } },
      {
        key: 'bullets',
        kind: 'text',
        label: 'Bulleted list (| separated)',
        required: false,
        constraints: { maxChars: 260 },
      },
      {
        key: 'cta',
        kind: 'text',
        label: 'Call to action',
        required: false,
        constraints: { maxChars: 48 },
      },
      { key: 'hero', kind: 'image', label: 'Left panel photo', required: false },
    ],
    sizes: [
      { key: 'letter', width: 1275, height: 1650, dpi: 150, purpose: 'print' },
      { key: 'half-letter', width: 1050, height: 1350, dpi: 150, purpose: 'print' },
    ],
    requiredBrandFields: ['companyName', 'colors.primary', 'colors.secondary'],
    moodTags: ['professional', 'services', 'testimonial', 'detailed'],
  },
  render({ slots, brand, size, variant }) {
    const palette = resolvePalette(variant, brand.colors);
    const headline = (slots.text.headline ?? 'Trusted Roofing, Same-Day Response').trim();
    const body = (slots.text.body ?? '').trim();
    const cta = (slots.text.cta ?? '').trim();
    const hero = slots.image.hero;
    const bullets = (slots.text.bullets ?? '')
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 5);
    const w = size.width;
    const hh = size.height;
    const headlineFont = fitText(headline, w * 0.48 - 60, hh * 0.25, {
      min: 36,
      max: 88,
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
        },
      },
      // Header
      h(
        'div',
        {
          style: {
            display: 'flex',
            padding: `${Math.round(hh * 0.03)}px ${Math.round(w * 0.045)}px`,
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: palette.surface,
          },
        },
        companyHeader(brand, palette, { size: 48 }),
        brand.contact.phone
          ? h(
              'div',
              {
                style: {
                  display: 'flex',
                  fontSize: 22,
                  fontWeight: 700,
                  color: palette.accent,
                  fontFamily: brand.typography.body,
                },
              },
              brand.contact.phone,
            )
          : null,
      ),
      // Two-column body
      h(
        'div',
        { style: { display: 'flex', flex: 1 } },
        // Left panel
        h(
          'div',
          {
            style: {
              display: 'flex',
              width: '48%',
              position: 'relative',
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
        ),
        // Right text column
        h(
          'div',
          {
            style: {
              display: 'flex',
              width: '52%',
              flexDirection: 'column',
              padding: `${Math.round(hh * 0.05)}px ${Math.round(w * 0.04)}px`,
              gap: 20,
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
                    fontSize: 22,
                    lineHeight: 1.45,
                    color: palette.textMuted,
                  },
                },
                body,
              )
            : null,
          bullets.length > 0
            ? h(
                'div',
                { style: { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6 } },
                ...bullets.map((b, i) =>
                  h(
                    'div',
                    {
                      key: i,
                      style: {
                        display: 'flex',
                        gap: 10,
                        alignItems: 'flex-start',
                        fontSize: 22,
                        color: palette.text,
                      },
                    },
                    h('div', {
                      style: {
                        width: 10,
                        height: 10,
                        borderRadius: 5,
                        backgroundColor: palette.accent,
                        marginTop: 10,
                      },
                    }),
                    h('div', { style: { display: 'flex', flex: 1 } }, b),
                  ),
                ),
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
                    borderRadius: 10,
                    backgroundColor: palette.accent,
                    color: palette.accentText,
                    fontSize: 22,
                    fontWeight: 700,
                    marginTop: 12,
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
            padding: `${Math.round(hh * 0.022)}px ${Math.round(w * 0.045)}px`,
            backgroundColor: mix(palette.surface, palette.background, 0.3),
            borderTop: `1px solid ${palette.divider}`,
          },
        },
        contactFooter(brand, palette, { compact: true }),
      ),
    );
  },
};
