'use client';

/**
 * BrandPreview — renders a sample marketing tile using a BrandProfile.
 *
 * This is the first concrete template primitive in the Marketing
 * Wizard surface. It ships three tiny variants (flyer / social / email
 * header) so the `/studio/brands` page can show what a brand actually
 * looks like before committing, and /studio/brand-setup can surface a
 * live preview as the admin tweaks colors.
 *
 * No Satori / no server rendering. Pure SVG + React. Keeps the bundle
 * tiny and preview latency at zero. When MW-3 ships real template
 * rendering we'll upgrade to server-generated PNGs via Satori, but the
 * visual language set here stays consistent.
 *
 * Extracted-package principle: this component only imports from
 * marketing-engine (types) so the marketing-ui package can ship
 * standalone with no peer dependencies into PartnerRadar internals.
 */

import type { BrandProfile } from '@partnerradar/marketing-engine';

export type BrandPreviewVariant = 'flyer' | 'social' | 'email-header';

export interface BrandPreviewProps {
  profile: BrandProfile;
  variant?: BrandPreviewVariant;
  headline?: string;
  subhead?: string;
  cta?: string;
  width?: number;
  /**
   * When true, shows a subtle "sample" ribbon in the corner so the
   * preview can't be mistaken for a finished asset in screenshots.
   */
  showSampleBadge?: boolean;
}

export function BrandPreview({
  profile,
  variant = 'flyer',
  headline,
  subhead,
  cta,
  width = 320,
  showSampleBadge = true,
}: BrandPreviewProps) {
  const copy = resolveCopy(variant, headline, subhead, cta, profile);
  if (variant === 'social') {
    return (
      <SquareTile profile={profile} copy={copy} width={width} showSampleBadge={showSampleBadge} />
    );
  }
  if (variant === 'email-header') {
    return (
      <EmailHeaderTile
        profile={profile}
        copy={copy}
        width={width}
        showSampleBadge={showSampleBadge}
      />
    );
  }
  return (
    <FlyerTile profile={profile} copy={copy} width={width} showSampleBadge={showSampleBadge} />
  );
}

// ─── Variants ────────────────────────────────────────────────────────

function FlyerTile({
  profile,
  copy,
  width,
  showSampleBadge,
}: {
  profile: BrandProfile;
  copy: ResolvedCopy;
  width: number;
  showSampleBadge: boolean;
}) {
  const height = Math.round(width * (11 / 8.5)); // US Letter-ish
  const { display, body, primary, secondary, accent, ink, paper } = tokens(profile);
  const padX = Math.round(width * 0.07);
  const headlineSize = Math.round(width * 0.1);
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={`${profile.companyName} brand preview`}
      style={{ width, height, display: 'block' }}
    >
      <rect width={width} height={height} fill={paper} />
      {/* Primary diagonal stripe. */}
      <polygon
        points={`0,${height * 0.46} ${width},${height * 0.34} ${width},${height * 0.52} 0,${height * 0.64}`}
        fill={primary}
      />
      {/* Accent slim bar. */}
      {accent ? (
        <polygon
          points={`0,${height * 0.64} ${width},${height * 0.52} ${width},${height * 0.56} 0,${height * 0.68}`}
          fill={accent}
        />
      ) : null}
      {/* Wordmark block. */}
      <text
        x={padX}
        y={Math.round(height * 0.13)}
        fontFamily={display.family}
        fontWeight={display.weight}
        fontSize={Math.round(width * 0.055)}
        fill={secondary}
      >
        {profile.companyName.toUpperCase()}
      </text>
      {/* Headline. */}
      <text
        x={padX}
        y={Math.round(height * 0.3)}
        fontFamily={display.family}
        fontWeight={display.weight}
        fontSize={headlineSize}
        fill={ink}
      >
        {copy.headline}
      </text>
      {copy.subhead ? (
        <text
          x={padX}
          y={Math.round(height * 0.3 + headlineSize * 1.2)}
          fontFamily={body.family}
          fontSize={Math.round(width * 0.04)}
          fill={ink}
          opacity={0.75}
        >
          {copy.subhead}
        </text>
      ) : null}
      {/* CTA pill. */}
      <g transform={`translate(${padX}, ${Math.round(height * 0.82)})`}>
        <rect
          width={Math.round(width * 0.42)}
          height={Math.round(width * 0.1)}
          rx={Math.round(width * 0.05)}
          fill={primary}
        />
        <text
          x={Math.round(width * 0.21)}
          y={Math.round(width * 0.066)}
          textAnchor="middle"
          fontFamily={display.family}
          fontWeight={display.weight}
          fontSize={Math.round(width * 0.04)}
          fill={paper}
        >
          {copy.cta.toUpperCase()}
        </text>
      </g>
      {/* Footer address strip. */}
      {profile.contact.physicalAddress ? (
        <>
          <rect
            y={height - Math.round(width * 0.075)}
            width={width}
            height={Math.round(width * 0.075)}
            fill={secondary}
          />
          <text
            x={padX}
            y={height - Math.round(width * 0.028)}
            fontFamily={body.family}
            fontSize={Math.round(width * 0.028)}
            fill={paper}
          >
            {profile.contact.physicalAddress}
          </text>
        </>
      ) : null}
      {showSampleBadge ? <SampleBadge x={width - 52} y={8} /> : null}
    </svg>
  );
}

function SquareTile({
  profile,
  copy,
  width,
  showSampleBadge,
}: {
  profile: BrandProfile;
  copy: ResolvedCopy;
  width: number;
  showSampleBadge: boolean;
}) {
  const side = width;
  const { display, body, primary, secondary, accent, ink, paper } = tokens(profile);
  return (
    <svg
      viewBox={`0 0 ${side} ${side}`}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={`${profile.companyName} social preview`}
      style={{ width: side, height: side, display: 'block' }}
    >
      <rect width={side} height={side} fill={paper} />
      <rect width={side} height={Math.round(side * 0.55)} fill={primary} />
      <text
        x={side / 2}
        y={Math.round(side * 0.2)}
        textAnchor="middle"
        fontFamily={display.family}
        fontWeight={display.weight}
        fontSize={Math.round(side * 0.09)}
        fill={paper}
      >
        {copy.headline}
      </text>
      {copy.subhead ? (
        <text
          x={side / 2}
          y={Math.round(side * 0.3)}
          textAnchor="middle"
          fontFamily={body.family}
          fontSize={Math.round(side * 0.036)}
          fill={paper}
          opacity={0.9}
        >
          {copy.subhead}
        </text>
      ) : null}
      {accent ? (
        <rect
          y={Math.round(side * 0.55)}
          width={side}
          height={Math.round(side * 0.03)}
          fill={accent}
        />
      ) : null}
      <text
        x={side / 2}
        y={Math.round(side * 0.72)}
        textAnchor="middle"
        fontFamily={display.family}
        fontWeight={display.weight}
        fontSize={Math.round(side * 0.055)}
        fill={ink}
      >
        {profile.companyName}
      </text>
      <g transform={`translate(${side / 2 - side * 0.2}, ${side * 0.82})`}>
        <rect
          width={Math.round(side * 0.4)}
          height={Math.round(side * 0.095)}
          rx={Math.round(side * 0.048)}
          fill={secondary}
        />
        <text
          x={Math.round(side * 0.2)}
          y={Math.round(side * 0.065)}
          textAnchor="middle"
          fontFamily={display.family}
          fontWeight={display.weight}
          fontSize={Math.round(side * 0.036)}
          fill={paper}
        >
          {copy.cta.toUpperCase()}
        </text>
      </g>
      {showSampleBadge ? <SampleBadge x={side - 52} y={8} /> : null}
    </svg>
  );
}

function EmailHeaderTile({
  profile,
  copy,
  width,
  showSampleBadge,
}: {
  profile: BrandProfile;
  copy: ResolvedCopy;
  width: number;
  showSampleBadge: boolean;
}) {
  const height = Math.round(width * 0.32);
  const { display, body, primary, secondary, accent, paper } = tokens(profile);
  const padX = Math.round(width * 0.05);
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={`${profile.companyName} email header preview`}
      style={{ width, height, display: 'block' }}
    >
      <rect width={width} height={height} fill={secondary} />
      <rect width={width} height={Math.round(height * 0.18)} fill={primary} />
      {accent ? (
        <rect
          y={Math.round(height * 0.18)}
          width={width}
          height={Math.round(height * 0.04)}
          fill={accent}
        />
      ) : null}
      <text
        x={padX}
        y={Math.round(height * 0.13)}
        fontFamily={display.family}
        fontWeight={display.weight}
        fontSize={Math.round(height * 0.1)}
        fill={paper}
      >
        {profile.companyName.toUpperCase()}
      </text>
      <text
        x={padX}
        y={Math.round(height * 0.55)}
        fontFamily={display.family}
        fontWeight={display.weight}
        fontSize={Math.round(height * 0.22)}
        fill={paper}
      >
        {copy.headline}
      </text>
      {copy.subhead ? (
        <text
          x={padX}
          y={Math.round(height * 0.77)}
          fontFamily={body.family}
          fontSize={Math.round(height * 0.1)}
          fill={paper}
          opacity={0.85}
        >
          {copy.subhead}
        </text>
      ) : null}
      {showSampleBadge ? <SampleBadge x={width - 52} y={8} /> : null}
    </svg>
  );
}

function SampleBadge({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect width={44} height={16} rx={3} fill="#111827" opacity={0.55} />
      <text
        x={22}
        y={11}
        textAnchor="middle"
        fontFamily="system-ui, sans-serif"
        fontSize={9}
        fill="#fff"
        fontWeight={700}
      >
        SAMPLE
      </text>
    </g>
  );
}

// ─── Token + copy helpers ────────────────────────────────────────────

function tokens(profile: BrandProfile) {
  const primary = profile.colors.primary.hex;
  const secondary = profile.colors.secondary.hex;
  const accent = profile.colors.accents[0]?.hex;
  const paper =
    profile.colors.neutrals.find((n) => n.hex.toUpperCase() === '#FFFFFF')?.hex ?? '#ffffff';
  const ink =
    profile.colors.neutrals.find((n) => n.hex.toUpperCase() !== '#FFFFFF')?.hex ?? '#111827';
  const display = {
    family: `${profile.typography.display.family}, ${profile.typography.display.fallback}`,
    weight: profile.typography.display.weight,
  };
  const body = {
    family: `${profile.typography.body.family}, ${profile.typography.body.fallback}`,
    weight: profile.typography.body.weight,
  };
  return { primary, secondary, accent, paper, ink, display, body };
}

interface ResolvedCopy {
  headline: string;
  subhead?: string;
  cta: string;
}

function resolveCopy(
  variant: BrandPreviewVariant,
  headline: string | undefined,
  subhead: string | undefined,
  cta: string | undefined,
  profile: BrandProfile,
): ResolvedCopy {
  const industry = profile.industry ?? 'your business';
  const defaults: Record<BrandPreviewVariant, ResolvedCopy> = {
    flyer: {
      headline: headline ?? applyCase(`Suite night`, profile),
      subhead: subhead ?? `Partner with ${profile.companyName} — ${industry}`,
      cta: cta ?? 'RSVP',
    },
    social: {
      headline: headline ?? applyCase(`You're invited`, profile),
      subhead: subhead ?? `Hosted by ${profile.companyName}`,
      cta: cta ?? 'RSVP',
    },
    'email-header': {
      headline: headline ?? applyCase(`Save the date`, profile),
      subhead: subhead ?? `${profile.companyName} · ${industry}`,
      cta: cta ?? '',
    },
  };
  return defaults[variant];
}

function applyCase(text: string, profile: BrandProfile): string {
  switch (profile.typography.headlineCaseStyle) {
    case 'UPPERCASE':
      return text.toUpperCase();
    case 'lowercase':
      return text.toLowerCase();
    case 'Title Case':
      return text.replace(/\b\w/g, (c) => c.toUpperCase());
    default:
      return text;
  }
}
