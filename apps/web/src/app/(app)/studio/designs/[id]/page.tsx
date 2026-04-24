/**
 * /studio/designs/[id] — design detail.
 *
 * Mobile-first: preview up top (aspect-ratio preserved), actions strip
 * underneath, editable copy fields in a card, variant swatches, export
 * links. On desktop, everything flows into a wider two-column layout.
 */

import Link from 'next/link';
import { auth } from '@/auth';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@partnerradar/db';
import { ArrowLeft, Check } from 'lucide-react';
import { Pill } from '@partnerradar/ui';
import {
  getTemplate,
  sizesForContentType,
  PLATFORM_SIZES,
} from '@partnerradar/marketing-templates';
import { DesignPreview } from './DesignPreview';
import { DesignActions } from './DesignActions';
import { DesignEditor } from './DesignEditor';
import { DesignImageSlots } from './DesignImageSlots';
import { DesignRefinement } from './DesignRefinement';
import { DesignVersions } from './DesignVersions';
import { DesignSizes } from './DesignSizes';
import { DesignPersonalize } from './DesignPersonalize';

export const dynamic = 'force-dynamic';

export default async function DesignPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role === 'REP') redirect('/radar');
  const { id } = await params;

  const design = await prisma.mwDesign.findUnique({
    where: { id },
    include: { brand: { select: { id: true, name: true } }, workspace: true },
  });
  if (!design) notFound();

  // Workspace gate.
  if (session.user.role !== 'ADMIN') {
    const markets = session.user.markets ?? [];
    if (
      !design.workspace.partnerRadarMarketId ||
      !markets.includes(design.workspace.partnerRadarMarketId)
    ) {
      redirect('/studio');
    }
  }

  const doc = design.document as unknown as {
    templateKey: string;
    slots: { text: Record<string, string>; image: Record<string, string> };
    variant: 'light' | 'dark' | 'brand-primary';
    sizeKey: string;
    width: number;
    height: number;
  };
  const direction = design.direction as unknown as {
    templateKey: string;
    copy: { headline: string; subhead?: string; body?: string; cta?: string };
    reasoning: string;
  };
  const template = getTemplate(doc.templateKey);

  // MW-4: pull recent version history for the timeline.
  const versionRows = await prisma.mwDesignVersion
    .findMany({
      where: { designId: design.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, changeLog: true, createdAt: true, createdBy: true },
      take: 30,
    })
    .catch(() => []);

  // MW-5: filter the platform catalog to sizes that fit this content
  // type best, plus the design's own template-declared sizes (some
  // templates have unique sizes — e.g. business-card-vertical).
  const contentTypeSizes = sizesForContentType(design.contentType as never);
  const templateExtraSizes = (template?.manifest.sizes ?? []).filter(
    (s) => !PLATFORM_SIZES.some((p) => p.key === s.key),
  );
  const combinedSizes = [
    ...contentTypeSizes,
    ...templateExtraSizes.map((s) => ({
      key: s.key,
      label: s.key,
      description: `${s.width}×${s.height}${s.dpi ? ` @ ${s.dpi} DPI` : ''}`,
      width: s.width,
      height: s.height,
      group: 'print' as const,
    })),
  ];

  // MW-6: load partners visible to this caller for the personalize picker.
  // Manager+ → all partners in their markets; admin → everywhere.
  const role = session.user.role;
  const userMarkets = session.user.markets ?? [];
  const partnersRaw = await prisma.partner
    .findMany({
      where:
        role === 'ADMIN'
          ? {}
          : userMarkets.length > 0
            ? { marketId: { in: userMarkets } }
            : { id: '__none__' },
      select: {
        id: true,
        companyName: true,
        contacts: {
          where: { isPrimary: true },
          select: { name: true },
          take: 1,
        },
      },
      orderBy: { companyName: 'asc' },
      take: 200,
    })
    .catch(
      () => [] as Array<{ id: string; companyName: string; contacts: Array<{ name: string }> }>,
    );
  const partners = partnersRaw.map((p) => ({
    id: p.id,
    companyName: p.companyName,
    primaryContactName: p.contacts[0]?.name ?? null,
  }));

  return (
    <div className="flex h-full flex-col bg-canvas">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-card-border bg-white px-4 py-3 sm:px-6">
        <Link
          href="/studio"
          className="flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold text-gray-900 sm:text-base">
            {design.name}
          </h1>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-gray-500">
            <Pill color={statusColor(design.status)} tone="soft">
              {design.status}
            </Pill>
            <span className="truncate">
              {design.contentType.replace(/_/g, ' ').toLowerCase()} · {design.brand.name}
            </span>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 lg:flex-row lg:gap-6">
          {/* Preview — aspect ratio preserved at all screen sizes. */}
          <div className="flex-1 lg:max-w-[60%]">
            <DesignPreview
              designId={design.id}
              width={doc.width}
              height={doc.height}
              defaultVariant={doc.variant}
            />

            <DesignActions
              designId={design.id}
              currentStatus={design.status}
              width={doc.width}
              height={doc.height}
            />
          </div>

          {/* Right column: refinement, copy, photos, meta. On mobile this all
              stacks under the preview — designed thumb-first. */}
          <aside className="flex w-full flex-col gap-4 lg:max-w-[380px]">
            <DesignRefinement designId={design.id} />

            <DesignEditor
              designId={design.id}
              slots={doc.slots.text}
              templateSlots={template?.manifest.slots ?? []}
              initialVariant={doc.variant}
            />

            <DesignImageSlots
              designId={design.id}
              imageSlots={(template?.manifest.slots ?? []).filter((s) => s.kind === 'image')}
              values={doc.slots.image}
            />

            <DesignSizes designId={design.id} sizes={combinedSizes} variant={doc.variant} />

            <DesignPersonalize
              designId={design.id}
              partners={partners}
              variant={doc.variant}
              width={doc.width}
              height={doc.height}
            />

            <DesignVersions
              designId={design.id}
              versions={versionRows.map((v) => ({
                ...v,
                createdAt: v.createdAt.toISOString(),
              }))}
            />

            <div className="rounded-xl border border-card-border bg-white p-4 text-xs text-gray-600">
              <div className="text-[11px] font-semibold uppercase tracking-label text-gray-500">
                How we landed here
              </div>
              <p className="mt-2 text-gray-800">{direction.copy.headline}</p>
              {direction.copy.subhead && (
                <p className="mt-1 text-gray-600">{direction.copy.subhead}</p>
              )}
              <p className="mt-3 text-[11px] italic text-gray-500">{direction.reasoning}</p>
              {template && (
                <p className="mt-3 flex items-center gap-1 text-[11px] text-gray-500">
                  <Check className="h-3 w-3" /> Template: {template.manifest.name}
                </p>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function statusColor(s: string): string {
  switch (s) {
    case 'DRAFT':
      return '#6b7280';
    case 'REVIEW':
      return '#f59e0b';
    case 'APPROVED':
      return '#10b981';
    case 'FINAL':
      return '#6366f1';
    case 'ARCHIVED':
      return '#ef4444';
    default:
      return '#9ca3af';
  }
}
