/**
 * Tenant configuration — single source of truth for all customer-specific
 * branding, identity, and defaults.
 *
 * Swapping PartnerRadar from one company to another (e.g., when sold as a
 * Storm Cloud add-on to another roofing/restoration company) is a one-file
 * change — only this file and the logo asset need to change.
 *
 * See SPEC.md §10 Amendment A002.
 */

export interface TenantConfig {
  /** Tenant short id — used in URLs, asset paths, bundle IDs */
  id: string;

  /** Display brand name shown in headers, emails, and push notifications */
  brandName: string;

  /** Full legal name for CAN-SPAM footers, terms pages, invoices */
  legalName: string;

  /** Mailing address (CAN-SPAM §7.5 requires this on every email) */
  physicalAddress: string;

  /** Main public phone number, E.164-ish formatted for display */
  mainPhone: string;

  /** Outbound email from-address for transactional Resend sends */
  fromAddress: string;

  /** Reply-to email for transactional sends (can equal fromAddress) */
  replyToAddress: string;

  /** Company public website */
  websiteUrl: string;

  /** Mobile app bundle identifier reservation */
  mobileBundleId: string;

  /** What lines of business the company operates in — used for dashboard copy */
  services: readonly string[];

  /** Default seed markets created on first migrate */
  seedMarkets: readonly {
    name: string;
    timezone: string;
    defaultCenter: { lat: number; lng: number };
    scrapeRadiusMi: number;
    isPrimary: boolean;
  }[];
}

/** Roof Technologies, LLC — PartnerRadar's first customer. */
export const ROOF_TECHNOLOGIES: TenantConfig = {
  id: 'roof-technologies',
  brandName: 'Partner Portal',
  legalName: 'Roof Technologies, LLC',
  physicalAddress: '4955 Miller St. Suite 202, Wheat Ridge, CO 80033',
  mainPhone: '(855) 766-3001',
  fromAddress: 'PartnerRadar <info@RoofTechnologies.com>',
  replyToAddress: 'info@RoofTechnologies.com',
  websiteUrl: 'https://rooftechnologies.com',
  mobileBundleId: 'com.rooftechnologies.partnerradar',
  services: ['Roofing', 'Solar', 'Gutters'],
  seedMarkets: [
    {
      name: 'Denver, CO',
      timezone: 'America/Denver',
      defaultCenter: { lat: 39.7673, lng: -105.0828 }, // Wheat Ridge HQ
      scrapeRadiusMi: 30,
      isPrimary: true,
    },
    {
      name: 'Colorado Springs, CO',
      timezone: 'America/Denver',
      defaultCenter: { lat: 38.8339, lng: -104.8214 },
      scrapeRadiusMi: 25,
      isPrimary: false,
    },
  ],
};

/**
 * Resolved tenant for this deployment. Chosen by the `NEXT_PUBLIC_TENANT`
 * env var (defaults to Roof Technologies).
 *
 * When PartnerRadar is white-labeled for a new customer, add a new
 * TenantConfig constant and add a branch here. Nothing else in the codebase
 * should read brand strings directly — always go through `tenant()`.
 */
export function tenant(): TenantConfig {
  const id =
    process.env.NEXT_PUBLIC_TENANT ?? process.env.EXPO_PUBLIC_TENANT ?? 'roof-technologies';
  switch (id) {
    case 'roof-technologies':
      return ROOF_TECHNOLOGIES;
    default:
      // Future tenants land here.
      return ROOF_TECHNOLOGIES;
  }
}
