/**
 * social-team-spotlight — meet-the-team / employee profile card. Photo
 * goes top-right (square crop), name + title bottom-left. When the photo
 * slot is empty we fall back to a large monogram tile.
 */

import { h } from '../../h';
import { resolvePalette, mix } from '../../variants';
import { logoBadge } from '../../lib/common';
import type { TemplateModule } from '../../types';

export const teamSpotlight: TemplateModule = {
  manifest: {
    catalogKey: 'social-team-spotlight',
    name: 'Team spotlight',
    description: 'Meet-the-team card with photo, name, role, and a personal "ask me about" line.',
    contentType: 'SOCIAL_POST',
    slots: [
      {
        key: 'name',
        kind: 'text',
        label: 'Person’s name',
        required: true,
        constraints: { maxChars: 40 },
      },
      {
        key: 'role',
        kind: 'text',
        label: 'Role / title',
        required: true,
        constraints: { maxChars: 50 },
      },
      {
        key: 'tenure',
        kind: 'text',
        label: 'Tenure (e.g. With us since 2017)',
        required: false,
        constraints: { maxChars: 32 },
      },
      {
        key: 'askMeAbout',
        kind: 'text',
        label: 'Ask me about…',
        required: false,
        constraints: { maxChars: 120 },
      },
      {
        key: 'photo',
        kind: 'image',
        label: 'Headshot (square crop preferred)',
        required: false,
        constraints: { aspectRatio: '1:1' },
      },
    ],
    sizes: [
      { key: 'instagram-square', width: 1080, height: 1080, purpose: 'instagram-square' },
      { key: 'facebook-feed', width: 1200, height: 1200, purpose: 'facebook-feed' },
    ],
    requiredBrandFields: ['companyName', 'colors.primary'],
    moodTags: ['team', 'people', 'personable', 'meet-the-team', 'social'],
  },
  render({ slots, brand, size, variant }) {
    const palette = resolvePalette(variant, brand.colors);
    const name = (slots.text.name ?? 'Drew M.').trim();
    const role = (slots.text.role ?? 'Senior Roof Specialist').trim();
    const tenure = (slots.text.tenure ?? '').trim();
    const ask = (slots.text.askMeAbout ?? '').trim();
    const photo = slots.image.photo;
    const w = size.width;
    const hh = size.height;
    const tileSize = Math.round(w * 0.42);

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
          padding: 56,
          justifyContent: 'space-between',
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
              fontSize: 24,
              fontWeight: 800,
              fontFamily: brand.typography.display,
            },
          },
          brand.companyName,
        ),
      ),
      // Photo / monogram tile
      h(
        'div',
        {
          style: {
            display: 'flex',
            alignSelf: 'flex-end',
            width: tileSize,
            height: tileSize,
            borderRadius: 24,
            overflow: 'hidden',
            border: `4px solid ${palette.accent}`,
            backgroundColor: mix(palette.background, palette.accent, 0.15),
            alignItems: 'center',
            justifyContent: 'center',
          },
        },
        photo
          ? h('img', {
              src: photo,
              width: tileSize,
              height: tileSize,
              style: { objectFit: 'cover', display: 'block' },
            })
          : h(
              'div',
              {
                style: {
                  fontFamily: brand.typography.display,
                  fontSize: tileSize * 0.45,
                  fontWeight: 900,
                  color: palette.accent,
                  letterSpacing: '-0.02em',
                },
              },
              (
                name
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((s) => s[0] ?? '')
                  .join('') || 'TM'
              ).toUpperCase(),
            ),
      ),
      // Name + role + ask
      h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
        h(
          'div',
          {
            style: {
              fontSize: 18,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.22em',
              color: palette.accent,
            },
          },
          'Meet the team',
        ),
        h(
          'div',
          {
            style: {
              fontFamily: brand.typography.display,
              fontWeight: 800,
              fontSize: 78,
              lineHeight: 1.0,
              letterSpacing: '-0.025em',
            },
          },
          name,
        ),
        h(
          'div',
          {
            style: {
              fontSize: 28,
              color: palette.textMuted,
              fontWeight: 600,
            },
          },
          tenure ? `${role} · ${tenure}` : role,
        ),
        ask
          ? h(
              'div',
              {
                style: {
                  marginTop: 14,
                  padding: '14px 22px',
                  borderRadius: 999,
                  alignSelf: 'flex-start',
                  backgroundColor: mix(palette.background, palette.accent, 0.1),
                  color: palette.text,
                  fontSize: 22,
                  fontWeight: 600,
                },
              },
              `Ask me about: ${ask}`,
            )
          : null,
      ),
    );
  },
};
