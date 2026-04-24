/**
 * promotional-offer — discount/sale flyer with an oversized offer
 * stamp on the right and the offer copy on the left. Built around
 * "20% off through October" / "free roof inspection" use cases.
 */

import { h } from '../../h';
import { resolvePalette, mix } from '../../variants';
import { companyHeader, contactFooter, fitText } from '../../lib/common';
import type { TemplateModule } from '../../types';

export const promotionalOffer: TemplateModule = {
  manifest: {
    catalogKey: 'flyer-promotional-offer',
    name: 'Promotional offer',
    description: 'Big offer stamp + headline + terms. Made for limited-time promotions.',
    contentType: 'FLYER',
    slots: [
      {
        key: 'eyebrow',
        kind: 'text',
        label: 'Eyebrow (e.g. LIMITED TIME)',
        required: false,
        constraints: { maxChars: 28 },
      },
      {
        key: 'headline',
        kind: 'text',
        label: 'Headline',
        required: true,
        constraints: { maxChars: 80 },
      },
      {
        key: 'offerStamp',
        kind: 'text',
        label: 'Offer (e.g. 20% OFF)',
        required: true,
        constraints: { maxChars: 18 },
      },
      {
        key: 'offerSub',
        kind: 'text',
        label: 'Offer subline',
        required: false,
        constraints: { maxChars: 40 },
      },
      {
        key: 'terms',
        kind: 'text',
        label: 'Terms / fine print',
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
    ],
    sizes: [
      { key: 'letter', width: 1275, height: 1650, dpi: 150, purpose: 'print' },
      { key: 'half-letter', width: 1050, height: 1350, dpi: 150, purpose: 'print' },
    ],
    requiredBrandFields: ['companyName', 'colors.primary'],
    moodTags: ['offer', 'announcement', 'urgent', 'sale', 'promotion'],
  },
  render({ slots, brand, size, variant }) {
    const palette = resolvePalette(variant, brand.colors);
    const eyebrow = (slots.text.eyebrow ?? 'Limited Time').trim();
    const headline = (slots.text.headline ?? 'Get Storm-Ready Before Hail Season').trim();
    const offerStamp = (slots.text.offerStamp ?? '20% OFF').trim();
    const offerSub = (slots.text.offerSub ?? 'Inspections in October').trim();
    const terms = (slots.text.terms ?? '').trim();
    const cta = (slots.text.cta ?? 'Call today').trim();
    const w = size.width;
    const hh = size.height;
    const headlineFont = fitText(headline, w * 0.55 - 60, hh * 0.32, {
      min: 40,
      max: 100,
      maxLines: 4,
    });
    const stampFont = fitText(offerStamp, w * 0.4 - 80, hh * 0.18, {
      min: 56,
      max: 160,
      maxLines: 2,
      charRatio: 0.6,
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
      h(
        'div',
        {
          style: {
            display: 'flex',
            padding: `${Math.round(hh * 0.03)}px ${Math.round(w * 0.045)}px`,
            backgroundColor: palette.surface,
            borderBottom: `2px solid ${palette.accent}`,
          },
        },
        companyHeader(brand, palette, { size: 50 }),
      ),
      // Two-column body: copy left, offer stamp right
      h(
        'div',
        { style: { display: 'flex', flex: 1 } },
        // Copy column
        h(
          'div',
          {
            style: {
              display: 'flex',
              flexDirection: 'column',
              width: '60%',
              padding: `${Math.round(hh * 0.05)}px ${Math.round(w * 0.05)}px`,
              gap: 24,
              justifyContent: 'center',
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
            eyebrow,
          ),
          h(
            'div',
            {
              style: {
                fontFamily: brand.typography.display,
                fontSize: headlineFont,
                fontWeight: 800,
                lineHeight: 1.05,
                letterSpacing: '-0.02em',
                color: palette.text,
              },
            },
            headline,
          ),
          terms
            ? h(
                'div',
                {
                  style: {
                    fontSize: 16,
                    lineHeight: 1.5,
                    color: palette.textMuted,
                    maxWidth: '95%',
                  },
                },
                terms,
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
                    borderRadius: 999,
                    backgroundColor: palette.text,
                    color: palette.background,
                    fontSize: 22,
                    fontWeight: 700,
                  },
                },
                cta,
              )
            : null,
        ),
        // Stamp column
        h(
          'div',
          {
            style: {
              display: 'flex',
              flexDirection: 'column',
              width: '40%',
              backgroundColor: palette.accent,
              color: palette.accentText,
              padding: 36,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 16,
              borderLeft: `8px solid ${mix(palette.accent, '#000000', 0.2)}`,
            },
          },
          h(
            'div',
            {
              style: {
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: mix(palette.accentText, palette.accent, 0.2),
              },
            },
            'Save',
          ),
          h(
            'div',
            {
              style: {
                fontFamily: brand.typography.display,
                fontWeight: 800,
                fontSize: stampFont,
                lineHeight: 0.95,
                letterSpacing: '-0.04em',
                textAlign: 'center',
              },
            },
            offerStamp,
          ),
          offerSub
            ? h(
                'div',
                {
                  style: {
                    fontSize: 22,
                    color: mix(palette.accentText, palette.accent, 0.25),
                    textAlign: 'center',
                    lineHeight: 1.3,
                  },
                },
                offerSub,
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
            padding: `${Math.round(hh * 0.025)}px ${Math.round(w * 0.045)}px`,
            backgroundColor: palette.surface,
            borderTop: `1px solid ${palette.divider}`,
          },
        },
        contactFooter(brand, palette, { compact: true }) ?? h('div', null, ''),
      ),
    );
  },
};
