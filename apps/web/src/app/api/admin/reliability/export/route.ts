/**
 * GET /api/admin/reliability/export — CSV of the Partner Reliability
 * report, respecting the caller's market scope (admins get all;
 * managers get their markets).
 */

import { NextRequest } from 'next/server';
import { prisma } from '@partnerradar/db';
import { auth } from '@/auth';

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });
  const role = session.user.role;
  if (role !== 'ADMIN' && role !== 'MANAGER') {
    return new Response('Forbidden', { status: 403 });
  }

  const marketScope = role === 'ADMIN' ? {} : { marketId: { in: session.user.markets ?? [] } };

  const rows = await prisma.partner.findMany({
    where: { ...marketScope, archivedAt: null },
    select: {
      companyName: true,
      market: { select: { name: true } },
      stage: true,
      autoWaitlistEligible: true,
      waitlistPriority: true,
      eventAcceptanceRate: true,
      eventShowRate: true,
      reliabilityScore: true,
    },
    orderBy: [{ reliabilityScore: { sort: 'desc', nulls: 'last' } }, { companyName: 'asc' }],
    take: 2000,
  });

  const lines: string[] = [
    [
      'Partner',
      'Market',
      'Stage',
      'AcceptancePct',
      'ShowPct',
      'ReliabilityScore',
      'AutoWaitlistEligible',
      'Priority',
    ]
      .map(csvEscape)
      .join(','),
    ...rows.map((r) =>
      [
        csvEscape(r.companyName),
        csvEscape(r.market.name),
        csvEscape(r.stage),
        r.eventAcceptanceRate != null ? (r.eventAcceptanceRate * 100).toFixed(1) : '',
        r.eventShowRate != null ? (r.eventShowRate * 100).toFixed(1) : '',
        r.reliabilityScore != null ? (r.reliabilityScore * 100).toFixed(1) : '',
        r.autoWaitlistEligible ? 'yes' : 'no',
        r.waitlistPriority ?? '',
      ].join(','),
    ),
  ];
  const body = lines.join('\r\n');

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="partner-reliability.csv"',
      'Cache-Control': 'private, no-store',
    },
  });
}

function csvEscape(s: string | number | null | undefined): string {
  if (s == null) return '';
  const str = String(s);
  const needs = /[",\n\r]/.test(str);
  const esc = str.replace(/"/g, '""');
  return needs ? `"${esc}"` : esc;
}
