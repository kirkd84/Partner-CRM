/**
 * flyer-financing-options — pitches "$0 down / N% APR / N-month terms"
 * with a monthly-payment hero. Three-column terms breakdown plus a
 * disclosure footer (financing flyers always need one).
 */

import { h, type SatoriNode } from '../../h';
import { resolvePalette, mix } from '../../variants';
import { companyHeader, contactFooter } from '../../lib/common';
import type { TemplateModule } from '../../types';

export const financingOptions: TemplateModule = {
  manifest: {
    catalogKey: 'flyer-financing-options',
    name: 'Financing options',
    description:
      'Monthly-payment hero + three-column terms breakdown. Includes a disclosure footer area.',
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
        key: 'monthlyPayment',
        kind: 'text',
        label: 'Monthly payment hero (e.g. $99/mo*)',
        required: true,
        constraints: { maxChars: 18 },
      },
      {
        key: 'down',
        kind: 'text',
        label: 'Down payment',
        required: false,
        constraints: { maxChars: 18 },
        defaultValue: '$0 down',
      },
      {
        key: 'apr',
        kind: 'text',
        label: 'APR',
        required: false,
        constraints: { maxChars: 18 },
        defaultValue: '0% APR',
      },
      {
        key: 'term',
        kind: 'text',
        label: 'Term length',
        required: false,
        constraints: { maxChars: 24 },
        defaultValue: '18 months',
      },
      {
        key: 'disclosure',
        kind: 'text',
        label: 'Required legal disclosure',
        required: false,
        constraints: { maxChars: 360 },
      },
    ],
    sizes: [
      { key: 'letter', width: 1275, height: 1650, dpi: 150, purpose: 'print' },
      { key: 'half-letter', width: 1050, height: 1350, dpi: 150, purpose: 'print' },
    ],
    requiredBrandFields: ['companyName', 'colors.primary'],
    moodTags: ['financing', 'offer', 'modern', 'announcement', 'professional'],
  },
  render({ slots, brand, size, variant }) {
    const palette = resolvePalette(variant, brand.colors);
    const headline = (slots.text.headline ?? 'Roof now, pay smarter.').trim();
    const monthly = (slots.text.monthlyPayment ?? '$99/mo*').trim();
    const down = (slots.text.down ?? '$0 down').trim();
    const apr = (slots.text.apr ?? '0% APR').trim();
    const term = (slots.text.term ?? '18 months').trim();
    const disclosure =
      slots.text.disclosure?.trim() ||
      'Subject to credit approval. APR varies. *Estimated payment based on a $9,500 financed amount over 18 months. Ask for full terms.';
    const w = size.width;
    const hh = size.height;

    function termCell(label: string, value: string): SatoriNode {
      return h(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            padding: '24px 20px',
            gap: 6,
            borderRight: `1px solid ${palette.divider}`,
          },
        },
        h(
          'div',
          {
            style: {
              fontSize: 16,
              textTransform: 'uppercase',
              letterSpacing: '0.16em',
              fontWeight: 700,
              color: palette.textMuted,
            },
          },
          label,
        ),
        h(
          'div',
          {
            style: {
              fontSize: 46,
              fontFamily: brand.typography.display,
              fontWeight: 800,
              color: palette.text,
              letterSpacing: '-0.02em',
            },
          },
          value,
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
            borderBottom: `1px solid ${palette.divider}`,
          },
        },
        companyHeader(brand, palette, { size: 56 }),
      ),
      // Hero monthly payment
      h(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            padding: `${Math.round(hh * 0.05)}px ${Math.round(w * 0.05)}px`,
            gap: 24,
            alignItems: 'flex-start',
          },
        },
        h(
          'div',
          {
            style: {
              fontFamily: brand.typography.display,
              fontWeight: 800,
              fontSize: 84,
              lineHeight: 1.0,
              letterSpacing: '-0.025em',
              maxWidth: '90%',
            },
          },
          headline,
        ),
        h(
          'div',
          {
            style: {
              display: 'flex',
              alignItems: 'baseline',
              gap: 18,
              padding: '24px 36px',
              borderRadius: 24,
              backgroundColor: palette.accent,
              color: palette.accentText,
            },
          },
          h(
            'div',
            {
              style: {
                fontSize: 22,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.18em',
                color: mix(palette.accentText, palette.accent, 0.25),
              },
            },
            'starting at',
          ),
          h(
            'div',
            {
              style: {
                fontFamily: brand.typography.display,
                fontWeight: 900,
                fontSize: 140,
                letterSpacing: '-0.04em',
                lineHeight: 0.95,
              },
            },
            monthly,
          ),
        ),
      ),
      // Terms grid
      h(
        'div',
        {
          style: {
            display: 'flex',
            margin: `0 ${Math.round(w * 0.05)}px`,
            border: `1px solid ${palette.divider}`,
            borderRadius: 16,
            backgroundColor: palette.surface,
          },
        },
        termCell('Down payment', down),
        termCell('APR', apr),
        h(
          'div',
          {
            style: {
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              padding: '24px 20px',
              gap: 6,
            },
          },
          h(
            'div',
            {
              style: {
                fontSize: 16,
                textTransform: 'uppercase',
                letterSpacing: '0.16em',
                fontWeight: 700,
                color: palette.textMuted,
              },
            },
            'Term',
          ),
          h(
            'div',
            {
              style: {
                fontSize: 46,
                fontFamily: brand.typography.display,
                fontWeight: 800,
                color: palette.text,
                letterSpacing: '-0.02em',
              },
            },
            term,
          ),
        ),
      ),
      // Disclosure
      h(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            padding: `${Math.round(hh * 0.04)}px ${Math.round(w * 0.05)}px`,
            gap: 12,
            flex: 1,
          },
        },
        h(
          'div',
          {
            style: {
              fontSize: 12,
              lineHeight: 1.4,
              color: palette.textMuted,
              maxWidth: '95%',
            },
          },
          disclosure,
        ),
      ),
      // Footer
      h(
        'div',
        {
          style: {
            display: 'flex',
            padding: `${Math.round(hh * 0.025)}px ${Math.round(w * 0.05)}px`,
            backgroundColor: palette.surface,
            borderTop: `1px solid ${palette.divider}`,
          },
        },
        contactFooter(brand, palette, { compact: true }) ?? h('div', null, ''),
      ),
    );
  },
};
