/**
 * @partnerradar/marketing-engine
 *
 * Core generation pipeline for Marketing Wizard.
 *
 * Layers per SPEC_MARKETING §4:
 *   1. Intent capture       — chat NL → DesignIntent
 *   2. Creative direction   — Claude Opus 4.7 picks template + assets
 *   3. Asset resolution     — stock / upload / AI-generated / brand asset
 *   4. Template rendering   — Satori + @resvg/resvg-js + Playwright
 *   5. Refinement loop      — chat → Sonnet → apply patch → re-render
 *   6. Export pipeline      — print PDF (CMYK, 300dpi, bleed) + PNGs
 *
 * The model router (models/router.ts in MW-3) routes to Claude Opus /
 * Sonnet / Haiku based on (content type, quality tier, plan, cost
 * cap, availability).
 *
 * MW-1: stubs only, so the package ships and is extractable.
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

/** MW-1 stub — real implementation ships in MW-3. */
export async function generateDesign(_intent: DesignIntent): Promise<{
  status: 'not_implemented';
  message: string;
}> {
  return {
    status: 'not_implemented',
    message: 'Marketing engine generation lands in MW-3 — see SPEC_MARKETING.md §4.',
  };
}

// MW-2: Brand training surface.
export * from './brand/types';
export { extractBrandProfile, type ExtractBrandInput, type ExtractResult } from './brand/extract';
