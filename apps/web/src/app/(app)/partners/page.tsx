import { Prisma, prisma } from '@partnerradar/db';
import { auth } from '@/auth';
import { FilterSidebar, Pill, Table, THead, TBody, TR, TH, TD } from '@partnerradar/ui';
import {
  PARTNER_TYPE_LABELS,
  STAGE_COLORS,
  STAGE_LABELS,
  type PartnerStage,
} from '@partnerradar/types';
import Link from 'next/link';
import { PartnersToolbar } from './PartnersToolbar';

export const dynamic = 'force-dynamic';

type PartnersSearchParams = { stage?: PartnerStage; q?: string };

export default async function PartnersPage({
  searchParams,
}: {
  searchParams: Promise<PartnersSearchParams>;
}) {
  const session = await auth();
  if (!session?.user) return null;
  const params = await searchParams;
  const isManagerPlus = session.user.role === 'MANAGER' || session.user.role === 'ADMIN';

  const where: Prisma.PartnerWhereInput = {
    marketId: { in: session.user.markets },
    archivedAt: null,
  };
  if (session.user.role === 'REP') {
    where.OR = [{ assignedRepId: session.user.id }, { assignedRepId: null }];
  }
  if (params.stage) where.stage = params.stage;
  if (params.q && params.q.trim()) {
    const q = params.q.trim();
    const searchOr: Prisma.PartnerWhereInput[] = [
      { companyName: { contains: q, mode: 'insensitive' } },
      { publicId: { contains: q, mode: 'insensitive' } },
      { city: { contains: q, mode: 'insensitive' } },
    ];
    where.AND = where.OR ? [{ OR: where.OR }, { OR: searchOr }] : [{ OR: searchOr }];
    delete where.OR;
  }

  const [partners, markets, reps] = await Promise.all([
    prisma.partner.findMany({
      where,
      orderBy: [{ stageChangedAt: 'desc' }],
      include: { assignedRep: { select: { name: true, avatarColor: true } } },
      take: 200,
    }),
    prisma.market.findMany({
      where: { id: { in: session.user.markets } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    isManagerPlus
      ? prisma.user.findMany({
          where: {
            markets: { some: { marketId: { in: session.user.markets } } },
            active: true,
          },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        })
      : Promise.resolve([]),
  ]);

  return (
    <div className="flex h-full">
      <FilterSidebar>
        <div>
          <div className="mb-1 text-xs font-medium text-gray-600">Stage</div>
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

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-card-border bg-white px-6 py-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Referral Partners</h1>
            <p className="text-xs text-gray-500">
              {partners.length} in view
              {params.stage ? ` · ${STAGE_LABELS[params.stage]}` : ''}
              {params.q ? ` · matching "${params.q}"` : ''}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <PartnersToolbar markets={markets} reps={reps} canAssign={isManagerPlus} />
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
                    <Link
                      href={`/partners/${p.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {p.companyName}
                    </Link>
                  </TD>
                  <TD>
                    <span className="font-mono text-xs text-gray-500">{p.publicId}</span>
                  </TD>
                  <TD>{PARTNER_TYPE_LABELS[p.partnerType]}</TD>
                  <TD>
                    <Pill color={STAGE_COLORS[p.stage]} tone="soft">
                      {STAGE_LABELS[p.stage]}
                    </Pill>
                  </TD>
                  <TD>
                    {p.city ? (
                      `${p.city}, ${p.state ?? ''}`
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
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
