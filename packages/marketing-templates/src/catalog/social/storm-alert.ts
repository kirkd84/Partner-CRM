/**
 * social-storm-alert — urgent banner for "severe weather just hit your
 * area, document damage now" moments. Bold dark palette, lightning
 * eyebrow, action checklist that homeowners can screenshot.
 */

import { h, type SatoriNode } from '../../h';
import { resolvePalette, mix } from '../../variants';
import { logoBadge } from '../../lib/common';
import type { TemplateModule } from '../../types';

export const stormAlert: TemplateModule = {
  manifest: {
    catalogKey: 'social-storm-alert',
    name: 'Storm alert',
    description: 'Urgent severe-weather social card. Three-step "document damage now" checklist.',
    contentType: 'SOCIAL_POST',
    slots: [
      {
        key: 'eyebrow',
        kind: 'text',
        label: 'Alert eyebrow',
        required: false,
        constraints: { maxChars: 32 },
        defaultValue: '⚡ STORM ALERT',
      },
      {
        key: 'headline',
        kind: 'text',
        label: 'Headline',
        required: true,
        constraints: { maxChars: 80 },
        defaultValue: 'Hail in our area? Document damage now.',
      },
      {
        key: 'step1',
        kind: 'text',
        label: 'Step 1',
        required: false,
        constraints: { maxChars: 80 },
        defaultValue: 'Take photos of any visible damage today.',
      },
      {
        key: 'step2',
        kind: 'text',
        label: 'Step 2',
        required: false,
        constraints: { maxChars: 80 },
        defaultValue: 'Note the time + size of hail in writing.',
      },
      {
        key: 'step3',
        kind: 'text',
        label: 'Step 3',
        required: false,
        constraints: { maxChars: 80 },
        defaultValue: 'Call us for a free roof inspection.',
      },
    ],
    sizes: [
      { key: 'instagram-square', width: 1080, height: 1080, purpose: 'instagram-square' },
      { key: 'facebook-feed', width: 1200, height: 1200, purpose: 'facebook-feed' },
    ],
    requiredBrandFields: ['companyName', 'colors.primary'],
    moodTags: ['urgent', 'storm', 'alert', 'social', 'safety', 'dark'],
  },
  render({ slots, brand, size, variant }) {
    const palette = resolvePalette(variant, brand.colors);
    const eyebrow = (slots.text.eyebrow ?? '⚡ STORM ALERT').trim();
    const headline = (slots.text.headline ?? 'Hail in our area? Document damage now.').trim();
    const steps = [
      slots.text.step1?.trim() || 'Take photos of any visible damage today.',
      slots.text.step2?.trim() || 'Note the time + size of hail in writing.',
      slots.text.step3?.trim() || 'Call us for a free roof inspection.',
    ];
    const w = size.width;
    const hh = size.height;
    const dark = mix(palette.text, '#000000', 0.55);

    function step(idx: number, t: string): SatoriNode {
      return h(
        'div',
        {
          key: idx,
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: 18,
            padding: '14px 20px',
            borderRadius: 14,
            backgroundColor: mix(dark, '#ffffff', 0.06),
          },
        },
        h(
          'div',
          {
            style: {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: palette.accent,
              color: palette.accentText,
              fontFamily: brand.typography.display,
              fontWeight: 900,
              fontSize: 24,
            },
          },
          String(idx + 1),
        ),
        h(
          'div',
          { style: { fontSize: 26, color: '#ffffff', fontWeight: 600, lineHeight: 1.3 } },
          t,
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
          backgroundColor: dark,
          color: '#ffffff',
          padding: 64,
          gap: 24,
          fontFamily: brand.typography.body,
        },
      },
      h(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: 12 } },
        logoBadge(brand, palette, 48),
        h(
          'div',
          {
            style: {
              fontSize: 22,
              fontWeight: 700,
              color: '#ffffff',
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
            alignSelf: 'flex-start',
            padding: '8px 16px',
            borderRadius: 999,
            backgroundColor: palette.accent,
            color: palette.accentText,
            fontSize: 22,
            fontWeight: 800,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
          },
        },
        eyebrow,
      ),
      h(
        'div',
        {
          style: {
            fontFamily: brand.typography.display,
            fontWeight: 800,
            fontSize: 64,
            lineHeight: 1.05,
            letterSpacing: '-0.02em',
            maxWidth: '92%',
          },
        },
        headline,
      ),
      h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 } },
        ...steps.map((s, i) => step(i, s)),
      ),
      brand.contact.phone
        ? h(
            'div',
            {
              style: {
                fontSize: 28,
                color: palette.accent,
                fontWeight: 800,
                marginTop: 'auto',
              },
            },
            `Call ${brand.contact.phone}`,
          )
        : null,
    );
  },
};
