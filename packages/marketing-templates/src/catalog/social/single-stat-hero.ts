/**
 * social-single-stat-hero — one giant brand-color number with a short
 * label below ("1,200 roofs installed"). Best for milestone posts and
 * "by the numbers" cards.
 */

import { h } from '../../h';
import { resolvePalette } from '../../variants';
import { logoBadge, fitText } from '../../lib/common';
import type { TemplateModule } from '../../types';

export const singleStatHero: TemplateModule = {
  manifest: {
    catalogKey: 'social-single-stat-hero',
    name: 'Single stat hero',
    description: 'Giant number + label. Built for milestones and "by the numbers" posts.',
    contentType: 'SOCIAL_POST',
    slots: [
      {
        key: 'eyebrow',
        kind: 'text',
        label: 'Eyebrow',
        required: false,
        constraints: { maxChars: 32 },
        defaultValue: 'BY THE NUMBERS',
      },
      {
        key: 'stat',
        kind: 'text',
        label: 'Stat (e.g. 1,200)',
        required: true,
        constraints: { maxChars: 12 },
      },
      {
        key: 'unit',
        kind: 'text',
        label: 'Unit (e.g. roofs)',
        required: false,
        constraints: { maxChars: 24 },
      },
      {
        key: 'context',
        kind: 'text',
        label: 'Context line',
        required: false,
        constraints: { maxChars: 140 },
        defaultValue: 'Installed across Colorado since we started in 2009.',
      },
    ],
    sizes: [
      { key: 'instagram-square', width: 1080, height: 1080, purpose: 'instagram-square' },
      { key: 'facebook-feed', width: 1200, height: 1200, purpose: 'facebook-feed' },
    ],
    requiredBrandFields: ['companyName', 'colors.primary'],
    moodTags: ['milestone', 'numbers', 'celebration', 'social', 'achievement'],
  },
  render({ slots, brand, size, variant }) {
    const palette = resolvePalette(variant, brand.colors);
    const eyebrow = (slots.text.eyebrow ?? 'BY THE NUMBERS').trim();
    const stat = (slots.text.stat ?? '1,200').trim();
    const unit = (slots.text.unit ?? 'roofs').trim();
    const context =
      slots.text.context?.trim() || 'Installed across Colorado since we started in 2009.';
    const w = size.width;
    const hh = size.height;
    const statFont = fitText(stat, w - 200, hh * 0.55, {
      min: 200,
      max: 520,
      maxLines: 1,
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
          padding: 80,
          justifyContent: 'space-between',
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
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            alignItems: 'flex-start',
          },
        },
        h(
          'div',
          {
            style: {
              fontSize: 26,
              fontWeight: 800,
              color: palette.accent,
              textTransform: 'uppercase',
              letterSpacing: '0.22em',
            },
          },
          eyebrow,
        ),
        h(
          'div',
          {
            style: {
              fontFamily: brand.typography.display,
              fontWeight: 900,
              fontSize: statFont,
              lineHeight: 0.9,
              letterSpacing: '-0.05em',
              color: palette.accent,
            },
          },
          stat,
        ),
        unit
          ? h(
              'div',
              {
                style: {
                  fontSize: 56,
                  fontWeight: 800,
                  fontFamily: brand.typography.display,
                  letterSpacing: '-0.02em',
                  color: palette.text,
                },
              },
              unit,
            )
          : null,
      ),
      h(
        'div',
        {
          style: {
            fontSize: 28,
            color: palette.textMuted,
            lineHeight: 1.4,
            maxWidth: '90%',
          },
        },
        context,
      ),
    );
  },
};
