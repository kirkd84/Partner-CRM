/**
 * Shared types for template modules. Each template registers a manifest
 * and a render() function that takes resolved slots + brand + variant
 * and returns a Satori-compatible node tree.
 *
 * BrandProfile is imported structurally (not by value) so this package
 * has no runtime dep on @partnerradar/marketing-engine.
 */

import type { SatoriNode } from './h';
import type { ColorVariant } from './variants';

export type ContentType =
  | 'FLYER'
  | 'SOCIAL_POST'
  | 'SOCIAL_STORY'
  | 'BROCHURE'
  | 'BUSINESS_CARD'
  | 'EMAIL_HEADER'
  | 'POSTCARD';

export interface TemplateSlot {
  key: string;
  kind: 'text' | 'image' | 'color';
  label: string;
  required: boolean;
  defaultValue?: string;
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
  purpose?:
    | 'print'
    | 'facebook-feed'
    | 'instagram-square'
    | 'ig-story'
    | 'email-header'
    | 'business-card';
}

export interface TemplateManifest {
  catalogKey: string;
  name: string;
  description: string;
  contentType: ContentType;
  slots: TemplateSlot[];
  sizes: TemplateSize[];
  requiredBrandFields: string[];
  /** Short moodboard words used by the director to match intent → template. */
  moodTags: string[];
}

/**
 * Minimal subset of BrandProfile the templates actually read. Keeps
 * @partnerradar/marketing-templates decoupled from the engine — the
 * renderer just maps the full profile to this shape before calling.
 */
export interface BrandRenderProfile {
  companyName: string;
  tagline?: string;
  contact: {
    phone?: string;
    email?: string;
    website?: string;
    physicalAddress?: string;
  };
  colors: {
    primaryHex: string;
    secondaryHex: string;
    accentHex?: string;
  };
  typography: {
    display: string;
    body: string;
  };
  logoDataUrl?: string; // optional base64 data URL (svg/png) fetched upstream
}

export interface SlotValues {
  text: Record<string, string>;
  image: Record<string, string>; // data URL or http(s) URL
}

export interface TemplateRenderInput {
  slots: SlotValues;
  brand: BrandRenderProfile;
  size: TemplateSize;
  variant: ColorVariant;
}

export type TemplateRender = (input: TemplateRenderInput) => SatoriNode;

export interface TemplateModule {
  manifest: TemplateManifest;
  render: TemplateRender;
}
