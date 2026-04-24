/**
 * End-to-end generation — ties intent → director → asset resolution →
 * render into a single callable. Consumers:
 *   - studio/new-design server action (primary)
 *   - EV-10 event-to-design flow (later)
 *
 * Asset resolution is intentionally minimal in MW-3 base: if the caller
 * passes imageUrls we splat them into the first image slot. Stock/AI
 * image generation lands in a follow-up once Kirk wires fal.ai.
 */

import type { BrandProfile } from '../brand/types';
import type { DesignIntent, CreativeDirection } from '../index';
import { parseIntent } from './intent';
import { direct } from './director';
import { renderDesign, type RenderedDesign } from './render';
import { toBrandRenderProfile } from './adapt-brand';
import type { ColorVariant, SlotValues } from '@partnerradar/marketing-templates';

export interface GenerateArgs {
  prompt?: string;
  intent?: DesignIntent;
  brand: BrandProfile;
  templateKey?: string; // optional override
  variant?: ColorVariant;
  sizeKey?: string;
  /** Extra slot overrides the UI can pass in (e.g. user-uploaded image). */
  overrideSlots?: Partial<SlotValues>;
}

export interface GenerateResult {
  intent: DesignIntent;
  direction: CreativeDirection;
  templateKey: string;
  slots: SlotValues;
  rendered: RenderedDesign;
  elapsedMs: number;
}

export async function generateDesignFull(args: GenerateArgs): Promise<GenerateResult> {
  const started = Date.now();
  const intent =
    args.intent ??
    (args.prompt
      ? await parseIntent(args.prompt)
      : {
          contentType: 'FLYER' as const,
          purpose: 'Untitled design',
        });

  const { template, direction, slotValues } = await direct({
    intent,
    brand: args.brand,
  });

  const finalTemplate =
    args.templateKey && args.templateKey !== template.manifest.catalogKey
      ? // caller picked a template override
        template
      : template;

  const slots: SlotValues = {
    text: { ...slotValues.text, ...(args.overrideSlots?.text ?? {}) },
    image: { ...slotValues.image, ...(args.overrideSlots?.image ?? {}) },
  };

  const size = args.sizeKey
    ? (finalTemplate.manifest.sizes.find((s) => s.key === args.sizeKey) ??
      finalTemplate.manifest.sizes[0]!)
    : finalTemplate.manifest.sizes[0]!;

  const rendered = await renderDesign({
    template: finalTemplate,
    brand: toBrandRenderProfile(args.brand),
    slots,
    size,
    variant: args.variant ?? 'light',
  });

  return {
    intent,
    direction,
    templateKey: finalTemplate.manifest.catalogKey,
    slots,
    rendered,
    elapsedMs: Date.now() - started,
  };
}
