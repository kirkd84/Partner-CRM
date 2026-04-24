/**
 * Server-only entry for the renderer. Consumers that need to render a
 * design (PNG route, server actions that call generateDesignFull) must
 * import from `@partnerradar/marketing-engine/render` — NOT from the
 * main barrel.
 *
 * Why: the renderer pulls in `satori` + `@resvg/resvg-js`, which ships a
 * platform-specific `.node` binary. Keeping these off the default entry
 * prevents webpack from walking into them when client components import
 * types/utilities from `@partnerradar/marketing-engine` (BrandSetupForm
 * was the canary — pulling in the engine's main barrel dragged the
 * native binary into the client bundle).
 */

export { renderDesign, type RenderDesignInput, type RenderedDesign } from './pipeline/render';
export { generateDesignFull, type GenerateArgs, type GenerateResult } from './pipeline/generate';
