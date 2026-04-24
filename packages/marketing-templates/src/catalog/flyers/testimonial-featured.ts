/**
 * testimonial-featured — big quote, attribution row with optional
 * customer photo, and a service summary band underneath. Aimed at
 * "social proof" mailers and lobby-rack flyers.
 */

import { h } from '../../h';
import { resolvePalette, mix } from '../../variants';
import { companyHeader, contactFooter } from '../../lib/common';
import type { TemplateModule } from '../../types';

export const testimonialFeatured: TemplateModule = {
  manifest: {
    catalogKey: 'flyer-testimonial-featured',
    name: 'Testimonial featured',
    description: 'Big quote with attribution + optional customer photo + service summary band.',
    contentType: 'FLYER',
    slots: [
      {
        key: 'quote',
        kind: 'text',
        label: 'Quote',
        required: true,
        constraints: { maxChars: 280 },
      },
      {
        key: 'attribution',
        kind: 'text',
        label: 'Attribution (Name, Title)',
        required: false,
        constraints: { maxChars: 90 },
      },
      {
        key: 'serviceSummary',
        kind: 'text',
        label: 'Service summary',
        required: false,
        constraints: { maxChars: 220 },
      },
      {
        key: 'cta',
        kind: 'text',
        label: 'Call to action',
        required: false,
        constraints: { maxChars: 48 },
      },
      { key: 'customerPhoto', kind: 'image', label: 'Customer photo', required: false },
    ],
    sizes: [
      { key: 'letter', width: 1275, height: 1650, dpi: 150, purpose: 'print' },
      { key: 'half-letter', width: 1050, height: 1350, dpi: 150, purpose: 'print' },
    ],
    requiredBrandFields: ['companyName', 'colors.primary'],
    moodTags: ['testimonial', 'trust', 'quote', 'professional', 'social'],
  },
  render({ slots, brand, size, variant }) {
    const palette = resolvePalette(variant, brand.colors);
    const quote = (
      slots.text.quote ?? '"They saved my closing. On the roof inside two hours."'
    ).trim();
    const attribution = (slots.text.attribution ?? '').trim();
    const serviceSummary = (slots.text.serviceSummary ?? '').trim();
    const cta = (slots.text.cta ?? '').trim();
    const photo = slots.image.customerPhoto;
    const w = size.width;
    const hh = size.height;

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
            padding: `${Math.round(hh * 0.03)}px ${Math.round(w * 0.045)}px`,
            backgroundColor: palette.surface,
            borderBottom: `1px solid ${palette.divider}`,
          },
        },
        companyHeader(brand, palette, { size: 50 }),
      ),
      // Hero quote section
      h(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            padding: `${Math.round(hh * 0.06)}px ${Math.round(w * 0.07)}px`,
            gap: 24,
            justifyContent: 'center',
          },
        },
        h(
          'div',
          {
            style: {
              fontSize: 140,
              fontFamily: brand.typography.display,
              fontWeight: 800,
              lineHeight: 0.85,
              color: palette.accent,
            },
          },
          '\u201C',
        ),
        h(
          'div',
          {
            style: {
              fontFamily: brand.typography.display,
              fontWeight: 700,
              fontSize: 48,
              lineHeight: 1.2,
              letterSpacing: '-0.01em',
              color: palette.text,
            },
          },
          quote,
        ),
        attribution
          ? h(
              'div',
              { style: { display: 'flex', alignItems: 'center', gap: 16, marginTop: 8 } },
              photo
                ? h(
                    'div',
                    {
                      style: {
                        display: 'flex',
                        width: 64,
                        height: 64,
                        borderRadius: 32,
                        overflow: 'hidden',
                        position: 'relative',
                        backgroundColor: palette.accent,
                      },
                    },
                    h('img', {
                      src: photo,
                      style: {
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                      },
                    }),
                  )
                : null,
              h(
                'div',
                {
                  style: {
                    display: 'flex',
                    flexDirection: 'column',
                    fontSize: 22,
                    fontFamily: brand.typography.body,
                    color: palette.textMuted,
                  },
                },
                h('div', { style: { color: palette.text, fontWeight: 700 } }, attribution),
                serviceSummary
                  ? h(
                      'div',
                      { style: { fontSize: 18, marginTop: 2, color: palette.textMuted } },
                      serviceSummary,
                    )
                  : null,
              ),
            )
          : null,
      ),
      // Footer band
      h(
        'div',
        {
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: `${Math.round(hh * 0.025)}px ${Math.round(w * 0.045)}px`,
            backgroundColor: palette.accent,
            color: palette.accentText,
          },
        },
        contactFooter(
          {
            ...brand,
            // Re-color the footer text to read on the accent band.
            typography: brand.typography,
          },
          {
            ...palette,
            textMuted: mix(palette.accentText, palette.accent, 0.25),
            divider: mix(palette.accentText, palette.accent, 0.4),
          },
          { compact: true },
        ) ?? h('div', null, ''),
        cta
          ? h(
              'div',
              {
                style: {
                  display: 'flex',
                  padding: '10px 22px',
                  borderRadius: 999,
                  backgroundColor: palette.background,
                  color: palette.text,
                  fontWeight: 700,
                  fontSize: 18,
                },
              },
              cta,
            )
          : null,
      ),
    );
  },
};
