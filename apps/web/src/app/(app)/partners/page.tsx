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
import { Check } from 'lucide-react';
import { PartnersToolbar } from './PartnersToolbar';

export const dynamic = 'force-dynamic';

// Multi-select filters live in the URL as comma-separated lists:
//   /partners?stages=ACTIVATED,PROPOSAL_SENT&reps=abc,def
// Singular `?stage=` and `?rep=` are still accepted so old bookmarks
// and external links keep working — they're folded into the multi list
// before any rendering or query work happens.
type PartnersSearchParams = {
  stage?: string;
  stages?: string;
  rep?: string;
  reps?: string;
  q?: string;
};

const ALL_STAGES = Object.keys(STAGE_LABELS) as PartnerStage[];

export default async function PartnersPage({
  searchParams,
}: {
  searchParams: Promise<PartnersSearchParams>;
}) {
  const session = await auth();
  if (!session?.user) return null;
  const params = await searchParams;
  const isManagerPlus = session.user.role === 'MANAGER' || session.user.role === 'ADMIN';

  // Parse the multi-value params. Singular forms get folded in so
  // /partners?stage=ACTIVATED still works.
  const stageList = parseList(params.stages, params.stage).filter((s): s is PartnerStage =>
    (ALL_STAGES as string[]).includes(s),
  );
  const repList = parseList(params.reps, params.rep);

  const where: Prisma.PartnerWhereInput = {
    marketId: { in: session.user.markets },
    archivedAt: null,
  };
  if (session.user.role === 'REP') {
    where.OR = [{ assignedRepId: session.user.id }, { assignedRepId: null }];
  }

  // Rep filter — manager+ only. Three "magic" tokens compose with real
  // user IDs: "me" → current user, "unassigned" → null. The other
  // entries are real user.id values. We split into "needs-null OR" and
  // "id-in-array" so unassigned + named reps work in one query.
  if (isManagerPlus && repList.length > 0) {
    const includeUnassigned = repList.includes('unassigned');
    const idValues = repList
      .map((r) => (r === 'me' ? session.user.id : r))
      .filter((r) => r !== 'unassigned');
    const repClauses: Prisma.PartnerWhereInput[] = [];
    if (idValues.length > 0) repClauses.push({ assignedRepId: { in: idValues } });
    if (includeUnassigned) repClauses.push({ assignedRepId: null });
    if (repClauses.length === 1) {
      Object.assign(where, repClauses[0]);
    } else if (repClauses.length > 1) {
      // Combine with the existing search-OR (if any) via AND so neither
      // filter loosens the other.
      where.AND = [{ OR: repClauses }, ...((where.AND as Prisma.PartnerWhereInput[]) ?? [])];
    }
  }

  if (stageList.length > 0) {
    where.stage = { in: stageList };
  }

  if (params.q && params.q.trim()) {
    const q = params.q.trim();
    const searchOr: Prisma.PartnerWhereInput[] = [
      { companyName: { contains: q, mode: 'insensitive' } },
      { publicId: { contains: q, mode: 'insensitive' } },
      { city: { contains: q, mode: 'insensitive' } },
    ];
    where.AND = where.OR
      ? [{ OR: where.OR }, { OR: searchOr }, ...((where.AND as Prisma.PartnerWhereInput[]) ?? [])]
      : [{ OR: searchOr }, ...((where.AND as Prisma.PartnerWhereInput[]) ?? [])];
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

  // Build a /partners URL that toggles a value in/out of one of the
  // multi-list params. Server-rendered Links — no client JS — so the
  // sidebar stays cheap and predictable. Pass `clear: true` to reset
  // the whole list. Other params (stages, reps, q) are preserved.
  function hrefToggle(key: 'stages' | 'reps', value: string, opts?: { clear?: boolean }): string {
    const base = { stages: stageList as string[], reps: repList };
    let nextStages = [...base.stages];
    let nextReps = [...base.reps];
    if (key === 'stages') {
      nextStages = opts?.clear
        ? []
        : base.stages.includes(value)
          ? base.stages.filter((s) => s !== value)
          : [...base.stages, value];
    } else {
      nextReps = opts?.clear
        ? []
        : base.reps.includes(value)
          ? base.reps.filter((r) => r !== value)
          : [...base.reps, value];
    }
    return buildPartnersUrl({ stages: nextStages, reps: nextReps, q: params.q ?? '' });
  }

  // Resolve human-readable summary for the count line: "2 stages",
  // "John + Janessa", "Janessa", etc. Pure cosmetic — keeps the header
  // honest about why the table is the size it is.
  const repNameById = new Map(reps.map((r) => [r.id, r.name]));
  const repLabels = repList.map((r) => {
    if (r === 'me') return 'Me';
    if (r === 'unassigned') return 'Unassigned';
    return repNameById.get(r) ?? '?';
  });
  const repSummary =
    repLabels.length === 0
      ? null
      : repLabels.length <= 2
        ? repLabels.join(' + ')
        : `${repLabels.length} reps`;
  const stageSummary =
    stageList.length === 0
      ? null
      : stageList.length <= 2
        ? stageList.map((s) => STAGE_LABELS[s]).join(' + ')
        : `${stageList.length} stages`;

  return (
    <div className="flex h-full">
      <FilterSidebar>
        <div>
          <div className="mb-1 flex items-center justify-between text-xs font-medium text-gray-600">
            <span>Stage</span>
            {stageList.length > 0 && (
              <Link
                className="text-[10px] font-normal uppercase tracking-wider text-gray-400 hover:text-gray-700"
                href={hrefToggle('stages', '', { clear: true })}
              >
                Clear
              </Link>
            )}
          </div>
          <ul className="space-y-0.5 text-sm">
            {ALL_STAGES.map((s) => {
              const checked = stageList.includes(s);
              return (
                <li key={s}>
                  <Link
                    href={hrefToggle('stages', s)}
                    className={`flex items-center gap-2 rounded px-1 py-0.5 ${
                      checked ? 'text-blue-700' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span
                      className={`flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded border ${
                        checked
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border-gray-300 bg-white'
                      }`}
                    >
                      {checked && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                    </span>
                    <span className="truncate">{STAGE_LABELS[s]}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Rep filter — manager+ only. REPs already see their own book +
            the unclaimed pool, so the dropdown would be redundant for them. */}
        {isManagerPlus && (
          <div className="mt-5">
            <div className="mb-1 flex items-center justify-between text-xs font-medium text-gray-600">
              <span>Sales rep</span>
              {repList.length > 0 && (
                <Link
                  className="text-[10px] font-normal uppercase tracking-wider text-gray-400 hover:text-gray-700"
                  href={hrefToggle('reps', '', { clear: true })}
                >
                  Clear
                </Link>
              )}
            </div>
            <ul className="space-y-0.5 text-sm">
              <FilterRow
                label="Me"
                checked={repList.includes('me')}
                href={hrefToggle('reps', 'me')}
              />
              <FilterRow
                label="Unassigned"
                checked={repList.includes('unassigned')}
                href={hrefToggle('reps', 'unassigned')}
                tone="amber"
              />
              {reps.length > 0 && (
                <li className="mt-1 border-t border-gray-100 pt-1">
                  <div className="text-[10px] uppercase tracking-wider text-gray-400">Reps</div>
                </li>
              )}
              {reps.map((r) => (
                <FilterRow
                  key={r.id}
                  label={r.name}
                  checked={repList.includes(r.id)}
                  href={hrefToggle('reps', r.id)}
                />
              ))}
            </ul>
          </div>
        )}
      </FilterSidebar>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-card-border bg-white px-6 py-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Referral Partners</h1>
            <p className="text-xs text-gray-500">
              {partners.length} in view
              {stageSummary ? ` · ${stageSummary}` : ''}
              {repSummary ? ` · ${repSummary}` : ''}
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

/**
 * Single checkbox-style row in the filter sidebar. Click toggles the
 * value into/out of its parent list via the precomputed `href`.
 */
function FilterRow({
  label,
  checked,
  href,
  tone,
}: {
  label: string;
  checked: boolean;
  href: string;
  tone?: 'amber';
}) {
  const checkedColor =
    tone === 'amber'
      ? 'border-amber-600 bg-amber-600 text-white'
      : 'border-blue-600 bg-blue-600 text-white';
  const labelColor = checked
    ? tone === 'amber'
      ? 'text-amber-700'
      : 'text-blue-700'
    : 'text-gray-700 hover:bg-gray-50';
  return (
    <li>
      <Link href={href} className={`flex items-center gap-2 rounded px-1 py-0.5 ${labelColor}`}>
        <span
          className={`flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded border ${
            checked ? checkedColor : 'border-gray-300 bg-white'
          }`}
        >
          {checked && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
        </span>
        <span className="truncate">{label}</span>
      </Link>
    </li>
  );
}

/**
 * Parse a comma-separated multi-value param, optionally folding in a
 * legacy singular value. Returns deduped, trimmed, non-empty entries.
 */
function parseList(multi: string | undefined, single: string | undefined): string[] {
  const out = new Set<string>();
  if (multi) {
    for (const v of multi.split(',')) {
      const t = v.trim();
      if (t) out.add(t);
    }
  }
  if (single) {
    const t = single.trim();
    if (t) out.add(t);
  }
  return Array.from(out);
}

function buildPartnersUrl(state: { stages: string[]; reps: string[]; q: string }): string {
  const next: Record<string, string> = {};
  if (state.stages.length > 0) next.stages = state.stages.join(',');
  if (state.reps.length > 0) next.reps = state.reps.join(',');
  if (state.q) next.q = state.q;
  const qs = new URLSearchParams(next).toString();
  return qs ? `/partners?${qs}` : '/partners';
}
