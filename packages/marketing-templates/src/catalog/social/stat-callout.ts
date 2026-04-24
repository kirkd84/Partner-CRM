/**
 * social/stat-callout — oversized number/stat dominates the canvas
 * with a label below. Great for "98% on-time", "1,200+ roofs replaced",
 * "5-star rated".
 */

import { h } from '../../h';
import { resolvePalette, mix } from '../../variants';
import { logoBadge, fitText } from '../../lib/common';
import type { TemplateModule } from '../../types';

export const statCallout: TemplateModule = {
  manifest: {
    catalogKey: 'social-stat-callout',
    name: 'Stat callout',
    description: 'Big number front-and-centre with a short label. Built for proof points.',
    contentType: 'SOCIAL_POST',
    slots: [
      {
        key: 'stat',
        kind: 'text',
        label: 'Stat (e.g. 98%)',
        required: true,
        constraints: { maxChars: 12 },
      },
      {
        key: 'statLabel',
        kind: 'text',
        label: 'Stat label',
        required: true,
        constraints: { maxChars: 80 },
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
        label: 'CTA',
        required: false,
        constraints: { maxChars: 36 },
      },
    ],
    sizes: [
      { key: 'instagram-square', width: 1080, height: 1080, purpose: 'instagram-square' },
      { key: 'facebook-feed', width: 1200, height: 1200, purpose: 'facebook-feed' },
    ],
    requiredBrandFields: ['companyName', 'colors.primary'],
    moodTags: ['stat', 'proof', 'social', 'announcement', 'showcase'],
  },
  render({ slots, brand, size, variant }) {
    const palette = resolvePalette(variant, brand.colors);
    const stat = (slots.text.stat ?? '98%').trim();
    const statLabel = (slots.text.statLabel ?? 'On-time arrival').trim();
    const subhead = (slots.text.subhead ?? '').trim();
    const cta = (slots.text.cta ?? '').trim();
    const w = size.width;
    const hh = size.height;
    const statFont = fitText(stat, w - 200, hh * 0.5, {
      min: 180,
      max: 480,
      maxLines: 1,
      charRatio: 0.55,
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
          padding: 64,
        },
      },
      // Top: brand strip
      h(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: 14 } },
        logoBadge(brand, palette, 48),
        h(
          'div',
          {
            style: {
              fontFamily: brand.typography.display,
              fontWeight: 700,
              fontSize: 24,
              color: palette.text,
            },
          },
          brand.companyName,
        ),
      ),
      // Big stat
      h(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            justifyContent: 'center',
            alignItems: 'flex-start',
          },
        },
        h(
          'div',
          {
            style: {
              fontFamily: brand.typography.display,
              fontWeight: 800,
              fontSize: statFont,
              lineHeight: 0.85,
              letterSpacing: '-0.06em',
              color: palette.accent,
            },
          },
          stat,
        ),
        h(
          'div',
          {
            style: {
              marginTop: 16,
              fontFamily: brand.typography.display,
              fontWeight: 800,
              fontSize: 56,
              lineHeight: 1.1,
              color: palette.text,
              letterSpacing: '-0.02em',
              maxWidth: '90%',
            },
          },
          statLabel,
        ),
        subhead
          ? h(
              'div',
              {
                style: {
                  marginTop: 14,
                  fontSize: 24,
                  lineHeight: 1.4,
                  color: palette.textMuted,
                  maxWidth: '85%',
                },
              },
              subhead,
            )
          : null,
      ),
      // Bottom strip
      h(
        'div',
        {
          style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: 28,
            borderTop: `2px solid ${palette.accent}`,
            color: palette.textMuted,
            fontSize: 20,
          },
        },
        h(
          'div',
          { style: { display: 'flex' } },
          brand.contact.website ?? brand.contact.phone ?? '',
        ),
        cta
          ? h(
              'div',
              {
                style: {
                  display: 'flex',
                  padding: '8px 18px',
                  borderRadius: 999,
                  backgroundColor: palette.accent,
                  color: palette.accentText,
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
