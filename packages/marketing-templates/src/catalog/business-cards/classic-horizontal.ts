/**
 * classic-horizontal — standard 3.5 x 2" horizontal US business card.
 * Front has logo + name + title + contact stack.
 *
 * Size is rendered at 300 DPI (1050 x 600 px incl. bleed) for print.
 */

import { h } from '../../h';
import { resolvePalette, mix } from '../../variants';
import { logoBadge } from '../../lib/common';
import type { TemplateModule } from '../../types';

export const classicHorizontal: TemplateModule = {
  manifest: {
    catalogKey: 'business-card-classic-horizontal',
    name: 'Classic horizontal card',
    description: '3.5x2" card, logo-left, name + title + contact stacked right.',
    contentType: 'BUSINESS_CARD',
    slots: [
      {
        key: 'name',
        kind: 'text',
        label: 'Full name',
        required: true,
        constraints: { maxChars: 60 },
      },
      {
        key: 'title',
        kind: 'text',
        label: 'Job title',
        required: false,
        constraints: { maxChars: 60 },
      },
      {
        key: 'phone',
        kind: 'text',
        label: 'Direct phone',
        required: false,
        constraints: { maxChars: 24 },
      },
      {
        key: 'email',
        kind: 'text',
        label: 'Email',
        required: false,
        constraints: { maxChars: 60 },
      },
    ],
    sizes: [
      // 3.5 x 2 inches at 300 DPI, plus 0.125" bleed each side → 3.75 x 2.25 in
      { key: 'us-300dpi', width: 1125, height: 675, dpi: 300, purpose: 'business-card' },
    ],
    requiredBrandFields: ['companyName', 'colors.primary', 'colors.secondary'],
    moodTags: ['classic', 'professional', 'print', 'business-card'],
  },
  render({ slots, brand, size, variant }) {
    const palette = resolvePalette(variant, brand.colors);
    const name = (slots.text.name ?? 'Your Name').trim();
    const title = (slots.text.title ?? '').trim();
    const phone = (slots.text.phone ?? brand.contact.phone ?? '').trim();
    const email = (slots.text.email ?? brand.contact.email ?? '').trim();

    return h(
      'div',
      {
        style: {
          display: 'flex',
          width: size.width,
          height: size.height,
          backgroundColor: palette.background,
          color: palette.text,
          fontFamily: brand.typography.body,
        },
      },
      // Left logo panel
      h(
        'div',
        {
          style: {
            display: 'flex',
            width: '36%',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 12,
            padding: 24,
            backgroundColor: palette.accent,
            color: palette.accentText,
          },
        },
        logoBadge(
          { ...brand, colors: brand.colors }, // untouched
          { ...palette, accent: palette.accentText, accentText: palette.accent },
          88,
        ),
        h(
          'div',
          {
            style: {
              display: 'flex',
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: '-0.01em',
              color: palette.accentText,
              textAlign: 'center',
            },
          },
          brand.companyName,
        ),
      ),
      // Right detail panel
      h(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            padding: '32px 36px',
            justifyContent: 'center',
            gap: 8,
          },
        },
        h(
          'div',
          {
            style: {
              fontFamily: brand.typography.display,
              fontSize: 40,
              fontWeight: 800,
              letterSpacing: '-0.02em',
              color: palette.text,
            },
          },
          name,
        ),
        title
          ? h(
              'div',
              {
                style: {
                  fontSize: 20,
                  fontWeight: 600,
                  color: palette.accent,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  marginTop: 2,
                },
              },
              title,
            )
          : null,
        h('div', {
          style: {
            display: 'flex',
            height: 2,
            width: 60,
            marginTop: 14,
            marginBottom: 14,
            backgroundColor: palette.accent,
          },
        }),
        phone
          ? h('div', { style: { display: 'flex', fontSize: 22, color: palette.text } }, phone)
          : null,
        email
          ? h('div', { style: { display: 'flex', fontSize: 20, color: palette.textMuted } }, email)
          : null,
        brand.contact.website
          ? h(
              'div',
              {
                style: {
                  display: 'flex',
                  fontSize: 18,
                  color: mix(palette.textMuted, palette.background, 0.2),
                  marginTop: 6,
                },
              },
              brand.contact.website,
            )
          : null,
      ),
    );
  },
};
