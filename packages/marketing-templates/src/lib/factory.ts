/**
 * Compact template factory.
 *
 * Several social/postcard templates share the same skeleton: company
 * header, big headline, optional eyebrow + supporting body + CTA. The
 * factory builds a TemplateModule for each one so we don't paste the
 * same 200-line layout file fifteen times. Each call only needs the
 * unique manifest data + default copy.
 *
 * The factory is deliberately conservative: one column, centered
 * headline, optional accent color band. Templates that need bespoke
 * art (photo grids, before/after, stat heroes) still get their own
 * dedicated file.
 */

import { h, type SatoriNode } from '../h';
import { resolvePalette, mix } from '../variants';
import { logoBadge, fitText } from './common';
import type { TemplateModule, TemplateSize, ContentType } from '../types';

export interface StackedTemplateInput {
  catalogKey: string;
  name: string;
  description: string;
  contentType: ContentType;
  /** Mood + category tags the director scores against. */
  moodTags: string[];
  /** Extra sizes; defaults to instagram-square + facebook-feed for SOCIAL_POST. */
  sizes?: TemplateSize[];
  defaults: {
    eyebrow: string;
    headline: string;
    body: string;
    cta?: string;
  };
  /**
   * Optional palette tuner — return 'dark' to invert the hero band so
   * urgent / alert templates render with high-contrast dark backgrounds.
   */
  bandStyle?: 'accent' | 'dark' | 'light';
}

const SOCIAL_DEFAULT_SIZES: TemplateSize[] = [
  { key: 'instagram-square', width: 1080, height: 1080, purpose: 'instagram-square' },
  { key: 'facebook-feed', width: 1200, height: 1200, purpose: 'facebook-feed' },
];

const POSTCARD_DEFAULT_SIZES: TemplateSize[] = [
  { key: 'postcard-6x4', width: 1875, height: 1275, purpose: 'postcard-6x4' },
];

export function createStackedTemplate(input: StackedTemplateInput): TemplateModule {
  return {
    manifest: {
      catalogKey: input.catalogKey,
      name: input.name,
      description: input.description,
      contentType: input.contentType,
      slots: [
        {
          key: 'eyebrow',
          kind: 'text',
          label: 'Eyebrow',
          required: false,
          constraints: { maxChars: 32 },
          defaultValue: input.defaults.eyebrow,
        },
        {
          key: 'headline',
          kind: 'text',
          label: 'Headline',
          required: true,
          constraints: { maxChars: 90 },
          defaultValue: input.defaults.headline,
        },
        {
          key: 'body',
          kind: 'text',
          label: 'Body',
          required: false,
          constraints: { maxChars: 200 },
          defaultValue: input.defaults.body,
        },
        {
          key: 'cta',
          kind: 'text',
          label: 'CTA',
          required: false,
          constraints: { maxChars: 32 },
          defaultValue: input.defaults.cta ?? '',
        },
      ],
      sizes:
        input.sizes ??
        (input.contentType === 'POSTCARD' ? POSTCARD_DEFAULT_SIZES : SOCIAL_DEFAULT_SIZES),
      requiredBrandFields: ['companyName', 'colors.primary'],
      moodTags: input.moodTags,
    },
    render({ slots, brand, size, variant }) {
      const palette = resolvePalette(variant, brand.colors);
      const eyebrow = (slots.text.eyebrow ?? input.defaults.eyebrow).trim();
      const headline = (slots.text.headline ?? input.defaults.headline).trim();
      const body = (slots.text.body ?? input.defaults.body).trim();
      const cta = (slots.text.cta ?? input.defaults.cta ?? '').trim();
      const w = size.width;
      const hh = size.height;

      const dark = mix(palette.text, '#000000', 0.45);
      const isDark = input.bandStyle === 'dark';
      const isLight = input.bandStyle === 'light';
      const bg = isDark ? dark : isLight ? '#ffffff' : palette.background;
      const fg = isDark ? '#ffffff' : palette.text;
      const muted = isDark ? mix('#ffffff', dark, 0.65) : palette.textMuted;
      const accent = isDark ? palette.accent : palette.accent;

      const headlineFont = fitText(headline, w - 200, hh * 0.4, {
        min: 56,
        max: 110,
        maxLines: 3,
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
            backgroundColor: bg,
            color: fg,
            padding: 64,
            fontFamily: brand.typography.body,
            justifyContent: 'space-between',
          },
        },
        // ── Header ──
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
                color: fg,
              },
            },
            brand.companyName,
          ),
        ),

        // ── Body block ──
        h(
          'div',
          {
            style: {
              display: 'flex',
              flexDirection: 'column',
              gap: 24,
              alignItems: 'flex-start',
            },
          },
          eyebrow
            ? (h(
                'div',
                {
                  style: {
                    display: 'flex',
                    alignSelf: 'flex-start',
                    padding: '8px 16px',
                    borderRadius: 999,
                    backgroundColor: accent,
                    color: palette.accentText,
                    fontSize: 22,
                    fontWeight: 800,
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                  },
                },
                eyebrow,
              ) as SatoriNode)
            : null,
          h(
            'div',
            {
              style: {
                fontFamily: brand.typography.display,
                fontWeight: 800,
                fontSize: headlineFont,
                lineHeight: 1.05,
                letterSpacing: '-0.02em',
                color: fg,
                maxWidth: '94%',
              },
            },
            headline,
          ),
          body
            ? (h(
                'div',
                {
                  style: {
                    fontSize: 30,
                    color: muted,
                    lineHeight: 1.4,
                    maxWidth: '92%',
                  },
                },
                body,
              ) as SatoriNode)
            : null,
        ),

        // ── Footer (CTA + phone) ──
        h(
          'div',
          {
            style: {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 20,
            },
          },
          cta
            ? (h(
                'div',
                {
                  style: {
                    display: 'flex',
                    padding: '14px 28px',
                    borderRadius: 12,
                    backgroundColor: accent,
                    color: palette.accentText,
                    fontSize: 28,
                    fontWeight: 800,
                  },
                },
                cta,
              ) as SatoriNode)
            : (h('div', {}) as SatoriNode),
          brand.contact.phone
            ? (h(
                'div',
                {
                  style: {
                    fontSize: 26,
                    fontWeight: 700,
                    color: fg,
                  },
                },
                brand.contact.phone,
              ) as SatoriNode)
            : (h('div', {}) as SatoriNode),
        ),
      );
    },
  };
}
