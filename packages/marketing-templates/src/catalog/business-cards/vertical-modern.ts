/**
 * vertical-modern — 2 x 3.5" vertical card. Clean type-driven layout
 * with the brand color as a top band, name dominant, contact footer.
 */

import { h } from '../../h';
import { resolvePalette, mix } from '../../variants';
import { logoBadge } from '../../lib/common';
import type { TemplateModule } from '../../types';

export const verticalModern: TemplateModule = {
  manifest: {
    catalogKey: 'business-card-vertical-modern',
    name: 'Vertical modern card',
    description: '2x3.5" vertical card with a brand band on top, clean typographic layout below.',
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
      // 2 x 3.5" at 300 DPI plus 0.125" bleed each side
      { key: 'us-vertical-300dpi', width: 675, height: 1125, dpi: 300, purpose: 'business-card' },
    ],
    requiredBrandFields: ['companyName', 'colors.primary', 'colors.secondary'],
    moodTags: ['vertical', 'modern', 'minimal', 'professional', 'business-card'],
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
          flexDirection: 'column',
          width: size.width,
          height: size.height,
          backgroundColor: palette.background,
          color: palette.text,
          fontFamily: brand.typography.body,
        },
      },
      // Top brand band
      h(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: palette.accent,
            color: palette.accentText,
            padding: '36px 32px',
            gap: 14,
            alignItems: 'flex-start',
          },
        },
        logoBadge(
          brand,
          { ...palette, accent: palette.accentText, accentText: palette.accent },
          56,
        ),
        h(
          'div',
          {
            style: {
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            },
          },
          h(
            'div',
            {
              style: {
                fontFamily: brand.typography.display,
                fontSize: 24,
                fontWeight: 800,
                letterSpacing: '-0.01em',
              },
            },
            brand.companyName,
          ),
          brand.tagline
            ? h(
                'div',
                {
                  style: {
                    fontSize: 14,
                    color: mix(palette.accentText, palette.accent, 0.25),
                  },
                },
                brand.tagline,
              )
            : null,
        ),
      ),
      // Detail panel
      h(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            padding: '40px 32px',
            gap: 6,
            justifyContent: 'space-between',
          },
        },
        h(
          'div',
          { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
          h(
            'div',
            {
              style: {
                fontFamily: brand.typography.display,
                fontSize: 36,
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
                    fontSize: 16,
                    color: palette.accent,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.16em',
                    marginTop: 4,
                  },
                },
                title,
              )
            : null,
        ),
        h(
          'div',
          {
            style: {
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              fontSize: 18,
              color: palette.text,
            },
          },
          h('div', {
            style: {
              display: 'flex',
              height: 2,
              width: 48,
              backgroundColor: palette.accent,
              marginBottom: 8,
            },
          }),
          phone ? h('div', { style: { display: 'flex' } }, phone) : null,
          email
            ? h(
                'div',
                { style: { display: 'flex', color: palette.textMuted, fontSize: 16 } },
                email,
              )
            : null,
          brand.contact.website
            ? h(
                'div',
                {
                  style: {
                    display: 'flex',
                    color: mix(palette.textMuted, palette.background, 0.2),
                    fontSize: 14,
                    marginTop: 4,
                  },
                },
                brand.contact.website,
              )
            : null,
        ),
      ),
    );
  },
};
