/**
 * /touchpoints — upcoming birthdays / anniversaries / partnership
 * milestones. Manager-facing list with inline customize + send.
 *
 * The scanner at lib/touchpoints/scan.ts populates this list from
 * Contact.birth* + Partner.businessAnniversaryOn + Partner.partneredOn.
 * A daily cron tick keeps it fresh; the rep can also click "Refresh"
 * here to force a rescan.
 */

import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@partnerradar/db';
import { Cake, Briefcase, Handshake, RefreshCw, Sparkles } from 'lucide-react';
import { Card, Pill, EmptyState } from '@partnerradar/ui';
import { activeTenantId } from '@/lib/tenant/context';
import { TouchpointRowClient } from './TouchpointRowClient';
import { rescanTouchpoints } from './actions';
import { SendDueButton } from './SendDueButton';

export const dynamic = 'force-dynamic';

const KIND_LABELS: Record<string, string> = {
  BIRTHDAY: 'Birthday',
  BUSINESS_ANNIVERSARY: 'Business anniversary',
  PARTNERSHIP_MILESTONE: 'Partnership anniversary',
};

export default async function TouchpointsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const isManagerPlus =
    session.user.role === 'MANAGER' ||
    session.user.role === 'ADMIN' ||
    session.user.role === 'SUPER_ADMIN';
  if (!isManagerPlus) redirect('/radar');

  const tenantId = await activeTenantId(session);

  // Trigger an opportunistic scan on first paint when the list is
  // empty — saves the manager from having to click Refresh just to
  // see anything. Best-effort; failure swallowed.
  const empty = await prisma.touchpoint.count({
    where: tenantId ? { tenantId } : {},
  });
  if (empty === 0) {
    await rescanTouchpoints().catch(() => {});
  }

  const where = tenantId ? { tenantId } : {};
  const [upcoming, recent] = await Promise.all([
    prisma.touchpoint.findMany({
      where: {
        ...where,
        status: 'SCHEDULED',
      },
      orderBy: { scheduledFor: 'asc' },
      take: 100,
      include: {
        partner: { select: { id: true, companyName: true } },
      },
    }),
    prisma.touchpoint.findMany({
      where: {
        ...where,
        status: { in: ['SENT', 'FAILED', 'SKIPPED', 'CANCELED'] },
      },
      orderBy: { sentAt: 'desc' },
      take: 25,
      include: {
        partner: { select: { id: true, companyName: true } },
      },
    }),
  ]);

  const groups: Record<string, typeof upcoming> = {};
  for (const tp of upcoming) {
    const key = tp.scheduledFor.toISOString().slice(0, 10);
    (groups[key] ??= []).push(tp);
  }
  const groupKeys = Object.keys(groups).sort();

  return (
    <div className="mx-auto max-w-[1200px] p-6">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Touchpoints</h1>
          <p className="mt-0.5 text-xs text-gray-500">
            Birthdays, business anniversaries, and partnership milestones — all the moments worth a
            quick &ldquo;thinking of you.&rdquo;
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SendDueButton />
          <form
            action={async () => {
              'use server';
              await rescanTouchpoints();
            }}
          >
            <button
              type="submit"
              className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
          </form>
        </div>
      </header>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {groupKeys.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Sparkles className="h-5 w-5 text-amber-500" />}
                title="No upcoming touchpoints"
                description={
                  'Add birthdays in the contact panel on each partner, or a business anniversary on the partner page. Partnership anniversaries are tracked automatically once a partner is activated.'
                }
              />
            </Card>
          ) : (
            groupKeys.map((day) => {
              const items = groups[day]!;
              const date = new Date(`${day}T00:00:00Z`);
              const dayLabel = date.toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'short',
                day: 'numeric',
                timeZone: 'UTC',
              });
              return (
                <Card key={day} title={`${dayLabel} · ${items.length}`}>
                  <ul className="divide-y divide-gray-100">
                    {items.map((tp) => (
                      <TouchpointRowClient
                        key={tp.id}
                        id={tp.id}
                        kind={tp.kind as keyof typeof KIND_LABELS}
                        kindLabel={KIND_LABELS[tp.kind] ?? tp.kind}
                        partner={tp.partner}
                        meta={(tp.meta as Record<string, unknown>) ?? {}}
                        message={tp.message}
                        channel={tp.channel}
                        scheduledFor={tp.scheduledFor.toISOString()}
                      />
                    ))}
                  </ul>
                </Card>
              );
            })
          )}
        </div>

        <div className="space-y-4">
          <Card title="Recent">
            {recent.length === 0 ? (
              <p className="text-xs text-gray-500">Nothing sent yet.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {recent.map((tp) => (
                  <li key={tp.id} className="flex items-center gap-2 py-1.5 text-xs">
                    {tp.kind === 'BIRTHDAY' ? (
                      <Cake className="h-3.5 w-3.5 text-pink-500" />
                    ) : tp.kind === 'BUSINESS_ANNIVERSARY' ? (
                      <Briefcase className="h-3.5 w-3.5 text-amber-500" />
                    ) : (
                      <Handshake className="h-3.5 w-3.5 text-blue-500" />
                    )}
                    <Link
                      href={`/partners/${tp.partner.id}`}
                      className="flex-1 truncate text-gray-700 hover:text-primary"
                    >
                      {tp.partner.companyName}
                    </Link>
                    <Pill
                      tone="soft"
                      color={
                        tp.status === 'SENT' ? 'emerald' : tp.status === 'FAILED' ? 'red' : 'gray'
                      }
                    >
                      {tp.status.toLowerCase()}
                    </Pill>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="How it works">
            <p className="text-[11px] leading-relaxed text-gray-600">
              The scanner runs nightly and picks up any contact with a birthday or partner with a
              business anniversary or partnership milestone (1, 2, 3, 5, 7, 10+ years) in the next
              30 days. SMS sends require Twilio credentials + the contact&apos;s SMS consent; email
              sends require Resend. Without either, the touchpoint stays scheduled so the rep can
              fall back to a manual call/text.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
