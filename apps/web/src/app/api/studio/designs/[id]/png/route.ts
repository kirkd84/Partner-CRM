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
  renderDesign,
  toBrandRenderProfile,
  type BrandProfile,
} from '@partnerradar/marketing-engine';
import { getTemplate, type ColorVariant, type SlotValues } from '@partnerradar/marketing-templates';

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

  // Workspace gate: admin = all, manager = matching market
  if (session.user.role !== 'ADMIN' && session.user.role !== 'MANAGER') {
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

  const doc = design.document as unknown as {
    templateKey: string;
    slots: SlotValues;
    variant: ColorVariant;
    sizeKey: string;
  };
  const override = req.nextUrl.searchParams.get('variant') as ColorVariant | null;
  const variant = override ?? doc.variant ?? 'light';

  const template = getTemplate(doc.templateKey);
  if (!template) return new Response('Template gone', { status: 500 });

  const brandProfile = design.brand.profile as unknown as BrandProfile;
  const size =
    template.manifest.sizes.find((s) => s.key === doc.sizeKey) ?? template.manifest.sizes[0]!;

  try {
    const rendered = await renderDesign({
      template,
      brand: toBrandRenderProfile(brandProfile),
      slots: doc.slots,
      size,
      variant,
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
