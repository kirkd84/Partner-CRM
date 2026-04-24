/**
 * @partnerradar/marketing-api
 *
 * tRPC routers + Zod schemas for Marketing Wizard.
 *
 * Extraction contract: this package must never import from
 * `apps/web/*` — only the reverse. When we split to a standalone
 * app/marketing-wizard, this package comes with us untouched.
 *
 * MW-2+ will add:
 *   • brandRouter (createBrand, uploadSample, extractTone, approve)
 *   • designRouter (create, chatRefine, list, archive)
 *   • campaignRouter (create, schedule, send)
 *   • templateRouter (list, filter, custom-template CRUD)
 *
 * For MW-1 we export just the embedded-mode helpers.
 */

export const MARKETING_MODE = (process.env.MARKETING_MODE ?? 'embedded') as
  | 'embedded'
  | 'standalone';

/** True when Marketing Wizard is running inside PartnerRadar. */
export function isEmbedded(): boolean {
  return MARKETING_MODE === 'embedded';
}

/** Reserved for future router aggregation — stays empty until MW-2. */
export const marketingRouters = {};
