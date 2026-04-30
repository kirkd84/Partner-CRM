/**
 * /newsletters/drips — list of recurring drip sequences.
 */

import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@partnerradar/db';
import { Card, EmptyState, Pill } from '@partnerradar/ui';
import { Repeat, ArrowRight, Plus, ArrowLeft } from 'lucide-react';
import { activeTenantId } from '@/lib/tenant/context';

export const dynamic = 'force-dynamic';

export default async function DripsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const isManagerPlus =
    session.user.role === 'MANAGER' ||
    session.user.role === 'ADMIN' ||
    session.user.role === 'SUPER_ADMIN';
  if (!isManagerPlus) redirect('/radar');

  const tenantId = await activeTenantId(session);
  const drips = await prisma.newsletterDrip
    .findMany({
      where: tenantId ? { tenantId } : {},
      orderBy: [{ active: 'desc' }, { updatedAt: 'desc' }],
      include: {
        _count: { select: { steps: true, enrollments: true } },
      },
    })
    .catch(() => []);

  return (
    <div className="p-6">
      <Link
        href="/newsletters"
        className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-primary"
      >
        <ArrowLeft className="h-3 w-3" /> Back to newsletters
      </Link>
      <header className="mt-1 flex items-start gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-violet-50 text-violet-600 ring-1 ring-inset ring-violet-100">
          <Repeat className="h-5 w-5" />
        </span>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-gray-900">Drips</h1>
          <p className="text-xs text-gray-500">
            Multi-step recurring sequences. Add steps with day offsets, enroll partners (manually or
            by trigger), and the cron worker fires each step on schedule.
          </p>
        </div>
        <Link
          href="/newsletters/drips/new"
          className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-hover"
        >
          <Plus className="h-3.5 w-3.5" /> New drip
        </Link>
      </header>

      {drips.length === 0 ? (
        <div className="mt-6">
          <Card>
            <EmptyState
              title="No drips yet"
              description="Create a drip to send a sequenced welcome series, post-activation onboarding, or quarterly check-in cadence."
            />
          </Card>
        </div>
      ) : (
        <div className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {drips.map((d) => (
            <Link
              key={d.id}
              href={`/newsletters/drips/${d.id}`}
              className="group rounded-lg border border-card-border bg-white p-4 shadow-card transition hover:border-violet-200 hover:shadow-md"
            >
              <div className="flex items-baseline justify-between gap-2">
                <div className="font-semibold text-gray-900">{d.name}</div>
                <Pill tone="soft" color={d.active ? 'emerald' : 'gray'}>
                  {d.active ? 'Active' : 'Paused'}
                </Pill>
              </div>
              {d.description && <p className="mt-1 text-[11px] text-gray-500">{d.description}</p>}
              <div className="mt-3 flex items-center justify-between text-xs text-gray-600">
                <span>
                  {d._count.steps} step{d._count.steps === 1 ? '' : 's'}
                </span>
                <span>{d._count.enrollments} enrolled</span>
                <ArrowRight className="h-3 w-3 text-gray-400 group-hover:text-primary" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
