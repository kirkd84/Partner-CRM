/**
 * BrandProfile — the canonical structured representation of a brand's
 * visual + voice identity (SPEC_MARKETING §3.2).
 *
 * All Marketing Wizard generation reads from this JSON blob stored on
 * MwBrand.profile. It intentionally captures more than the AI strictly
 * needs so the admin UI can show side-by-side guideline cards ("here's
 * what we extracted; does it look right?").
 *
 * Everything here is serializable — no Date objects; use ISO strings
 * so the profile round-trips cleanly through JSON columns.
 */

export type BrandProfileStatus = 'TRAINING' | 'ACTIVE' | 'ARCHIVED';

export interface BrandLogo {
  id: string;
  variant: 'primary' | 'dark' | 'light' | 'icon';
  fileId: string;
  format: 'svg' | 'png';
  aspectRatio: number;
  minWidth?: number;
  clearSpaceMultiplier?: number;
}

export interface BrandColor {
  hex: string;
  role: 'primary' | 'secondary' | 'accent' | 'neutral';
  name?: string;
}

export interface BrandColors {
  primary: BrandColor & { role: 'primary' };
  secondary: BrandColor & { role: 'secondary' };
  accents: Array<BrandColor & { role: 'accent' }>;
  neutrals: Array<BrandColor & { role: 'neutral' }>;
  usageRatios: { primary: number; secondary: number; accent: number; neutral: number };
}

export interface BrandTypography {
  display: { family: string; weight: number; sourceUrl?: string; fallback: string };
  body: { family: string; weight: number; sourceUrl?: string; fallback: string };
  accent?: { family: string; weight: number; sourceUrl?: string; fallback: string };
  headlineCaseStyle: 'UPPERCASE' | 'Title Case' | 'Sentence case' | 'lowercase';
  headlineSizeRange: { minPx: number; maxPx: number };
  bodySize: number;
  lineHeight: number;
  letterSpacing?: string;
}

export interface BrandLayoutMotifs {
  heroPattern?:
    | 'top-photo-with-overlay-text'
    | 'split-left-right'
    | 'full-bleed-photo'
    | 'centered-hero'
    | 'custom';
  dividerStyle?: 'angled' | 'curved' | 'straight' | 'none';
  photoTreatment?: 'circular-cutouts' | 'rounded-corners' | 'full-bleed' | 'polaroid' | 'custom';
  iconStyle?: 'line' | 'filled' | 'duotone' | 'custom';
  footerStyle?: string;
  badgesAndCertifications?: Array<{ name: string; fileId: string }>;
}

export interface BrandVoice {
  descriptors: string[];
  formality: number; // 1..10
  avgHeadlineLength: number; // words
  avgBodyParagraphLength: number; // sentences
  commonPowerWords: string[];
  dosAndDonts: { dos: string[]; donts: string[] };
}

export interface BrandTrainingSampleAnalysis {
  dominantColors: string[];
  layoutType: string;
  copyTone: string;
  detectedElements: string[];
}

export interface BrandTrainingSample {
  id: string;
  fileId: string;
  contentType: 'flyer' | 'social' | 'brochure' | 'business-card' | 'web' | 'other';
  extractedAt: string; // ISO
  analysis: BrandTrainingSampleAnalysis;
}

export interface BrandPreferenceWeights {
  templatePreferences: Record<string, number>;
  colorVariantPreferences: Record<string, number>;
  layoutMotifPreferences: Record<string, number>;
  lastUpdatedAt: string; // ISO
  totalApprovals: number;
}

export interface BrandProfile {
  id: string;
  workspaceId: string;
  name: string;
  status: BrandProfileStatus;
  companyName: string;
  tagline?: string;
  contact: {
    phone?: string;
    email?: string;
    website?: string;
    physicalAddress?: string;
    socialHandles?: Array<{ platform: string; handle: string }>;
  };
  logos: BrandLogo[];
  colors: BrandColors;
  typography: BrandTypography;
  layoutMotifs: BrandLayoutMotifs;
  voice: BrandVoice;
  industry?: string;
  targetAudiences: string[];
  trainingSamples: BrandTrainingSample[];
  preferenceWeights: BrandPreferenceWeights;
  createdAt: string;
  updatedAt: string;
}

/**
 * Placeholder profile used when Claude extraction isn't available
 * (no ANTHROPIC_API_KEY) or the admin hasn't uploaded samples yet.
 * Picks sensible defaults from the user's explicit brand inputs so
 * the workspace is immediately usable with neutral styling.
 */
export function placeholderBrandProfile(args: {
  id: string;
  workspaceId: string;
  name: string;
  companyName: string;
  primaryHex?: string;
  secondaryHex?: string;
  accentHex?: string;
  physicalAddress?: string;
  phone?: string;
  email?: string;
  website?: string;
  industry?: string;
}): BrandProfile {
  const now = new Date().toISOString();
  return {
    id: args.id,
    workspaceId: args.workspaceId,
    name: args.name,
    status: 'TRAINING',
    companyName: args.companyName,
    contact: {
      phone: args.phone,
      email: args.email,
      website: args.website,
      physicalAddress: args.physicalAddress,
    },
    logos: [],
    colors: {
      primary: { hex: args.primaryHex ?? '#F2903A', role: 'primary', name: 'Primary' },
      secondary: {
        hex: args.secondaryHex ?? '#1e2537',
        role: 'secondary',
        name: 'Secondary',
      },
      accents: args.accentHex ? [{ hex: args.accentHex, role: 'accent', name: 'Accent' }] : [],
      neutrals: [
        { hex: '#FFFFFF', role: 'neutral', name: 'White' },
        { hex: '#111827', role: 'neutral', name: 'Ink' },
      ],
      usageRatios: { primary: 0.4, secondary: 0.3, accent: 0.1, neutral: 0.2 },
    },
    typography: {
      display: { family: 'Inter', weight: 800, fallback: 'system-ui, sans-serif' },
      body: { family: 'Inter', weight: 400, fallback: 'system-ui, sans-serif' },
      headlineCaseStyle: 'Title Case',
      headlineSizeRange: { minPx: 32, maxPx: 72 },
      bodySize: 14,
      lineHeight: 1.45,
    },
    layoutMotifs: {
      heroPattern: 'centered-hero',
      dividerStyle: 'straight',
      photoTreatment: 'rounded-corners',
      iconStyle: 'line',
    },
    voice: {
      descriptors: ['Professional', 'Clear', 'Trustworthy'],
      formality: 6,
      avgHeadlineLength: 6,
      avgBodyParagraphLength: 3,
      commonPowerWords: [],
      dosAndDonts: { dos: [], donts: [] },
    },
    industry: args.industry,
    targetAudiences: [],
    trainingSamples: [],
    preferenceWeights: {
      templatePreferences: {},
      colorVariantPreferences: {},
      layoutMotifPreferences: {},
      lastUpdatedAt: now,
      totalApprovals: 0,
    },
    createdAt: now,
    updatedAt: now,
  };
}
