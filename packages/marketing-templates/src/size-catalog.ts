/**
 * MW-5: shared platform-size catalog. Any template can be rendered at
 * any of these dimensions; the template's percentage layouts handle
 * the resize. We expose this catalog so the Studio UI can offer the
 * full set as an "Export sizes" picker without each template having
 * to enumerate every size in its manifest.
 *
 * For sizes that don't fit a template's layout cleanly (e.g. a
 * horizontal flyer at 1080×1920 IG-Story), the template still renders
 * — it just won't look optimal. The user picks responsibly; we keep
 * the system permissive rather than refusing to render.
 */

import type { TemplateSize, ContentType } from './types';

export interface PlatformSize extends TemplateSize {
  group: 'social' | 'print' | 'business-card' | 'email' | 'web';
  label: string;
  description: string;
  /** Content types this size is most useful for, used by the UI to highlight. */
  bestFor: ContentType[];
}

export const PLATFORM_SIZES: PlatformSize[] = [
  // Social — square + landscape feed
  {
    key: 'instagram-square',
    label: 'Instagram square',
    description: '1:1 feed post',
    width: 1080,
    height: 1080,
    purpose: 'instagram-square',
    group: 'social',
    bestFor: ['SOCIAL_POST'],
  },
  {
    key: 'facebook-feed',
    label: 'Facebook feed',
    description: 'Square feed post',
    width: 1200,
    height: 1200,
    purpose: 'facebook-feed',
    group: 'social',
    bestFor: ['SOCIAL_POST'],
  },
  {
    key: 'linkedin-feed',
    label: 'LinkedIn feed',
    description: '1.91:1 landscape',
    width: 1200,
    height: 627,
    group: 'social',
    bestFor: ['SOCIAL_POST', 'EMAIL_HEADER'],
  },
  {
    key: 'twitter-card',
    label: 'X / Twitter card',
    description: '1.78:1 landscape',
    width: 1200,
    height: 675,
    group: 'social',
    bestFor: ['SOCIAL_POST', 'EMAIL_HEADER'],
  },
  // Stories / vertical
  {
    key: 'instagram-story',
    label: 'Instagram Story',
    description: '9:16 vertical',
    width: 1080,
    height: 1920,
    purpose: 'ig-story',
    group: 'social',
    bestFor: ['SOCIAL_STORY', 'SOCIAL_POST'],
  },
  // Print — flyers
  {
    key: 'letter',
    label: 'US Letter',
    description: '8.5×11" @ 150 DPI',
    width: 1275,
    height: 1650,
    dpi: 150,
    purpose: 'print',
    group: 'print',
    bestFor: ['FLYER'],
  },
  {
    key: 'half-letter',
    label: 'Half letter',
    description: '5.5×8.5" @ 150 DPI',
    width: 1050,
    height: 1350,
    dpi: 150,
    purpose: 'print',
    group: 'print',
    bestFor: ['FLYER', 'POSTCARD'],
  },
  {
    key: 'a4',
    label: 'A4',
    description: '210×297mm @ 150 DPI',
    width: 1240,
    height: 1754,
    dpi: 150,
    purpose: 'print',
    group: 'print',
    bestFor: ['FLYER'],
  },
  // Business cards
  {
    key: 'us-300dpi',
    label: 'BC horizontal',
    description: '3.5×2" @ 300 DPI + bleed',
    width: 1125,
    height: 675,
    dpi: 300,
    purpose: 'business-card',
    group: 'business-card',
    bestFor: ['BUSINESS_CARD'],
  },
  {
    key: 'us-vertical-300dpi',
    label: 'BC vertical',
    description: '2×3.5" @ 300 DPI + bleed',
    width: 675,
    height: 1125,
    dpi: 300,
    purpose: 'business-card',
    group: 'business-card',
    bestFor: ['BUSINESS_CARD'],
  },
  // Email
  {
    key: 'email-header',
    label: 'Email header',
    description: '600×200 banner',
    width: 600,
    height: 200,
    purpose: 'email-header',
    group: 'email',
    bestFor: ['EMAIL_HEADER'],
  },
];

export const SIZES_BY_GROUP = {
  social: PLATFORM_SIZES.filter((s) => s.group === 'social'),
  print: PLATFORM_SIZES.filter((s) => s.group === 'print'),
  'business-card': PLATFORM_SIZES.filter((s) => s.group === 'business-card'),
  email: PLATFORM_SIZES.filter((s) => s.group === 'email'),
  web: PLATFORM_SIZES.filter((s) => s.group === 'web'),
};

export function getPlatformSize(key: string): PlatformSize | undefined {
  return PLATFORM_SIZES.find((s) => s.key === key);
}

export function sizesForContentType(t: ContentType): PlatformSize[] {
  return PLATFORM_SIZES.filter((s) => s.bestFor.includes(t));
}
