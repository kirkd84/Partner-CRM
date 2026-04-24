/**
 * event-invitation — print-friendly event invite flyer with the date
 * stamp, event name, venue + time row, and an optional "What to expect"
 * bullet list. Pairs cleanly with the EV-10 event-to-design flow.
 */

import { h } from '../../h';
import { resolvePalette, mix } from '../../variants';
import { companyHeader, contactFooter, fitText } from '../../lib/common';
import type { TemplateModule } from '../../types';

export const eventInvitation: TemplateModule = {
  manifest: {
    catalogKey: 'flyer-event-invitation',
    name: 'Event invitation',
    description: 'Letter-size invite — date stamp, event name, venue/time, optional bullets.',
    contentType: 'FLYER',
    slots: [
      {
        key: 'eventName',
        kind: 'text',
        label: 'Event name',
        required: true,
        constraints: { maxChars: 80 },
      },
      {
        key: 'dateLine',
        kind: 'text',
        label: 'Date (e.g. APR 24)',
        required: false,
        constraints: { maxChars: 16 },
      },
      {
        key: 'timeLine',
        kind: 'text',
        label: 'Time',
        required: false,
        constraints: { maxChars: 32 },
      },
      {
        key: 'venue',
        kind: 'text',
        label: 'Venue',
        required: false,
        constraints: { maxChars: 100 },
      },
      {
        key: 'bullets',
        kind: 'text',
        label: 'What to expect (| separated)',
        required: false,
        constraints: { maxChars: 280 },
      },
      {
        key: 'cta',
        kind: 'text',
        label: 'CTA',
        required: false,
        constraints: { maxChars: 48 },
      },
    ],
    sizes: [
      { key: 'letter', width: 1275, height: 1650, dpi: 150, purpose: 'print' },
      { key: 'half-letter', width: 1050, height: 1350, dpi: 150, purpose: 'print' },
    ],
    requiredBrandFields: ['companyName', 'colors.primary', 'colors.secondary'],
    moodTags: ['event', 'invite', 'announcement', 'celebration', 'professional'],
  },
  render({ slots, brand, size, variant }) {
    const palette = resolvePalette(variant, brand.colors);
    const eventName = (slots.text.eventName ?? 'Suite Night at Coors Field').trim();
    const dateLine = (slots.text.dateLine ?? 'APR 24').trim();
    const timeLine = (slots.text.timeLine ?? '').trim();
    const venue = (slots.text.venue ?? '').trim();
    const bullets = (slots.text.bullets ?? '')
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 5);
    const cta = (slots.text.cta ?? '').trim();
    const w = size.width;
    const hh = size.height;
    const titleFont = fitText(eventName, w - 200, hh * 0.18, { min: 48, max: 110, maxLines: 3 });

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
            padding: `${Math.round(hh * 0.03)}px ${Math.round(w * 0.045)}px`,
            backgroundColor: palette.surface,
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: `2px solid ${palette.accent}`,
          },
        },
        companyHeader(brand, palette, { size: 50 }),
        h(
          'div',
          {
            style: {
              display: 'flex',
              padding: '8px 16px',
              borderRadius: 999,
              backgroundColor: palette.accent,
              color: palette.accentText,
              fontWeight: 700,
              fontSize: 16,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
            },
          },
          'You\u2019re Invited',
        ),
      ),
      // Body
      h(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            padding: `${Math.round(hh * 0.05)}px ${Math.round(w * 0.06)}px`,
            gap: 32,
          },
        },
        // Date stamp + event name row
        h(
          'div',
          { style: { display: 'flex', gap: 32, alignItems: 'flex-start' } },
          h(
            'div',
            {
              style: {
                display: 'flex',
                flexDirection: 'column',
                padding: '16px 24px',
                backgroundColor: palette.text,
                color: palette.background,
                borderRadius: 14,
                alignItems: 'center',
                minWidth: 200,
              },
            },
            h(
              'div',
              {
                style: {
                  fontFamily: brand.typography.display,
                  fontSize: 84,
                  fontWeight: 800,
                  letterSpacing: '-0.04em',
                  lineHeight: 0.95,
                },
              },
              dateLine,
            ),
            timeLine
              ? h(
                  'div',
                  {
                    style: {
                      fontSize: 18,
                      marginTop: 4,
                      color: mix(palette.background, palette.text, 0.25),
                    },
                  },
                  timeLine,
                )
              : null,
          ),
          h(
            'div',
            {
              style: {
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                gap: 10,
                paddingTop: 6,
              },
            },
            h(
              'div',
              {
                style: {
                  fontFamily: brand.typography.display,
                  fontSize: titleFont,
                  fontWeight: 800,
                  lineHeight: 1.05,
                  letterSpacing: '-0.02em',
                  color: palette.text,
                },
              },
              eventName,
            ),
            venue
              ? h(
                  'div',
                  {
                    style: {
                      fontSize: 24,
                      color: palette.textMuted,
                    },
                  },
                  venue,
                )
              : null,
          ),
        ),
        // Bullets
        bullets.length > 0
          ? h(
              'div',
              {
                style: {
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  paddingLeft: 4,
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
                    letterSpacing: '0.18em',
                  },
                },
                'What to expect',
              ),
              ...bullets.map((b, i) =>
                h(
                  'div',
                  {
                    key: i,
                    style: {
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 12,
                      fontSize: 22,
                    },
                  },
                  h('div', {
                    style: {
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: palette.accent,
                      marginTop: 12,
                    },
                  }),
                  h('div', { style: { display: 'flex', flex: 1 } }, b),
                ),
              ),
            )
          : null,
        cta
          ? h(
              'div',
              {
                style: {
                  display: 'flex',
                  alignSelf: 'flex-start',
                  padding: '14px 28px',
                  borderRadius: 12,
                  backgroundColor: palette.accent,
                  color: palette.accentText,
                  fontSize: 22,
                  fontWeight: 700,
                  marginTop: 'auto',
                },
              },
              cta,
            )
          : null,
      ),
      // Footer
      h(
        'div',
        {
          style: {
            display: 'flex',
            padding: `${Math.round(hh * 0.025)}px ${Math.round(w * 0.045)}px`,
            backgroundColor: palette.surface,
            borderTop: `1px solid ${palette.divider}`,
          },
        },
        contactFooter(brand, palette, { compact: true }) ?? h('div', null, ''),
      ),
    );
  },
};
