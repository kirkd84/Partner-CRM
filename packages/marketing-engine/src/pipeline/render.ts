/**
 * Layer 4: Template rendering. Satori converts our Satori-compatible
 * node tree into SVG; @resvg/resvg-js rasterizes to PNG.
 *
 * Fonts: we fetch Inter from jsdelivr on first render and cache in
 * process memory. This avoids bundling font binaries and keeps cold
 * starts light.
 *
 * Everything is server-side only; the renderer never runs in the
 * browser.
 */

import type {
  TemplateModule,
  TemplateSize,
  BrandRenderProfile,
  SlotValues,
  ColorVariant,
} from '@partnerradar/marketing-templates';
import { mergeSlotsText, type MergeContext } from './merge-tokens';

let fontCache: Array<{ name: string; data: ArrayBuffer; weight: number; style: 'normal' }> | null =
  null;

async function loadFonts() {
  if (fontCache) return fontCache;
  const urls: Array<{ url: string; weight: number }> = [
    {
      url: 'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.ttf',
      weight: 400,
    },
    {
      url: 'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-600-normal.ttf',
      weight: 600,
    },
    {
      url: 'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-700-normal.ttf',
      weight: 700,
    },
    {
      url: 'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-800-normal.ttf',
      weight: 800,
    },
  ];
  const loaded = await Promise.all(
    urls.map(async ({ url, weight }) => {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`font fetch ${r.status}`);
      return { name: 'Inter', data: await r.arrayBuffer(), weight, style: 'normal' as const };
    }),
  );
  fontCache = loaded;
  return loaded;
}

export interface RenderDesignInput {
  template: TemplateModule;
  brand: BrandRenderProfile;
  slots: SlotValues;
  size?: TemplateSize;
  variant?: ColorVariant;
  /** MW-6: mail-merge context applied to text slots before render. */
  merge?: MergeContext;
}

export interface RenderedDesign {
  svg: string;
  png: Uint8Array;
  width: number;
  height: number;
  variant: ColorVariant;
  sizeKey: string;
}

export async function renderDesign(input: RenderDesignInput): Promise<RenderedDesign> {
  const { template, brand, slots } = input;
  const size = input.size ?? template.manifest.sizes[0]!;
  const variant = input.variant ?? 'light';
  // Apply mail-merge tokens just before handing slots to the template
  // so every template benefits without each one re-implementing it.
  const mergedSlots: SlotValues = input.merge
    ? { text: mergeSlotsText(slots.text, input.merge), image: { ...slots.image } }
    : slots;
  const tree = template.render({ slots: mergedSlots, brand, size, variant });

  let satoriFn: (node: unknown, opts: unknown) => Promise<string>;
  try {
    const mod = await import('satori');
    satoriFn =
      (mod as unknown as { default: typeof satoriFn }).default ??
      (mod as unknown as { satori: typeof satoriFn }).satori;
  } catch (err) {
    throw new Error(
      'satori is not installed — run pnpm install in packages/marketing-engine. ' +
        String((err as Error).message ?? err),
    );
  }

  const fonts = await loadFonts();
  const svg = await satoriFn(tree, {
    width: size.width,
    height: size.height,
    fonts,
  });

  let Resvg: new (svg: string, opts: unknown) => { render: () => { asPng: () => Uint8Array } };
  try {
    const mod = await import('@resvg/resvg-js');
    Resvg = (mod as unknown as { Resvg: typeof Resvg }).Resvg;
  } catch (err) {
    throw new Error(
      '@resvg/resvg-js is not installed — run pnpm install in packages/marketing-engine. ' +
        String((err as Error).message ?? err),
    );
  }
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: size.width } });
  const png = resvg.render().asPng();

  return { svg, png, width: size.width, height: size.height, variant, sizeKey: size.key };
}
