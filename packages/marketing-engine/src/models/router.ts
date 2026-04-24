/**
 * Model router per SPEC_MARKETING §19. Never hardcode a model — route
 * based on (content type, quality tier, availability). Each leg has a
 * graceful fallback so the pipeline keeps running even when a provider
 * is unreachable or an API key is missing.
 *
 * In MW-3 we only need two routes:
 *   • Director (structured creative direction) → Claude Opus 4.7 → Sonnet 4.6 → rule-based
 *   • Intent parse (natural language → DesignIntent) → Sonnet 4.6 → Haiku → rule-based
 *
 * Image generation / upscaling / bg-removal live in separate routers
 * (image-ops) that MW-3+ populates when Kirk adds those keys.
 */

export type Availability = { anthropic: boolean; fal: boolean; openai: boolean };

export function checkAvailability(): Availability {
  return {
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    fal: Boolean(process.env.FAL_API_KEY),
    openai: Boolean(process.env.OPENAI_API_KEY),
  };
}

export type QualityTier = 'premium' | 'standard' | 'draft';

export type LLMRoute = { provider: 'anthropic'; model: string } | { provider: 'rule-based' };

export function routeDirector(tier: QualityTier): LLMRoute {
  const avail = checkAvailability();
  if (!avail.anthropic) return { provider: 'rule-based' };
  if (tier === 'premium') return { provider: 'anthropic', model: 'claude-opus-4-6' };
  if (tier === 'standard') return { provider: 'anthropic', model: 'claude-sonnet-4-6' };
  return { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' };
}

export function routeIntentParse(): LLMRoute {
  const avail = checkAvailability();
  if (!avail.anthropic) return { provider: 'rule-based' };
  return { provider: 'anthropic', model: 'claude-sonnet-4-6' };
}

export type ImageGenRoute =
  | { provider: 'fal'; model: string }
  | { provider: 'stock' } // fall back to stock search
  | { provider: 'none' }; // pure-layout composition, no hero image

export function routeImageGen(tier: QualityTier): ImageGenRoute {
  const avail = checkAvailability();
  if (avail.fal) {
    if (tier === 'premium') return { provider: 'fal', model: 'fal-ai/flux-pro/v1.1' };
    if (tier === 'standard') return { provider: 'fal', model: 'fal-ai/flux/dev' };
    return { provider: 'fal', model: 'fal-ai/flux/schnell' };
  }
  if (process.env.PEXELS_API_KEY || process.env.UNSPLASH_API_KEY) {
    return { provider: 'stock' };
  }
  return { provider: 'none' };
}
