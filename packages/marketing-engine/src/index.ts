/**
 * @partnerradar/marketing-engine
 *
 * Core generation pipeline for Marketing Wizard (MW-3 and up).
 *
 * Layers per SPEC_MARKETING §4:
 *   1. Intent capture       — pipeline/intent.ts (Claude Sonnet 4.6 / rules)
 *   2. Creative direction   — pipeline/director.ts (Claude Opus 4.7 / rules)
 *   3. Asset resolution     — (MW-3 follow-up: stock + AI gen)
 *   4. Template rendering   — pipeline/render.ts (Satori + @resvg/resvg-js)
 *   5. Refinement loop      — MW-4
 *   6. Export pipeline      — MW-5 (multi-channel) + MW-3 print PDF
 *
 * Model routing lives in models/router.ts. Every leg has a graceful
 * fallback so the pipeline runs end-to-end even before API keys are
 * configured — Kirk sees real output immediately, quality climbs as
 * providers come online.
 */

export type DesignIntent = {
  contentType: 'FLYER' | 'SOCIAL_POST' | 'BROCHURE' | 'BUSINESS_CARD' | 'EMAIL_HEADER';
  purpose: string;
  tone?: 'warm' | 'formal' | 'urgent' | 'celebratory';
  audience?: string;
  assets?: Array<{
    kind: 'user-upload' | 'stock-search' | 'generate' | 'brand-asset';
    ref: string;
  }>;
};

export type CreativeDirection = {
  templateKey: string;
  copy: {
    headline: string;
    subhead?: string;
    cta?: string;
    body?: string;
  };
  colorStrategy: 'primary-hero' | 'secondary-accent' | 'mono-elegant';
  imageStrategy: 'full-bleed' | 'split' | 'inset' | 'none';
  reasoning: string;
};

// MW-2: Brand training surface.
export * from './brand/types';
export { extractBrandProfile, type ExtractBrandInput, type ExtractResult } from './brand/extract';

// MW-3: generation pipeline.
//
// IMPORTANT: renderDesign + generateDesignFull are exported from the
// `@partnerradar/marketing-engine/render` subpath, NOT here. They pull
// in `satori` + `@resvg/resvg-js` (native `.node` binary) which must
// never end up in a client bundle. Client components that need types
// or non-render utilities should import from the main barrel; server
// routes / actions that need to actually render a PNG import from the
// /render subpath.
export { parseIntent, parseViaRules } from './pipeline/intent';
export { direct, directViaRules, type DirectorOutput } from './pipeline/director';
export { toBrandRenderProfile } from './pipeline/adapt-brand';
export {
  mergeTokens,
  mergeSlotsText,
  AVAILABLE_TOKENS,
  type MergeContext,
} from './pipeline/merge-tokens';
export {
  routeDirector,
  routeIntentParse,
  routeImageGen,
  checkAvailability,
  type QualityTier,
  type LLMRoute,
  type ImageGenRoute,
} from './models/router';

/** Legacy shim kept for any old callers — use generateDesignFull. */
export async function generateDesign(
  _intent: DesignIntent,
): Promise<{ status: 'not_implemented'; message: string }> {
  return {
    status: 'not_implemented',
    message: 'Use generateDesignFull() from MW-3 onward.',
  };
}
