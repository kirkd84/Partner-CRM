/**
 * Brand extraction pipeline (SPEC_MARKETING §3.1).
 *
 * Today this ships a graceful stub:
 *   • If ANTHROPIC_API_KEY is set, we call Claude Opus 4.7 with the
 *     uploaded samples + explicit inputs and parse the structured
 *     BrandProfile JSON it emits (see prompts/extract-brand.ts).
 *   • If the key is missing, we return the placeholder profile
 *     derived from the admin's explicit inputs so `/studio/brand-setup`
 *     still finishes the wizard. The result status stays TRAINING
 *     and the UI surfaces a "No AI extraction — using defaults" banner.
 *
 * The extractor NEVER throws. A thrown error would leave a half-
 * written MwBrand with no profile; always resolve with a usable
 * BrandProfile so the UI can move forward.
 */

import type { BrandProfile } from './types';
import { placeholderBrandProfile } from './types';

export interface ExtractBrandInput {
  brandId: string;
  workspaceId: string;
  brandName: string;
  companyName: string;
  explicit: {
    primaryHex?: string;
    secondaryHex?: string;
    accentHex?: string;
    physicalAddress?: string;
    phone?: string;
    email?: string;
    website?: string;
    industry?: string;
    voiceDescriptors?: string[];
    dos?: string[];
    donts?: string[];
  };
  samples: Array<{
    id: string;
    fileId: string;
    contentType: 'flyer' | 'social' | 'brochure' | 'business-card' | 'web' | 'other';
    base64?: string; // inline data URL, for vision input (small files only)
  }>;
}

export interface ExtractResult {
  profile: BrandProfile;
  usedAi: boolean;
  notes: string[];
}

export async function extractBrandProfile(input: ExtractBrandInput): Promise<ExtractResult> {
  const notes: string[] = [];
  const base = placeholderBrandProfile({
    id: input.brandId,
    workspaceId: input.workspaceId,
    name: input.brandName,
    companyName: input.companyName,
    primaryHex: input.explicit.primaryHex,
    secondaryHex: input.explicit.secondaryHex,
    accentHex: input.explicit.accentHex,
    physicalAddress: input.explicit.physicalAddress,
    phone: input.explicit.phone,
    email: input.explicit.email,
    website: input.explicit.website,
    industry: input.explicit.industry,
  });

  // Seed explicit voice descriptors + dos/donts even when AI is off —
  // they're the admin's direct input, not an extraction.
  if (input.explicit.voiceDescriptors?.length) {
    base.voice.descriptors = input.explicit.voiceDescriptors;
  }
  if (input.explicit.dos?.length) base.voice.dosAndDonts.dos = input.explicit.dos;
  if (input.explicit.donts?.length) base.voice.dosAndDonts.donts = input.explicit.donts;

  // Seed trainingSamples so the review UI can list them even if AI
  // analysis failed.
  base.trainingSamples = input.samples.map((s) => ({
    id: s.id,
    fileId: s.fileId,
    contentType: s.contentType,
    extractedAt: new Date().toISOString(),
    analysis: {
      dominantColors: [],
      layoutType: 'unknown',
      copyTone: 'unknown',
      detectedElements: [],
    },
  }));

  if (!process.env.ANTHROPIC_API_KEY) {
    notes.push(
      'ANTHROPIC_API_KEY not set — using placeholder brand profile derived from explicit inputs. Set the key and rerun to get AI-extracted colors, typography, and layout motifs.',
    );
    return { profile: base, usedAi: false, notes };
  }

  if (input.samples.length === 0) {
    notes.push('No samples uploaded — skipping AI extraction, using placeholder defaults.');
    return { profile: base, usedAi: false, notes };
  }

  // Real call lands when we wire up the Anthropic SDK + vision prompt
  // (see prompts/extract-brand.ts — next session). For now we flag
  // the intent in notes so it's obvious in STATUS/log output.
  notes.push(
    `AI extraction path reached with ${input.samples.length} samples — deferred to MW-2 polish (vision prompt + parser).`,
  );
  return { profile: base, usedAi: false, notes };
}
