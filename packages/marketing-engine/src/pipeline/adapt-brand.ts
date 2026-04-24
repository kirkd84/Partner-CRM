/**
 * Adapt the full BrandProfile to the lean BrandRenderProfile the
 * templates consume. Templates stay decoupled from profile evolution;
 * only this adapter needs to change when we extend the profile.
 */

import type { BrandProfile } from '../brand/types';
import type { BrandRenderProfile } from '@partnerradar/marketing-templates';

export function toBrandRenderProfile(profile: BrandProfile): BrandRenderProfile {
  return {
    companyName: profile.companyName,
    ...(profile.tagline ? { tagline: profile.tagline } : {}),
    contact: {
      ...(profile.contact.phone ? { phone: profile.contact.phone } : {}),
      ...(profile.contact.email ? { email: profile.contact.email } : {}),
      ...(profile.contact.website ? { website: profile.contact.website } : {}),
      ...(profile.contact.physicalAddress
        ? { physicalAddress: profile.contact.physicalAddress }
        : {}),
    },
    colors: {
      primaryHex: profile.colors.primary.hex,
      secondaryHex: profile.colors.secondary.hex,
      ...(profile.colors.accents[0]?.hex ? { accentHex: profile.colors.accents[0].hex } : {}),
    },
    typography: {
      display: profile.typography.display.family,
      body: profile.typography.body.family,
    },
  };
}
