import { prisma } from '@partnerradar/db';
import { auth } from '@/auth';
import { Button, FilterSidebar, Pill, Table, THead, TBody, TR, TH, TD } from '@partnerradar/ui';
import {
  PARTNER_TYPE_LABELS,
  STAGE_COLORS,
  STAGE_LABELS,
  type PartnerStage,
} from '@partnerradar/types';
import Link from 'next/link';
import { Plus, Search } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function PartnersPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: PartnerStage }>;
}) {
  const session = await auth();
  if (!session?.user) return null;
  const params = await searchParams;

  const partners = await prisma.partner.findMany({
    where: {
      marketId: { in: session.user.markets },
      archivedAt: null,
      ...(session.user.role === 'REP'
        ? { OR: [{ assignedRepId: session.user.id }, { assignedRepId: null }] }
        : {}),
      ...(params.stage ? { stage: params.stage } : {}),
    },
    orderBy: [{ stageChangedAt: 'desc' }],
    include: { assignedRep: { select: { name: true, avatarColor: true } } },
    take: 200,
  });

  return (
    <div className="flex h-full">
      <FilterSidebar>
        <div>
          <div className="text-xs font-medium text-gray-600 mb-1">Stage</div>
          <ul className="space-y-0.5 text-sm">
            <li>
              <Link className="text-blue-600 hover:underline" href="/partners">
                All stages
              </Link>
            </li>
            {(Object.keys(STAGE_LABELS) as PartnerStage[]).map((s) => (
              <li key={s}>
                <Link
                  className="text-gray-700 hover:text-blue-600 hover:underline"
                  href={`/partners?stage=${s}`}
                >
                  {STAGE_LABELS[s]}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </FilterSidebar>

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-card-border bg-white">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Referral Partners</h1>
            <p className="text-xs text-gray-500">
              {partners.length} in view
              {params.stage ? ` · ${STAGE_LABELS[params.stage]}` : ''}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2 h-4 w-4 text-gray-400" />
              <input
                type="search"
                placeholder="Search partners…"
                className="pl-8 pr-3 py-1.5 text-sm rounded-md border border-gray-300 focus:border-primary focus:ring-1 focus:ring-primary w-60"
              />
            </div>
            <Button>
              <Plus className="h-4 w-4" /> New
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-white">
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>ID</TH>
                <TH>Partner Type</TH>
                <TH>Stage</TH>
                <TH>City</TH>
                <TH>Assigned</TH>
              </TR>
            </THead>
            <TBody>
              {partners.map((p) => (
                <TR key={p.id}>
                  <TD>
                    <Link href={`/partners/${p.id}`} className="text-primary font-medium hover:underline">
                      {p.companyName}
                    </Link>
                  </TD>
                  <TD>
                    <span className="text-xs font-mono text-gray-500">{p.publicId}</span>
                  </TD>
                  <TD>{PARTNER_TYPE_LABELS[p.partnerType]}</TD>
                  <TD>
                    <Pill color={STAGE_COLORS[p.stage]} tone="soft">
                      {STAGE_LABELS[p.stage]}
                    </Pill>
                  </TD>
                  <TD>
                    {p.city ? `${p.city}, ${p.state ?? ''}` : <span className="text-gray-400">—</span>}
                  </TD>
                  <TD>
                    {p.assignedRep ? (
                      <span>{p.assignedRep.name}</span>
                    ) : (
                      <span className="text-xs text-amber-600">Unassigned</span>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
