/**
 * @partnerradar/marketing-templates
 *
 * Template catalog — each template is a module that exports a manifest
 * (declarative metadata the director reads) and a render function that
 * takes slots + brand + size + variant and returns a Satori-compatible
 * node tree.
 *
 * MW-3 seeds 6 production templates (3 flyer, 2 social, 1 business
 * card). MW-3 follow-ups will add the remaining 29 per §§4–7.
 *
 * Consumers: marketing-engine renderer, Studio UI (template previews).
 */

export { h, type SatoriNode } from './h';
export {
  resolvePalette,
  type ColorVariant,
  type ResolvedPalette,
  type VariantInputColors,
  luminance,
  readableOn,
  mix,
} from './variants';
export type {
  TemplateManifest,
  TemplateSlot,
  TemplateSize,
  TemplateModule,
  TemplateRender,
  TemplateRenderInput,
  BrandRenderProfile,
  ContentType,
  SlotValues,
} from './types';

import type { TemplateModule, ContentType } from './types';
import { heroPhotoOverlay } from './catalog/flyers/hero-photo-overlay';
import { typographyForward } from './catalog/flyers/typography-forward';
import { splitLayoutPhoto } from './catalog/flyers/split-layout-photo';
import { photoGrid } from './catalog/flyers/photo-grid';
import { beforeAfter } from './catalog/flyers/before-after';
import { testimonialFeatured } from './catalog/flyers/testimonial-featured';
import { promotionalOffer } from './catalog/flyers/promotional-offer';
import { eventInvitation } from './catalog/flyers/event-invitation';
import { quoteCard } from './catalog/social/quote-card';
import { serviceHighlight } from './catalog/social/service-highlight';
import { eventTeaser } from './catalog/social/event-teaser';
import { beforeAfterSquare } from './catalog/social/before-after-square';
import { behindTheScenes } from './catalog/social/behind-the-scenes';
import { statCallout } from './catalog/social/stat-callout';
import { classicHorizontal } from './catalog/business-cards/classic-horizontal';
import { verticalModern } from './catalog/business-cards/vertical-modern';

const modules: TemplateModule[] = [
  heroPhotoOverlay,
  typographyForward,
  splitLayoutPhoto,
  photoGrid,
  beforeAfter,
  testimonialFeatured,
  promotionalOffer,
  eventInvitation,
  quoteCard,
  serviceHighlight,
  eventTeaser,
  beforeAfterSquare,
  behindTheScenes,
  statCallout,
  classicHorizontal,
  verticalModern,
];

export const TEMPLATE_REGISTRY: Record<string, TemplateModule> = Object.fromEntries(
  modules.map((m) => [m.manifest.catalogKey, m]),
);

export function listTemplates(): TemplateModule[] {
  return modules;
}

export function listTemplatesByContentType(type: ContentType): TemplateModule[] {
  return modules.filter((m) => m.manifest.contentType === type);
}

export function getTemplate(catalogKey: string): TemplateModule | undefined {
  return TEMPLATE_REGISTRY[catalogKey];
}
