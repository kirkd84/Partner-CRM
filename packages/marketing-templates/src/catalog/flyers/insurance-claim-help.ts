/**
 * flyer-insurance-claim-help — three-step process flyer pitching the
 * "we handle the insurance claim for you" angle. Numbered tiles + a
 * carrier-logos placeholder strip at the bottom (we render text labels
 * if no logos are provided; the brand can swap to images later).
 */

import { h, type SatoriNode } from '../../h';
import { resolvePalette, mix } from '../../variants';
import { companyHeader, contactFooter } from '../../lib/common';
import type { TemplateModule } from '../../types';

export const insuranceClaimHelp: TemplateModule = {
  manifest: {
    catalogKey: 'flyer-insurance-claim-help',
    name: 'Insurance claim help',
    description:
      'Three-step "we handle your claim" walkthrough with carrier-logos strip. Pairs with storm season.',
    contentType: 'FLYER',
    slots: [
      {
        key: 'headline',
        kind: 'text',
        label: 'Headline',
        required: true,
        constraints: { maxChars: 80 },
      },
      {
        key: 'step1',
        kind: 'text',
        label: 'Step 1',
        required: false,
        constraints: { maxChars: 100 },
        defaultValue: 'Free inspection — we document the damage with photos.',
      },
      {
        key: 'step2',
        kind: 'text',
        label: 'Step 2',
        required: false,
        constraints: { maxChars: 100 },
        defaultValue: 'We meet your adjuster on-site and present the evidence.',
      },
      {
        key: 'step3',
        kind: 'text',
        label: 'Step 3',
        required: false,
        constraints: { maxChars: 100 },
        defaultValue: 'You pay only your deductible. We handle the paperwork.',
      },
      {
        key: 'carriers',
        kind: 'text',
        label: 'Carriers we work with (comma separated)',
        required: false,
        constraints: { maxChars: 220 },
        defaultValue: 'State Farm · Allstate · USAA · Liberty Mutual · Travelers · Farmers',
      },
    ],
    sizes: [
      { key: 'letter', width: 1275, height: 1650, dpi: 150, purpose: 'print' },
      { key: 'half-letter', width: 1050, height: 1350, dpi: 150, purpose: 'print' },
    ],
    requiredBrandFields: ['companyName', 'colors.primary'],
    moodTags: ['insurance', 'process', 'professional', 'storm', 'claims'],
  },
  render({ slots, brand, size, variant }) {
    const palette = resolvePalette(variant, brand.colors);
    const headline = (
      slots.text.headline ?? 'We handle the insurance claim. You handle your day.'
    ).trim();
    const steps = [
      slots.text.step1?.trim() || 'Free inspection — we document the damage with photos.',
      slots.text.step2?.trim() || 'We meet your adjuster on-site and present the evidence.',
      slots.text.step3?.trim() || 'You pay only your deductible. We handle the paperwork.',
    ];
    const carriers = (slots.text.carriers ?? '').trim();
    const w = size.width;
    const hh = size.height;

    function stepCard(idx: number, text: string): SatoriNode {
      return h(
        'div',
        {
          key: idx,
          style: {
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            padding: '28px 24px',
            backgroundColor: palette.surface,
            border: `1px solid ${palette.divider}`,
            borderRadius: 18,
            gap: 18,
          },
        },
        h(
          'div',
          {
            style: {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: palette.accent,
              color: palette.accentText,
              fontFamily: brand.typography.display,
              fontWeight: 900,
              fontSize: 36,
              letterSpacing: '-0.02em',
            },
          },
          String(idx + 1),
        ),
        h(
          'div',
          {
            style: {
              fontSize: 22,
              lineHeight: 1.4,
              color: palette.text,
              fontWeight: 600,
            },
          },
          text,
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
            padding: `${Math.round(hh * 0.035)}px ${Math.round(w * 0.05)}px`,
            backgroundColor: palette.surface,
            borderBottom: `4px solid ${palette.accent}`,
          },
        },
        companyHeader(brand, palette, { size: 56 }),
      ),
      h(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            padding: `${Math.round(hh * 0.04)}px ${Math.round(w * 0.05)}px`,
            gap: 24,
          },
        },
        h(
          'div',
          {
            style: {
              fontSize: 22,
              fontWeight: 700,
              color: palette.accent,
              textTransform: 'uppercase',
              letterSpacing: '0.18em',
            },
          },
          'How it works',
        ),
        h(
          'div',
          {
            style: {
              fontFamily: brand.typography.display,
              fontWeight: 800,
              fontSize: 76,
              lineHeight: 1.0,
              letterSpacing: '-0.025em',
              maxWidth: '90%',
            },
          },
          headline,
        ),
      ),
      h(
        'div',
        {
          style: {
            display: 'flex',
            padding: `0 ${Math.round(w * 0.05)}px`,
            gap: 18,
            flex: 1,
          },
        },
        ...steps.map((s, i) => stepCard(i, s)),
      ),
      // Carrier strip
      carriers
        ? h(
            'div',
            {
              style: {
                display: 'flex',
                flexDirection: 'column',
                margin: `${Math.round(hh * 0.035)}px ${Math.round(w * 0.05)}px 0`,
                padding: '20px 24px',
                borderRadius: 14,
                backgroundColor: mix(palette.background, palette.accent, 0.06),
                gap: 8,
              },
            },
            h(
              'div',
              {
                style: {
                  fontSize: 14,
                  textTransform: 'uppercase',
                  letterSpacing: '0.2em',
                  fontWeight: 700,
                  color: palette.textMuted,
                },
              },
              'We work directly with',
            ),
            h(
              'div',
              {
                style: {
                  fontSize: 22,
                  fontWeight: 700,
                  color: palette.text,
                  letterSpacing: '-0.005em',
                },
              },
              carriers,
            ),
          )
        : null,
      h(
        'div',
        {
          style: {
            display: 'flex',
            padding: `${Math.round(hh * 0.025)}px ${Math.round(w * 0.05)}px`,
          },
        },
        contactFooter(brand, palette, { compact: true }) ?? h('div', null, ''),
      ),
    );
  },
};
