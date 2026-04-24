/**
 * social/service-highlight — square announcement. Bold number/stat or
 * service name at the top, explanation below, contact strip at bottom.
 * Great for "24-hour roof inspections" style posts.
 */

import { h } from '../../h';
import { resolvePalette, mix } from '../../variants';
import { logoBadge, fitText } from '../../lib/common';
import type { TemplateModule } from '../../types';

export const serviceHighlight: TemplateModule = {
  manifest: {
    catalogKey: 'social-service-highlight',
    name: 'Service highlight',
    description: 'Service name or stat hero, explainer underneath, contact strip at bottom.',
    contentType: 'SOCIAL_POST',
    slots: [
      {
        key: 'eyebrow',
        kind: 'text',
        label: 'Eyebrow',
        required: false,
        constraints: { maxChars: 32 },
      },
      {
        key: 'headline',
        kind: 'text',
        label: 'Headline',
        required: true,
        constraints: { maxChars: 60 },
      },
      { key: 'body', kind: 'text', label: 'Body', required: false, constraints: { maxChars: 160 } },
      {
        key: 'cta',
        kind: 'text',
        label: 'Call to action',
        required: false,
        constraints: { maxChars: 36 },
      },
    ],
    sizes: [
      { key: 'instagram-square', width: 1080, height: 1080, purpose: 'instagram-square' },
      { key: 'facebook-feed', width: 1200, height: 1200, purpose: 'facebook-feed' },
    ],
    requiredBrandFields: ['companyName', 'colors.primary', 'colors.secondary'],
    moodTags: ['service', 'announcement', 'offer', 'social'],
  },
  render({ slots, brand, size, variant }) {
    const palette = resolvePalette(variant, brand.colors);
    const eyebrow = (slots.text.eyebrow ?? '').trim();
    const headline = (slots.text.headline ?? 'Same-Day Roof Inspections').trim();
    const body = (slots.text.body ?? '').trim();
    const cta = (slots.text.cta ?? '').trim();
    const w = size.width;
    const hh = size.height;
    const headlineFont = fitText(headline, w - 140, hh * 0.35, { min: 40, max: 120, maxLines: 3 });

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
      // Top band
      h(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            padding: '72px 72px 48px',
            gap: 20,
            flex: 1,
          },
        },
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 14 } },
          logoBadge(brand, palette, 48),
          h(
            'div',
            {
              style: {
                display: 'flex',
                fontSize: 24,
                fontFamily: brand.typography.display,
                fontWeight: 700,
                color: palette.text,
              },
            },
            brand.companyName,
          ),
        ),
        eyebrow
          ? h(
              'div',
              {
                style: {
                  fontSize: 22,
                  textTransform: 'uppercase',
                  letterSpacing: '0.18em',
                  color: palette.accent,
                  fontWeight: 700,
                  marginTop: 40,
                },
              },
              eyebrow,
            )
          : null,
        h(
          'div',
          {
            style: {
              fontFamily: brand.typography.display,
              fontWeight: 800,
              fontSize: headlineFont,
              lineHeight: 1.0,
              letterSpacing: '-0.025em',
              color: palette.text,
              marginTop: eyebrow ? 4 : 40,
            },
          },
          headline,
        ),
        body
          ? h(
              'div',
              {
                style: {
                  fontSize: 26,
                  lineHeight: 1.4,
                  color: palette.textMuted,
                  maxWidth: '90%',
                },
              },
              body,
            )
          : null,
        cta
          ? h(
              'div',
              {
                style: {
                  display: 'flex',
                  alignSelf: 'flex-start',
                  padding: '14px 24px',
                  marginTop: 8,
                  borderRadius: 999,
                  backgroundColor: palette.accent,
                  color: palette.accentText,
                  fontSize: 22,
                  fontWeight: 700,
                },
              },
              cta,
            )
          : null,
      ),
      // Bottom contact strip
      h(
        'div',
        {
          style: {
            display: 'flex',
            padding: '28px 72px',
            backgroundColor: mix(
              palette.background,
              palette.accent,
              variant === 'brand-primary' ? 0.15 : 0.04,
            ),
            color: palette.text,
            fontSize: 22,
            fontWeight: 600,
            gap: 24,
            borderTop: `2px solid ${palette.accent}`,
          },
        },
        brand.contact.phone ? h('div', { style: { display: 'flex' } }, brand.contact.phone) : null,
        brand.contact.website
          ? h(
              'div',
              { style: { display: 'flex', color: palette.textMuted } },
              brand.contact.website,
            )
          : null,
      ),
    );
  },
};
