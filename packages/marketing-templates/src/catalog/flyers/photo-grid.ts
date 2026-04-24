/**
 * photo-grid — 2x2 photo grid with a centered headline strip.
 * Great for "what we do" overview flyers and recent-projects sheets.
 * Photos are optional; missing slots get accent-colored placeholders
 * with the slot label so it never looks broken.
 */

import { h, type SatoriNode } from '../../h';
import { resolvePalette, mix } from '../../variants';
import { companyHeader, contactFooter, fitText } from '../../lib/common';
import type { TemplateModule } from '../../types';

export const photoGrid: TemplateModule = {
  manifest: {
    catalogKey: 'flyer-photo-grid',
    name: 'Photo grid',
    description: '2×2 photo grid with a banded headline. Strong for project showcases.',
    contentType: 'FLYER',
    slots: [
      {
        key: 'headline',
        kind: 'text',
        label: 'Headline',
        required: true,
        constraints: { maxChars: 64 },
      },
      {
        key: 'subhead',
        kind: 'text',
        label: 'Subhead',
        required: false,
        constraints: { maxChars: 120 },
      },
      {
        key: 'cta',
        kind: 'text',
        label: 'Call to action',
        required: false,
        constraints: { maxChars: 48 },
      },
      { key: 'photo1', kind: 'image', label: 'Photo 1 (top-left)', required: false },
      { key: 'photo2', kind: 'image', label: 'Photo 2 (top-right)', required: false },
      { key: 'photo3', kind: 'image', label: 'Photo 3 (bottom-left)', required: false },
      { key: 'photo4', kind: 'image', label: 'Photo 4 (bottom-right)', required: false },
    ],
    sizes: [
      { key: 'letter', width: 1275, height: 1650, dpi: 150, purpose: 'print' },
      { key: 'half-letter', width: 1050, height: 1350, dpi: 150, purpose: 'print' },
    ],
    requiredBrandFields: ['companyName', 'colors.primary', 'colors.secondary'],
    moodTags: ['showcase', 'gallery', 'portfolio', 'professional'],
  },
  render({ slots, brand, size, variant }) {
    const palette = resolvePalette(variant, brand.colors);
    const headline = (slots.text.headline ?? 'Recent Work').trim();
    const subhead = (slots.text.subhead ?? '').trim();
    const cta = (slots.text.cta ?? '').trim();
    const w = size.width;
    const hh = size.height;
    const headlineFont = fitText(headline, w - 200, hh * 0.08, { min: 30, max: 64, maxLines: 2 });

    const photoTile = (src: string | undefined, idx: number): SatoriNode => {
      if (src) {
        return h(
          'div',
          {
            style: {
              display: 'flex',
              flex: 1,
              position: 'relative',
              backgroundColor: palette.accent,
              overflow: 'hidden',
            },
          },
          h('img', {
            src,
            style: {
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            },
          }),
        );
      }
      // Empty placeholder — alternating accent/secondary tints so the grid still reads.
      const tint = idx % 2 === 0 ? palette.accent : mix(palette.accent, palette.background, 0.3);
      return h(
        'div',
        {
          style: {
            display: 'flex',
            flex: 1,
            backgroundColor: tint,
            alignItems: 'center',
            justifyContent: 'center',
            color: palette.accentText,
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          },
        },
        `Photo ${idx + 1}`,
      );
    };

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
      // Header
      h(
        'div',
        {
          style: {
            display: 'flex',
            padding: `${Math.round(hh * 0.03)}px ${Math.round(w * 0.045)}px`,
            backgroundColor: palette.surface,
            borderBottom: `2px solid ${palette.accent}`,
          },
        },
        companyHeader(brand, palette, { size: 48 }),
      ),
      // Top photo row
      h(
        'div',
        { style: { display: 'flex', flex: 1, gap: 6, padding: 6 } },
        photoTile(slots.image.photo1, 0),
        photoTile(slots.image.photo2, 1),
      ),
      // Headline band (between rows)
      h(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            padding: `${Math.round(hh * 0.025)}px ${Math.round(w * 0.045)}px`,
            backgroundColor: palette.accent,
            color: palette.accentText,
            gap: 8,
          },
        },
        h(
          'div',
          {
            style: {
              fontFamily: brand.typography.display,
              fontSize: headlineFont,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: '-0.02em',
            },
          },
          headline,
        ),
        subhead
          ? h(
              'div',
              {
                style: {
                  fontSize: 20,
                  lineHeight: 1.35,
                  color: mix(palette.accentText, palette.accent, 0.2),
                },
              },
              subhead,
            )
          : null,
      ),
      // Bottom photo row
      h(
        'div',
        { style: { display: 'flex', flex: 1, gap: 6, padding: 6 } },
        photoTile(slots.image.photo3, 2),
        photoTile(slots.image.photo4, 3),
      ),
      // Footer
      h(
        'div',
        {
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: `${Math.round(hh * 0.022)}px ${Math.round(w * 0.045)}px`,
            backgroundColor: palette.surface,
            borderTop: `1px solid ${palette.divider}`,
          },
        },
        contactFooter(brand, palette, { compact: true }) ?? h('div', null, ''),
        cta
          ? h(
              'div',
              {
                style: {
                  display: 'flex',
                  padding: '10px 22px',
                  borderRadius: 999,
                  backgroundColor: palette.accent,
                  color: palette.accentText,
                  fontSize: 18,
                  fontWeight: 700,
                },
              },
              cta,
            )
          : null,
      ),
    );
  },
};
