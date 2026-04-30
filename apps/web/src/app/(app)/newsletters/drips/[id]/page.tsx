/**
 * /newsletters/drips/[id] — drip detail.
 *
 * Shows the ordered steps + an Add Step form. Manager can also enroll
 * matching partners on demand and toggle the drip active/paused.
 */

import { auth } from '@/auth';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { prisma } from '@partnerradar/db';
import { Card, Pill } from '@partnerradar/ui';
import { activeTenantId } from '@/lib/tenant/context';
import { DripDetailClient } from './DripDetailClient';

export const dynamic = 'force-dynamic';

export default async function DripDetail({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const isManagerPlus =
    session.user.role === 'MANAGER' ||
    session.user.role === 'ADMIN' ||
    session.user.role === 'SUPER_ADMIN';
  if (!isManagerPlus) redirect('/radar');

  const { id } = await params;
  const tenantId = await activeTenantId(session);
  const drip = await prisma.newsletterDrip.findFirst({
    where: { id, ...(tenantId ? { tenantId } : {}) },
    include: {
      steps: { orderBy: { position: 'asc' } },
      _count: { select: { enrollments: true } },
    },
  });
  if (!drip) notFound();

  // Enrollment health stats — quick read on what the drip is doing.
  const enrollments = await prisma.newsletterDripEnrollment.groupBy({
    by: ['status'],
    where: { dripId: id },
    _count: { status: true },
  });
  const byStatus: Record<string, number> = {};
  for (const e of enrollments) byStatus[e.status] = e._count.status;

  return (
    <div className="mx-auto max-w-4xl p-6">
      <Link
        href="/newsletters/drips"
        className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-primary"
      >
        <ArrowLeft className="h-3 w-3" /> All drips
      </Link>
      <header className="mt-1 flex flex-wrap items-baseline gap-3">
        <h1 className="text-xl font-semibold text-gray-900">{drip.name}</h1>
        <Pill tone="soft" color={drip.active ? 'emerald' : 'gray'}>
          {drip.active ? 'Active' : 'Paused'}
        </Pill>
        <span className="text-xs text-gray-500">
          Trigger: {drip.triggerType.replace(/_/g, ' ').toLowerCase()}
        </span>
      </header>
      {drip.description && <p className="mt-1 text-xs text-gray-500">{drip.description}</p>}

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <Stat label="Steps" value={drip.steps.length} />
        <Stat label="Active" value={byStatus.ACTIVE ?? 0} accent="emerald" />
        <Stat label="Completed" value={byStatus.COMPLETED ?? 0} accent="blue" />
        <Stat label="Paused" value={byStatus.PAUSED ?? 0} accent="amber" />
      </div>

      <DripDetailClient
        id={drip.id}
        active={drip.active}
        steps={drip.steps.map((s) => ({
          id: s.id,
          position: s.position,
          delayDays: s.delayDays,
          subject: s.subject,
          bodyText: s.bodyText,
        }))}
      />

      {drip.steps.length === 0 ? (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Add at least one step before enrolling partners. Until then the drip can&apos;t fire.
        </div>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: 'emerald' | 'blue' | 'amber';
}) {
  const tone =
    accent === 'emerald'
      ? 'text-emerald-700'
      : accent === 'blue'
        ? 'text-blue-700'
        : accent === 'amber'
          ? 'text-amber-700'
          : 'text-gray-900';
  return (
    <div className="rounded-md border border-card-border bg-white px-3 py-2 shadow-card">
      <div className="text-[10.5px] uppercase tracking-label text-gray-500">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}
