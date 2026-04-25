/**
 * social-roof-of-the-week — featured-install spotlight. Big "Roof of the
 * Week" eyebrow, before/after split (or single hero photo), project
 * details strip beneath. Designed to repost a completed-job photo
 * with attribution.
 */

import { h, type SatoriNode } from '../../h';
import { resolvePalette, mix } from '../../variants';
import { logoBadge } from '../../lib/common';
import type { TemplateModule } from '../../types';

export const roofOfTheWeek: TemplateModule = {
  manifest: {
    catalogKey: 'social-roof-of-the-week',
    name: 'Roof of the week',
    description: 'Featured-install showcase with optional before/after split + project details.',
    contentType: 'SOCIAL_POST',
    slots: [
      {
        key: 'eyebrow',
        kind: 'text',
        label: 'Eyebrow',
        required: false,
        constraints: { maxChars: 32 },
        defaultValue: 'Roof of the week',
      },
      {
        key: 'projectName',
        kind: 'text',
        label: 'Project name / address (e.g. Centennial install)',
        required: true,
        constraints: { maxChars: 60 },
      },
      {
        key: 'detail1',
        kind: 'text',
        label: 'Detail 1 (e.g. Material)',
        required: false,
        constraints: { maxChars: 40 },
        defaultValue: 'Architectural shingle',
      },
      {
        key: 'detail2',
        kind: 'text',
        label: 'Detail 2 (e.g. Color)',
        required: false,
        constraints: { maxChars: 40 },
        defaultValue: 'Weathered slate',
      },
      {
        key: 'detail3',
        kind: 'text',
        label: 'Detail 3 (e.g. Squares)',
        required: false,
        constraints: { maxChars: 40 },
        defaultValue: '32 squares',
      },
      { key: 'beforePhoto', kind: 'image', label: 'Before photo', required: false },
      { key: 'afterPhoto', kind: 'image', label: 'After photo', required: false },
    ],
    sizes: [
      { key: 'instagram-square', width: 1080, height: 1080, purpose: 'instagram-square' },
      { key: 'facebook-feed', width: 1200, height: 1200, purpose: 'facebook-feed' },
    ],
    requiredBrandFields: ['companyName', 'colors.primary'],
    moodTags: ['install', 'showcase', 'project', 'before-after', 'social'],
  },
  render({ slots, brand, size, variant }) {
    const palette = resolvePalette(variant, brand.colors);
    const eyebrow = (slots.text.eyebrow ?? 'Roof of the week').trim();
    const projectName = (slots.text.projectName ?? 'Centennial install').trim();
    const details = [
      slots.text.detail1?.trim() || 'Architectural shingle',
      slots.text.detail2?.trim() || 'Weathered slate',
      slots.text.detail3?.trim() || '32 squares',
    ].filter(Boolean) as string[];
    const beforePhoto = slots.image.beforePhoto;
    const afterPhoto = slots.image.afterPhoto;
    const w = size.width;
    const hh = size.height;
    const photoBlockH = Math.round(hh * 0.5);

    function photoTile(label: string, src: string | undefined): SatoriNode {
      return h(
        'div',
        {
          style: {
            display: 'flex',
            flex: 1,
            position: 'relative',
            overflow: 'hidden',
          },
        },
        src
          ? h('img', {
              src,
              width: '100%',
              height: photoBlockH,
              style: { objectFit: 'cover', display: 'block' },
            })
          : h(
              'div',
              {
                style: {
                  display: 'flex',
                  width: '100%',
                  height: photoBlockH,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: mix(palette.background, palette.accent, 0.18),
                  color: palette.text,
                  fontSize: 22,
                  fontWeight: 600,
                },
              },
              `Drop ${label} photo`,
            ),
        h(
          'div',
          {
            style: {
              display: 'flex',
              position: 'absolute',
              top: 16,
              left: 16,
              padding: '4px 12px',
              borderRadius: 999,
              backgroundColor: 'rgba(17,24,39,0.78)',
              color: '#ffffff',
              fontSize: 16,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.18em',
            },
          },
          label,
        ),
      );
    }

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
      h(
        'div',
        {
          style: {
            display: 'flex',
            padding: '32px 48px',
            justifyContent: 'space-between',
            alignItems: 'center',
          },
        },
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 12 } },
          logoBadge(brand, palette, 44),
          h(
            'div',
            {
              style: { fontSize: 22, fontWeight: 800, fontFamily: brand.typography.display },
            },
            brand.companyName,
          ),
        ),
        h(
          'div',
          {
            style: {
              fontSize: 16,
              fontWeight: 700,
              color: palette.accent,
              textTransform: 'uppercase',
              letterSpacing: '0.22em',
            },
          },
          eyebrow,
        ),
      ),
      // Photo split
      h(
        'div',
        { style: { display: 'flex', height: photoBlockH, gap: 4 } },
        photoTile('Before', beforePhoto),
        photoTile('After', afterPhoto),
      ),
      // Details
      h(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            padding: '28px 48px',
            gap: 14,
            flex: 1,
          },
        },
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
          projectName,
        ),
        h(
          'div',
          { style: { display: 'flex', gap: 12, flexWrap: 'wrap' } },
          ...details.map((d, i) =>
            h(
              'div',
              {
                key: i,
                style: {
                  display: 'flex',
                  padding: '8px 16px',
                  borderRadius: 999,
                  backgroundColor: mix(palette.background, palette.accent, 0.08),
                  fontSize: 18,
                  fontWeight: 600,
                  color: palette.text,
                },
              },
              d,
            ),
          ),
        ),
      ),
    );
  },
};
