/**
 * GET /api/studio/designs/[id]/png
 *
 * Renders the MwDesign to a PNG on the fly — no R2/disk storage yet.
 * Auth-gated to workspace members. Edge-friendly but we stay on
 * Node runtime because @resvg/resvg-js ships a native binding.
 */

import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@partnerradar/db';
import {
  toBrandRenderProfile,
  type BrandProfile,
  type MergeContext,
} from '@partnerradar/marketing-engine';
// Renderer lives behind a server-only subpath so webpack never drags
// satori / @resvg/resvg-js into a client bundle.
import { renderDesign } from '@partnerradar/marketing-engine/render';
import {
  getTemplate,
  getPlatformSize,
  type ColorVariant,
  type SlotValues,
} from '@partnerradar/marketing-templates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });
  const { id } = await ctx.params;
  const design = await prisma.mwDesign.findUnique({
    where: { id },
    include: { brand: true, workspace: true },
  });
  if (!design) return new Response('Not found', { status: 404 });

  // Role gate: admin / manager / super-admin only
  if (
    session.user.role !== 'ADMIN' &&
    session.user.role !== 'MANAGER' &&
    session.user.role !== 'SUPER_ADMIN'
  ) {
    return new Response('Forbidden', { status: 403 });
  }
  if (session.user.role === 'MANAGER') {
    const markets = session.user.markets ?? [];
    if (
      !design.workspace.partnerRadarMarketId ||
      !markets.includes(design.workspace.partnerRadarMarketId)
    ) {
      return new Response('Forbidden', { status: 403 });
    }
  }
  // Multi-tenant defense-in-depth — enforce workspace's tenant matches
  // the active tenant. Catches the "id from another tenant snuck in"
  // case the market-list check above would miss.
  try {
    const { assertWorkspaceTenant } = await import('@/lib/tenant/context');
    await assertWorkspaceTenant(session, design.workspace.tenantId);
  } catch {
    return new Response('Forbidden', { status: 403 });
  }

  const doc = design.document as unknown as {
    templateKey: string;
    slots: SlotValues;
    variant: ColorVariant;
    sizeKey: string;
  };
  const override = req.nextUrl.searchParams.get('variant') as ColorVariant | null;
  const variant = override ?? doc.variant ?? 'light';
  const sizeOverride = req.nextUrl.searchParams.get('sizeKey');
  const partnerIdParam = req.nextUrl.searchParams.get('partnerId');

  const template = getTemplate(doc.templateKey);
  if (!template) return new Response('Template gone', { status: 500 });

  const brandProfile = design.brand.profile as unknown as BrandProfile;

  // Size resolution priority:
  //   1. ?sizeKey= explicit URL override (multi-size export, MW-5)
  //   2. design.document.sizeKey (the size at create-time)
  //   3. first declared size on the template
  // Both the template manifest and the shared platform catalog are
  // searched so any platform size is reachable.
  const size =
    (sizeOverride
      ? (template.manifest.sizes.find((s) => s.key === sizeOverride) ??
        getPlatformSize(sizeOverride))
      : null) ??
    template.manifest.sizes.find((s) => s.key === doc.sizeKey) ??
    template.manifest.sizes[0]!;

  // Optional MW-6 mail-merge context — when ?partnerId is supplied we
  // resolve {{partner.companyName}} / {{firstName}} from that partner.
  // Recipient identity comes from the partner's primary Contact row.
  let merge: MergeContext | undefined;
  if (partnerIdParam) {
    try {
      const partner = await prisma.partner.findUnique({
        where: { id: partnerIdParam },
        select: {
          companyName: true,
          partnerType: true,
          contacts: {
            where: { isPrimary: true },
            select: { name: true, title: true, emails: true, phones: true },
            take: 1,
          },
        },
      });
      if (partner) {
        const c = partner.contacts[0];
        const fullName = c?.name ?? '';
        const [firstName, ...rest] = fullName.trim().split(/\s+/);
        // emails/phones are JSON arrays — pull the first marked primary or the
        // first entry as a fallback.
        const emails = (c?.emails as Array<{ address?: string; primary?: boolean }> | null) ?? [];
        const phones = (c?.phones as Array<{ number?: string; primary?: boolean }> | null) ?? [];
        const email = emails.find((e) => e?.primary)?.address ?? emails[0]?.address ?? undefined;
        const phone = phones.find((p) => p?.primary)?.number ?? phones[0]?.number ?? undefined;
        merge = {
          recipient: {
            firstName: firstName || fullName,
            lastName: rest.join(' '),
            fullName,
            ...(c?.title ? { title: c.title } : {}),
            ...(email ? { email } : {}),
            ...(phone ? { phone } : {}),
          },
          partner: {
            companyName: partner.companyName,
            primaryContactName: fullName,
            industry: partner.partnerType,
          },
          brand: {
            companyName: brandProfile.companyName,
            ...(brandProfile.tagline ? { tagline: brandProfile.tagline } : {}),
          },
        };
      }
    } catch (err) {
      console.warn('[design-png] partner merge lookup failed', err);
    }
  }

  try {
    const rendered = await renderDesign({
      template,
      brand: toBrandRenderProfile(brandProfile),
      slots: doc.slots,
      size,
      variant,
      ...(merge ? { merge } : {}),
    });
    return new Response(Buffer.from(rendered.png), {
      status: 200,
      headers: {
        'content-type': 'image/png',
        'cache-control': 'private, max-age=30',
      },
    });
  } catch (err) {
    console.error('[design-png]', err);
    return new Response(String((err as Error).message ?? 'render failed'), { status: 500 });
  }
}
