/**
 * flyer-storm-recovery — emergency storm-damage flyer. Dark high-contrast
 * palette + oversized 24/7 phone number on the right rail; ideal for
 * door-hangers and yard-signs in neighborhoods that just got hit.
 */

import { h } from '../../h';
import { resolvePalette, mix } from '../../variants';
import { logoBadge, contactFooter, fitText } from '../../lib/common';
import type { TemplateModule } from '../../types';

export const stormRecovery: TemplateModule = {
  manifest: {
    catalogKey: 'flyer-storm-recovery',
    name: 'Storm recovery',
    description: 'Urgent dark-mode flyer with a 24/7 phone hero — works on door-hangers + yards.',
    contentType: 'FLYER',
    slots: [
      {
        key: 'eyebrow',
        kind: 'text',
        label: 'Eyebrow (e.g. STORM-DAMAGED ROOFS)',
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
        key: 'phone',
        kind: 'text',
        label: '24/7 phone number',
        required: true,
        constraints: { maxChars: 18 },
      },
      {
        key: 'subheadline',
        kind: 'text',
        label: 'Subhead / promise',
        required: false,
        constraints: { maxChars: 160 },
      },
    ],
    sizes: [
      { key: 'letter', width: 1275, height: 1650, dpi: 150, purpose: 'print' },
      { key: 'half-letter', width: 1050, height: 1350, dpi: 150, purpose: 'print' },
    ],
    requiredBrandFields: ['companyName', 'colors.primary'],
    moodTags: ['urgent', 'storm', 'emergency', 'recovery', 'dark'],
  },
  render({ slots, brand, size, variant }) {
    const palette = resolvePalette(variant, brand.colors);
    const eyebrow = (slots.text.eyebrow ?? 'Storm-Damaged Roofs').trim();
    const headline = (slots.text.headline ?? 'After the Storm — We’re Here.').trim();
    const phone = (slots.text.phone ?? brand.contact.phone ?? '(555) 555-0123').trim();
    const subhead = (slots.text.subheadline ?? '').trim();
    const w = size.width;
    const hh = size.height;
    const dark = mix(palette.text, '#000000', 0.5);
    const headlineFont = fitText(headline, w * 0.6, hh * 0.4, { min: 56, max: 150, maxLines: 4 });
    const phoneFont = fitText(phone, w * 0.4 - 80, hh * 0.18, {
      min: 56,
      max: 130,
      charRatio: 0.6,
      maxLines: 2,
    });

    return h(
      'div',
      {
        style: {
          display: 'flex',
          width: w,
          height: hh,
          backgroundColor: dark,
          color: '#ffffff',
          fontFamily: brand.typography.body,
        },
      },
      // Copy column
      h(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            width: '60%',
            padding: `${Math.round(hh * 0.06)}px ${Math.round(w * 0.05)}px`,
            gap: 24,
            justifyContent: 'space-between',
            borderRight: `4px solid ${palette.accent}`,
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
          { style: { display: 'flex', flexDirection: 'column', gap: 18 } },
          h(
            'div',
            {
              style: {
                fontSize: 22,
                color: palette.accent,
                textTransform: 'uppercase',
                letterSpacing: '0.18em',
                fontWeight: 700,
              },
            },
            eyebrow,
          ),
          h(
            'div',
            {
              style: {
                fontFamily: brand.typography.display,
                fontWeight: 800,
                fontSize: headlineFont,
                lineHeight: 1.0,
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
                    fontSize: 22,
                    lineHeight: 1.5,
                    color: mix('#ffffff', dark, 0.4),
                    maxWidth: '95%',
                  },
                },
                subhead,
              )
            : null,
        ),
        contactFooter(
          { ...brand },
          { ...palette, text: '#ffffff', textMuted: '#cbd5e1' },
          {
            compact: true,
          },
        ) ?? h('div', null, ''),
      ),
      // Phone column
      h(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            width: '40%',
            padding: `${Math.round(hh * 0.06)}px ${Math.round(w * 0.04)}px`,
            backgroundColor: palette.accent,
            color: palette.accentText,
            justifyContent: 'center',
            alignItems: 'center',
            gap: 12,
          },
        },
        h(
          'div',
          {
            style: {
              fontSize: 22,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.22em',
            },
          },
          'Call 24 / 7',
        ),
        h(
          'div',
          {
            style: {
              fontFamily: brand.typography.display,
              fontSize: phoneFont,
              fontWeight: 800,
              letterSpacing: '-0.03em',
              lineHeight: 0.95,
              textAlign: 'center',
            },
          },
          phone,
        ),
        h(
          'div',
          {
            style: {
              fontSize: 18,
              color: mix(palette.accentText, palette.accent, 0.25),
              textAlign: 'center',
              maxWidth: '90%',
              lineHeight: 1.35,
            },
          },
          'Free roof inspection. No obligation. Insurance-claim experts.',
        ),
      ),
    );
  },
};
