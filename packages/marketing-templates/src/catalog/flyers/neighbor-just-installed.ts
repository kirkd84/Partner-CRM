/**
 * flyer-neighbor-just-installed — door-hanger / postcard for the
 * "we just finished a roof on your street" social-proof play. Shows the
 * neighbor's address (slot), what we did, and a soft CTA.
 *
 * Designed to be left at every house on the block after a completed
 * install — close-the-loop sales tactic for storm-restoration crews.
 */

import { h } from '../../h';
import { resolvePalette } from '../../variants';
import { companyHeader, contactFooter } from '../../lib/common';
import type { TemplateModule } from '../../types';

export const neighborJustInstalled: TemplateModule = {
  manifest: {
    catalogKey: 'flyer-neighbor-just-installed',
    name: 'Neighbor just installed',
    description: 'We just finished a roof on your street — would you like a free inspection too?',
    contentType: 'FLYER',
    slots: [
      {
        key: 'neighborAddress',
        kind: 'text',
        label: 'Neighbor address (e.g. 1248 Elm St.)',
        required: true,
        constraints: { maxChars: 80 },
      },
      {
        key: 'workDescription',
        kind: 'text',
        label: 'What we did',
        required: false,
        constraints: { maxChars: 200 },
        defaultValue: 'Full roof replacement after hail damage — covered by insurance.',
      },
      {
        key: 'cta',
        kind: 'text',
        label: 'CTA',
        required: false,
        constraints: { maxChars: 60 },
        defaultValue: 'Want a free inspection too?',
      },
      {
        key: 'phone',
        kind: 'text',
        label: 'Direct phone (rep cell)',
        required: false,
        constraints: { maxChars: 24 },
      },
    ],
    sizes: [
      { key: 'half-letter', width: 1050, height: 1350, dpi: 150, purpose: 'print' },
      { key: 'letter', width: 1275, height: 1650, dpi: 150, purpose: 'print' },
    ],
    requiredBrandFields: ['companyName', 'colors.primary'],
    moodTags: ['neighbor', 'door-to-door', 'social-proof', 'install', 'friendly'],
  },
  render({ slots, brand, size, variant }) {
    const palette = resolvePalette(variant, brand.colors);
    const address = (slots.text.neighborAddress ?? '1248 Elm Street').trim();
    const work =
      slots.text.workDescription?.trim() ||
      'Full roof replacement after hail damage — covered by insurance.';
    const cta = (slots.text.cta ?? 'Want a free inspection too?').trim();
    const phone = (slots.text.phone ?? brand.contact.phone ?? '').trim();
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
          padding: `${Math.round(hh * 0.05)}px ${Math.round(w * 0.07)}px`,
          gap: 36,
        },
      },
      companyHeader(brand, palette, { size: 50 }),
      h(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            gap: 24,
            backgroundColor: palette.surface,
            padding: `${Math.round(hh * 0.05)}px ${Math.round(w * 0.06)}px`,
            borderRadius: 24,
            border: `2px dashed ${palette.accent}`,
          },
        },
        h(
          'div',
          {
            style: {
              fontSize: 20,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.22em',
              color: palette.accent,
            },
          },
          'A note from your neighbor’s roofer',
        ),
        h(
          'div',
          {
            style: {
              fontFamily: brand.typography.display,
              fontWeight: 800,
              fontSize: 56,
              lineHeight: 1.05,
              letterSpacing: '-0.02em',
            },
          },
          'We just finished a roof on your street.',
        ),
        h(
          'div',
          {
            style: {
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              padding: '16px 20px',
              borderRadius: 12,
              backgroundColor: palette.background,
              border: `1px solid ${palette.divider}`,
            },
          },
          h(
            'div',
            {
              style: {
                fontSize: 14,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.18em',
                color: palette.textMuted,
              },
            },
            'Address',
          ),
          h(
            'div',
            {
              style: {
                fontSize: 32,
                fontWeight: 800,
                fontFamily: brand.typography.display,
                color: palette.text,
              },
            },
            address,
          ),
        ),
        h(
          'div',
          {
            style: {
              fontSize: 22,
              lineHeight: 1.5,
              color: palette.text,
            },
          },
          work,
        ),
      ),
      h(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: 14,
          },
        },
        h(
          'div',
          {
            style: {
              fontFamily: brand.typography.display,
              fontWeight: 800,
              fontSize: 44,
              color: palette.text,
            },
          },
          cta,
        ),
        phone
          ? h(
              'div',
              {
                style: {
                  display: 'flex',
                  padding: '16px 32px',
                  borderRadius: 999,
                  backgroundColor: palette.accent,
                  color: palette.accentText,
                  fontSize: 26,
                  fontWeight: 800,
                  letterSpacing: '-0.01em',
                },
              },
              `Call or text ${phone}`,
            )
          : null,
      ),
      contactFooter(brand, palette, { compact: true }) ?? h('div', null, ''),
    );
  },
};
