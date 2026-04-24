/**
 * social/event-teaser — square card with an oversized date stamp,
 * event name, venue, and time. Designed to pair with the EV-10 event
 * integration so any event can be one-tap shared as social copy.
 */

import { h } from '../../h';
import { resolvePalette, mix } from '../../variants';
import { logoBadge, fitText } from '../../lib/common';
import type { TemplateModule } from '../../types';

export const eventTeaser: TemplateModule = {
  manifest: {
    catalogKey: 'social-event-teaser',
    name: 'Event teaser',
    description: 'Big date stamp + event name + venue + time. Built for one-tap event sharing.',
    contentType: 'SOCIAL_POST',
    slots: [
      {
        key: 'eventName',
        kind: 'text',
        label: 'Event name',
        required: true,
        constraints: { maxChars: 64 },
      },
      {
        key: 'dateLine',
        kind: 'text',
        label: 'Date (e.g. APR 24)',
        required: false,
        constraints: { maxChars: 16 },
      },
      {
        key: 'venue',
        kind: 'text',
        label: 'Venue',
        required: false,
        constraints: { maxChars: 80 },
      },
      {
        key: 'timeLine',
        kind: 'text',
        label: 'Time',
        required: false,
        constraints: { maxChars: 32 },
      },
      {
        key: 'cta',
        kind: 'text',
        label: 'CTA',
        required: false,
        constraints: { maxChars: 36 },
      },
    ],
    sizes: [
      { key: 'instagram-square', width: 1080, height: 1080, purpose: 'instagram-square' },
      { key: 'facebook-feed', width: 1200, height: 1200, purpose: 'facebook-feed' },
    ],
    requiredBrandFields: ['companyName', 'colors.primary', 'colors.secondary'],
    moodTags: ['event', 'invite', 'announcement', 'social'],
  },
  render({ slots, brand, size, variant }) {
    const palette = resolvePalette(variant, brand.colors);
    const eventName = (slots.text.eventName ?? 'Suite Night at Coors Field').trim();
    const dateLine = (slots.text.dateLine ?? 'APR 24').trim();
    const venue = (slots.text.venue ?? '').trim();
    const timeLine = (slots.text.timeLine ?? '').trim();
    const cta = (slots.text.cta ?? '').trim();
    const w = size.width;
    const hh = size.height;
    const eventFont = fitText(eventName, w - 200, hh * 0.22, { min: 40, max: 96, maxLines: 3 });

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
          padding: 64,
          gap: 36,
        },
      },
      // Top row: brand + chip
      h(
        'div',
        {
          style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
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
                fontFamily: brand.typography.display,
                fontWeight: 700,
                fontSize: 24,
                color: palette.text,
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
              padding: '6px 14px',
              borderRadius: 999,
              backgroundColor: mix(palette.accent, palette.background, 0.85),
              color: palette.accent,
              fontWeight: 700,
              fontSize: 16,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
            },
          },
          'You\u2019re invited',
        ),
      ),
      // Big date stamp
      h(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            alignSelf: 'flex-start',
            paddingLeft: 24,
            paddingRight: 24,
            paddingTop: 18,
            paddingBottom: 18,
            backgroundColor: palette.accent,
            color: palette.accentText,
            borderRadius: 18,
            minWidth: 240,
            alignItems: 'center',
          },
        },
        h(
          'div',
          {
            style: {
              fontFamily: brand.typography.display,
              fontSize: 84,
              fontWeight: 800,
              lineHeight: 0.95,
              letterSpacing: '-0.04em',
            },
          },
          dateLine,
        ),
        timeLine
          ? h(
              'div',
              {
                style: {
                  marginTop: 6,
                  fontSize: 22,
                  color: mix(palette.accentText, palette.accent, 0.2),
                },
              },
              timeLine,
            )
          : null,
      ),
      // Event title
      h(
        'div',
        {
          style: {
            fontFamily: brand.typography.display,
            fontSize: eventFont,
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: '-0.025em',
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
                fontSize: 26,
                color: palette.textMuted,
                fontFamily: brand.typography.body,
              },
            },
            venue,
          )
        : null,
      cta
        ? h(
            'div',
            {
              style: {
                display: 'flex',
                alignSelf: 'flex-start',
                marginTop: 'auto',
                padding: '14px 26px',
                borderRadius: 999,
                backgroundColor: palette.text,
                color: palette.background,
                fontSize: 22,
                fontWeight: 700,
              },
            },
            cta,
          )
        : null,
    );
  },
};
