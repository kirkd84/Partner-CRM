/**
 * postcard-realtor-co-marketing — co-branded mailer for realtor partner
 * pushes. The realtor's company + agent line up alongside Roof Tech's.
 * 6"x4.25" trim is the USPS standard postcard footprint.
 *
 * Use case: Kirk's reps run joint mailers when a realtor wants to bring
 * "free roof inspection with every showing" to a hit-list neighborhood.
 * The realtor pays half, Roof Tech ships half — both sides sign their
 * own block.
 */

import { h } from '../../h';
import { resolvePalette, mix } from '../../variants';
import { logoBadge, contactFooter } from '../../lib/common';
import type { TemplateModule } from '../../types';

export const realtorCoMarketing: TemplateModule = {
  manifest: {
    catalogKey: 'postcard-realtor-co-marketing',
    name: 'Realtor co-marketing',
    description: 'Co-branded postcard with the realtor partner block alongside Roof Tech.',
    contentType: 'POSTCARD',
    slots: [
      {
        key: 'headline',
        kind: 'text',
        label: 'Headline',
        required: true,
        constraints: { maxChars: 80 },
        defaultValue: 'Buying or selling? Get a free roof report.',
      },
      {
        key: 'realtorName',
        kind: 'text',
        label: 'Realtor name',
        required: true,
        constraints: { maxChars: 40 },
      },
      {
        key: 'realtorCompany',
        kind: 'text',
        label: 'Realtor brokerage',
        required: false,
        constraints: { maxChars: 60 },
      },
      {
        key: 'realtorPhone',
        kind: 'text',
        label: 'Realtor phone',
        required: false,
        constraints: { maxChars: 20 },
      },
      {
        key: 'body',
        kind: 'text',
        label: 'Body copy',
        required: false,
        constraints: { maxChars: 220 },
        defaultValue:
          'Whether you’re listing your home or buying your next one, a current roof report saves surprises at close. Free, neighborhood-only.',
      },
    ],
    sizes: [
      // Standard USPS postcard (6"x4.25") — 1800x1275 at 300dpi.
      { key: 'usps-postcard', width: 1800, height: 1275, dpi: 300, purpose: 'print' },
      // 5x7 oversized — 1500x2100 at 300dpi.
      { key: 'oversized-5x7', width: 2100, height: 1500, dpi: 300, purpose: 'print' },
    ],
    requiredBrandFields: ['companyName', 'colors.primary'],
    moodTags: ['postcard', 'realtor', 'co-marketing', 'partner', 'mailer'],
  },
  render({ slots, brand, size, variant }) {
    const palette = resolvePalette(variant, brand.colors);
    const headline = (slots.text.headline ?? 'Buying or selling? Get a free roof report.').trim();
    const realtorName = (slots.text.realtorName ?? 'Your Realtor').trim();
    const realtorCompany = (slots.text.realtorCompany ?? '').trim();
    const realtorPhone = (slots.text.realtorPhone ?? '').trim();
    const body =
      slots.text.body?.trim() ||
      'Whether you’re listing your home or buying your next one, a current roof report saves surprises at close. Free, neighborhood-only.';
    const w = size.width;
    const hh = size.height;

    return h(
      'div',
      {
        style: {
          display: 'flex',
          width: w,
          height: hh,
          backgroundColor: palette.background,
          color: palette.text,
          fontFamily: brand.typography.body,
        },
      },
      // Left copy block
      h(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            width: '60%',
            padding: '60px 56px',
            gap: 28,
            justifyContent: 'space-between',
          },
        },
        h(
          'div',
          {
            style: {
              fontSize: 18,
              fontWeight: 700,
              color: palette.accent,
              textTransform: 'uppercase',
              letterSpacing: '0.22em',
            },
          },
          'A roof report — on us',
        ),
        h(
          'div',
          {
            style: {
              fontFamily: brand.typography.display,
              fontWeight: 800,
              fontSize: 88,
              lineHeight: 1.0,
              letterSpacing: '-0.025em',
              maxWidth: '95%',
            },
          },
          headline,
        ),
        h(
          'div',
          {
            style: {
              fontSize: 22,
              lineHeight: 1.4,
              color: palette.textMuted,
              maxWidth: '95%',
            },
          },
          body,
        ),
      ),
      // Right co-brand block
      h(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            width: '40%',
            padding: 48,
            backgroundColor: mix(palette.background, palette.accent, 0.1),
            borderLeft: `4px solid ${palette.accent}`,
            justifyContent: 'space-between',
          },
        },
        // Roof Tech panel
        h(
          'div',
          { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
          h(
            'div',
            { style: { display: 'flex', alignItems: 'center', gap: 14 } },
            logoBadge(brand, palette, 60),
            h(
              'div',
              {
                style: {
                  fontFamily: brand.typography.display,
                  fontSize: 28,
                  fontWeight: 800,
                  color: palette.text,
                },
              },
              brand.companyName,
            ),
          ),
          contactFooter(brand, palette, { compact: true }) ?? h('div', null, ''),
        ),
        // Divider
        h('div', {
          style: {
            height: 2,
            backgroundColor: palette.divider,
            marginTop: 24,
            marginBottom: 24,
          },
        }),
        // Realtor panel
        h(
          'div',
          { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
          h(
            'div',
            {
              style: {
                fontSize: 14,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.2em',
                color: palette.textMuted,
              },
            },
            'In partnership with',
          ),
          h(
            'div',
            {
              style: {
                fontFamily: brand.typography.display,
                fontSize: 36,
                fontWeight: 800,
                color: palette.text,
                letterSpacing: '-0.01em',
                lineHeight: 1.1,
              },
            },
            realtorName,
          ),
          realtorCompany
            ? h(
                'div',
                { style: { fontSize: 18, color: palette.textMuted, marginTop: 2 } },
                realtorCompany,
              )
            : null,
          realtorPhone
            ? h(
                'div',
                {
                  style: { fontSize: 20, color: palette.text, fontWeight: 600, marginTop: 6 },
                },
                realtorPhone,
              )
            : null,
        ),
      ),
    );
  },
};
