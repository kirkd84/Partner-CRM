/**
 * social/behind-the-scenes — vertical photo column with a text panel on
 * the right (or stacked underneath on stories-aspect later). Aimed at
 * "meet the team" / "morning roll" / day-in-the-life posts.
 */

import { h } from '../../h';
import { resolvePalette, mix } from '../../variants';
import { logoBadge, fitText } from '../../lib/common';
import type { TemplateModule } from '../../types';

export const behindTheScenes: TemplateModule = {
  manifest: {
    catalogKey: 'social-behind-the-scenes',
    name: 'Behind the scenes',
    description: 'Photo column + caption. Great for team intros and day-in-the-life posts.',
    contentType: 'SOCIAL_POST',
    slots: [
      {
        key: 'eyebrow',
        kind: 'text',
        label: 'Eyebrow',
        required: false,
        constraints: { maxChars: 28 },
      },
      {
        key: 'headline',
        kind: 'text',
        label: 'Headline',
        required: true,
        constraints: { maxChars: 60 },
      },
      {
        key: 'caption',
        kind: 'text',
        label: 'Caption',
        required: false,
        constraints: { maxChars: 240 },
      },
      { key: 'photo', kind: 'image', label: 'Photo', required: false },
    ],
    sizes: [
      { key: 'instagram-square', width: 1080, height: 1080, purpose: 'instagram-square' },
      { key: 'facebook-feed', width: 1200, height: 1200, purpose: 'facebook-feed' },
    ],
    requiredBrandFields: ['companyName', 'colors.primary'],
    moodTags: ['team', 'social', 'lifestyle', 'authentic'],
  },
  render({ slots, brand, size, variant }) {
    const palette = resolvePalette(variant, brand.colors);
    const eyebrow = (slots.text.eyebrow ?? 'Behind the scenes').trim();
    const headline = (slots.text.headline ?? 'Meet the crew that makes it happen.').trim();
    const caption = (slots.text.caption ?? '').trim();
    const photo = slots.image.photo;
    const w = size.width;
    const hh = size.height;
    const headlineFont = fitText(headline, w * 0.55 - 80, hh * 0.4, {
      min: 30,
      max: 64,
      maxLines: 4,
    });

    return h(
      'div',
      {
        style: {
          display: 'flex',
          width: w,
          height: hh,
          backgroundColor: palette.background,
          fontFamily: brand.typography.body,
        },
      },
      // Photo panel
      h(
        'div',
        {
          style: {
            display: 'flex',
            width: '45%',
            position: 'relative',
            backgroundColor: palette.accent,
            overflow: 'hidden',
          },
        },
        photo
          ? h('img', {
              src: photo,
              style: {
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              },
            })
          : h(
              'div',
              {
                style: {
                  display: 'flex',
                  width: '100%',
                  height: '100%',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: brand.typography.display,
                  fontWeight: 800,
                  fontSize: 96,
                  color: palette.accentText,
                  letterSpacing: '-0.04em',
                },
              },
              brand.companyName.slice(0, 1).toUpperCase(),
            ),
      ),
      // Text panel
      h(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            width: '55%',
            padding: 56,
            justifyContent: 'space-between',
          },
        },
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 12 } },
          logoBadge(brand, palette, 44),
          h(
            'div',
            {
              style: {
                fontFamily: brand.typography.display,
                fontWeight: 700,
                fontSize: 22,
                color: palette.text,
              },
            },
            brand.companyName,
          ),
        ),
        h(
          'div',
          { style: { display: 'flex', flexDirection: 'column', gap: 16 } },
          eyebrow
            ? h(
                'div',
                {
                  style: {
                    fontSize: 18,
                    textTransform: 'uppercase',
                    letterSpacing: '0.18em',
                    color: palette.accent,
                    fontWeight: 700,
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
                fontSize: headlineFont,
                fontWeight: 800,
                lineHeight: 1.08,
                letterSpacing: '-0.02em',
                color: palette.text,
              },
            },
            headline,
          ),
          caption
            ? h(
                'div',
                {
                  style: {
                    fontSize: 22,
                    lineHeight: 1.4,
                    color: palette.textMuted,
                  },
                },
                caption,
              )
            : null,
        ),
        h(
          'div',
          {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              color: palette.textMuted,
              fontSize: 18,
            },
          },
          h('div', {
            style: { display: 'flex', height: 2, width: 40, backgroundColor: palette.accent },
          }),
          h(
            'div',
            { style: { display: 'flex' } },
            brand.contact.website ?? brand.contact.phone ?? brand.companyName,
          ),
        ),
      ),
    );
  },
};
