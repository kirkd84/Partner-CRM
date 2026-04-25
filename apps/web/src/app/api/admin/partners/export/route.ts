/**
 * GET /api/admin/partners/export?marketId=...&stage=...&format=csv
 *
 * Streams a CSV of partner data scoped to the caller's permissions:
 *   - ADMIN  → all markets (or ?marketId=… filter)
 *   - MANAGER → only their markets
 *   - REP    → forbidden (reps can't bulk-export their book; CRM 101)
 *
 * Use cases:
 *   - Backup before a risky migration
 *   - Onboarding a new market manager — hand them a snapshot
 *   - Replace a churned rep's CRM with a clean copy of their pipeline
 *   - Compliance / audit pulls
 *
 * Streaming via ReadableStream so a 50k-row export doesn't buffer the
 * whole response in memory. Cursor-based pagination keeps the prisma
 * query fast even on the long tail.
 *
 * Filename includes the date + market name so multi-market exports
 * don't all collide as `partners.csv` in Downloads.
 */

import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@partnerradar/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 500;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });
  if (session.user.role === 'REP') {
    return new Response('Forbidden — exports are admin/manager only', { status: 403 });
  }

  const url = req.nextUrl;
  const marketIdFilter = url.searchParams.get('marketId') || undefined;
  const stageFilter = url.searchParams.get('stage') || undefined;
  const includeArchivedRaw = url.searchParams.get('includeArchived');
  const includeArchived = includeArchivedRaw === '1' || includeArchivedRaw === 'true';

  const userMarkets = session.user.markets ?? [];
  const allowedMarketIds =
    session.user.role === 'ADMIN'
      ? marketIdFilter
        ? [marketIdFilter]
        : null // null = no filter
      : marketIdFilter
        ? userMarkets.includes(marketIdFilter)
          ? [marketIdFilter]
          : []
        : userMarkets;

  if (allowedMarketIds && allowedMarketIds.length === 0) {
    return new Response('No accessible markets to export from', { status: 403 });
  }

  // Resolve a friendly filename suffix from the (single) market scope.
  let scopeLabel = 'all-markets';
  if (allowedMarketIds && allowedMarketIds.length === 1) {
    const m = await prisma.market
      .findUnique({ where: { id: allowedMarketIds[0]! }, select: { name: true } })
      .catch(() => null);
    if (m?.name) scopeLabel = slug(m.name);
  } else if (allowedMarketIds && allowedMarketIds.length > 1) {
    scopeLabel = `${allowedMarketIds.length}-markets`;
  }

  const filename = `partners-${scopeLabel}-${todayStamp()}.csv`;
  const where = {
    ...(allowedMarketIds ? { marketId: { in: allowedMarketIds } } : {}),
    ...(stageFilter ? { stage: stageFilter as never } : {}),
    ...(includeArchived ? {} : { archivedAt: null }),
  };

  // Stream rows page-by-page so memory stays bounded on a 50k export.
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      controller.enqueue(enc.encode(headerRow() + '\n'));

      let cursor: string | undefined;
      try {
        while (true) {
          const batch = await prisma.partner.findMany({
            where,
            orderBy: { id: 'asc' },
            take: PAGE_SIZE,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            include: {
              market: { select: { name: true } },
              assignedRep: { select: { name: true, email: true } },
              contacts: {
                where: { isPrimary: true },
                select: { name: true, title: true, emails: true, phones: true },
                take: 1,
              },
            },
          });
          if (batch.length === 0) break;
          for (const p of batch) {
            controller.enqueue(enc.encode(rowFor(p) + '\n'));
          }
          cursor = batch[batch.length - 1]!.id;
          if (batch.length < PAGE_SIZE) break;
        }
        controller.close();
      } catch (err) {
        // Stream errors get reported as a trailing comment row — most
        // CSV parsers ignore lines starting with `#`. Better than
        // silently truncating the file mid-export.
        controller.enqueue(
          enc.encode(`# EXPORT FAILED: ${err instanceof Error ? err.message : 'unknown'}\n`),
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'private, no-store',
    },
  });
}

const COLUMNS = [
  'public_id',
  'company_name',
  'partner_type',
  'custom_type',
  'stage',
  'stage_changed_at',
  'source',
  'market',
  'address',
  'address_line_2',
  'city',
  'state',
  'zip',
  'lat',
  'lng',
  'website',
  'assigned_rep_name',
  'assigned_rep_email',
  'primary_contact_name',
  'primary_contact_title',
  'primary_contact_email',
  'primary_contact_phone',
  'sms_consent',
  'email_unsubscribed_at',
  'storm_cloud_id',
  'activated_at',
  'archived_at',
  'reliability_score',
  'event_show_rate',
  'created_at',
  'updated_at',
] as const;

function headerRow(): string {
  return COLUMNS.join(',');
}

interface PartnerRow {
  publicId: string;
  companyName: string;
  partnerType: string;
  customType: string | null;
  stage: string;
  stageChangedAt: Date;
  source: string;
  market: { name: string };
  address: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  lat: number | null;
  lng: number | null;
  website: string | null;
  assignedRep: { name: string | null; email: string } | null;
  contacts: Array<{
    name: string | null;
    title: string | null;
    emails: unknown;
    phones: unknown;
  }>;
  smsConsent: boolean;
  emailUnsubscribedAt: Date | null;
  stormCloudId: string | null;
  activatedAt: Date | null;
  archivedAt: Date | null;
  reliabilityScore: number | null;
  eventShowRate: number | null;
  createdAt: Date;
  updatedAt: Date;
}

function rowFor(p: PartnerRow): string {
  const c = p.contacts[0];
  const emails = (c?.emails as Array<{ address?: string; primary?: boolean }> | null) ?? [];
  const phones = (c?.phones as Array<{ number?: string; primary?: boolean }> | null) ?? [];
  const email = emails.find((e) => e?.primary)?.address ?? emails[0]?.address ?? '';
  const phone = phones.find((q) => q?.primary)?.number ?? phones[0]?.number ?? '';

  const fields = [
    p.publicId,
    p.companyName,
    p.partnerType,
    p.customType ?? '',
    p.stage,
    p.stageChangedAt?.toISOString() ?? '',
    p.source,
    p.market.name,
    p.address ?? '',
    p.addressLine2 ?? '',
    p.city ?? '',
    p.state ?? '',
    p.zip ?? '',
    p.lat ?? '',
    p.lng ?? '',
    p.website ?? '',
    p.assignedRep?.name ?? '',
    p.assignedRep?.email ?? '',
    c?.name ?? '',
    c?.title ?? '',
    email,
    phone,
    p.smsConsent ? 'true' : 'false',
    p.emailUnsubscribedAt?.toISOString() ?? '',
    p.stormCloudId ?? '',
    p.activatedAt?.toISOString() ?? '',
    p.archivedAt?.toISOString() ?? '',
    p.reliabilityScore ?? '',
    p.eventShowRate ?? '',
    p.createdAt.toISOString(),
    p.updatedAt.toISOString(),
  ];
  return fields.map(csvEscape).join(',');
}

/**
 * RFC 4180 escaping: wrap in quotes if the value contains a comma,
 * quote, or newline. Embedded quotes get doubled. Numbers + booleans
 * pass through unchanged.
 */
function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function todayStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}
