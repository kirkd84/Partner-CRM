/**
 * @partnerradar/marketing-templates
 *
 * The template catalog — 35 templates across flyers / social / brochures /
 * business cards ship in MW-3. Each template is a JSX/TSX component
 * with a manifest (slot definitions, supported sizes, required brand
 * fields) and a thumbnail.
 *
 * This package scaffolds the catalog registry so MW-3 can just drop
 * new templates into catalog/*, register them here, and MW-2 brand
 * preview + MW-3 generation pipeline pick them up automatically.
 */

export interface TemplateSlot {
  key: string;
  kind: 'text' | 'image' | 'color';
  label: string;
  required: boolean;
  constraints?: {
    maxChars?: number;
    aspectRatio?: string;
  };
}

export interface TemplateSize {
  key: string;
  width: number;
  height: number;
  dpi?: number;
  purpose?: 'print' | 'facebook-feed' | 'instagram-square' | 'ig-story' | 'email-header';
}

export interface TemplateManifest {
  catalogKey: string;
  name: string;
  contentType:
    | 'FLYER'
    | 'SOCIAL_POST'
    | 'SOCIAL_STORY'
    | 'BROCHURE'
    | 'BUSINESS_CARD'
    | 'EMAIL_HEADER'
    | 'POSTCARD';
  slots: TemplateSlot[];
  sizes: TemplateSize[];
  thumbnailUrl: string;
  requiredBrandFields: string[];
}

/**
 * Registry. MW-3 populates this with real manifests; for now we ship a
 * single empty placeholder so the types stay live.
 */
export const TEMPLATE_REGISTRY: Record<string, TemplateManifest> = {};

export function listTemplates(): TemplateManifest[] {
  return Object.values(TEMPLATE_REGISTRY);
}
