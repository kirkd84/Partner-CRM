/**
 * /newsletters/[id] — detail. Sent newsletters are read-only and show
 * stats; drafts are editable and have a Send button.
 */

import { auth } from '@/auth';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@partnerradar/db';
import { Card, Pill } from '@partnerradar/ui';
import { ArrowLeft } from 'lucide-react';
import { activeTenantId } from '@/lib/tenant/context';
import { NewsletterDetailClient } from './NewsletterDetailClient';
import { RecipientTable } from './RecipientTable';
import { markdownToHtml } from '../render';

export const dynamic = 'force-dynamic';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'gray',
  SCHEDULED: 'blue',
  SENDING: 'amber',
  SENT: 'emerald',
  FAILED: 'red',
};

export default async function NewsletterDetail({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const isManagerPlus =
    session.user.role === 'MANAGER' ||
    session.user.role === 'ADMIN' ||
    session.user.role === 'SUPER_ADMIN';
  if (!isManagerPlus) redirect('/radar');

  const { id } = await params;
  const tenantId = await activeTenantId(session);

  const newsletter = await prisma.newsletter.findFirst({
    where: { id, ...(tenantId ? { tenantId } : {}) },
    include: { creator: { select: { name: true, email: true } } },
  });
  if (!newsletter) notFound();

  // Per-recipient drilldown — fetched only when the newsletter has
  // already gone out (or is in flight). Capped at 500 for the page;
  // larger sends should grow a paginated drawer in a follow-up.
  const recipients =
    newsletter.status === 'DRAFT'
      ? []
      : await prisma.newsletterRecipient
          .findMany({
            where: { newsletterId: newsletter.id },
            orderBy: [{ sentAt: 'desc' }, { createdAt: 'desc' }],
            take: 500,
            include: {
              partner: { select: { id: true, companyName: true } },
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
      <header className="mt-1 flex flex-wrap items-baseline gap-3">
        <h1 className="text-xl font-semibold text-gray-900">{newsletter.subject}</h1>
        <Pill tone="soft" color={STATUS_COLORS[newsletter.status] ?? 'gray'}>
          {newsletter.status}
        </Pill>
        <span className="text-xs text-gray-500">
          By {newsletter.creator?.name ?? '—'} ·{' '}
          {newsletter.sentAt
            ? `Sent ${newsletter.sentAt.toLocaleString()}`
            : `Updated ${newsletter.updatedAt.toLocaleString()}`}
        </span>
      </header>

      {newsletter.status !== 'DRAFT' && (
        <div className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Recipients" value={newsletter.recipientCount} />
          <Stat label="Sent" value={newsletter.sentCount} accent="emerald" />
          <Stat label="Opened" value={newsletter.openCount} accent="blue" />
          <Stat label="Clicked" value={newsletter.clickCount} accent="violet" />
          <Stat label="Skipped" value={newsletter.blockedCount} accent="amber" />
          <Stat label="Errors" value={newsletter.errorCount} accent="red" />
        </div>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card title="Preview">
          {newsletter.bodyMarkdown ? (
            // Render the actual HTML the partner will see. The markdown
            // renderer escapes <script> + only allows http(s) links so
            // it's safe to drop into dangerouslySetInnerHTML. Recipient
            // id is null here (we're previewing, not sending) so links
            // render as the original URLs instead of click-tracker URLs.
            <div
              className="newsletter-preview text-sm leading-relaxed text-gray-800"
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{
                __html: markdownToHtml(newsletter.bodyText, null),
              }}
            />
          ) : (
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-gray-800">
              {newsletter.bodyText}
            </pre>
          )}
        </Card>

        <NewsletterDetailClient
          id={newsletter.id}
          status={newsletter.status}
          subject={newsletter.subject}
          bodyText={newsletter.bodyText}
          recipientCount={newsletter.recipientCount}
          errorSamples={
            (newsletter.errorSamples as Array<{
              partnerId: string;
              email: string;
              error: string;
            }> | null) ?? null
          }
        />
      </div>

      {recipients.length > 0 && (
        <div className="mt-5">
          <RecipientTable
            recipients={recipients.map((r) => ({
              id: r.id,
              email: r.email,
              partner: r.partner,
              sentAt: r.sentAt?.toISOString() ?? null,
              deliveredAt: r.deliveredAt?.toISOString() ?? null,
              openedAt: r.openedAt?.toISOString() ?? null,
              firstClickedAt: r.firstClickedAt?.toISOString() ?? null,
              bouncedAt: r.bouncedAt?.toISOString() ?? null,
              bounceReason: r.bounceReason,
              errorMessage: r.errorMessage,
            }))}
          />
        </div>
      )}
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
  accent?: 'emerald' | 'amber' | 'red' | 'blue' | 'violet';
}) {
  const tone =
    accent === 'emerald'
      ? 'text-emerald-700'
      : accent === 'amber'
        ? 'text-amber-700'
        : accent === 'red'
          ? 'text-red-700'
          : accent === 'blue'
            ? 'text-blue-700'
            : accent === 'violet'
              ? 'text-violet-700'
              : 'text-gray-900';
  return (
    <div className="rounded-md border border-card-border bg-white px-3 py-2 shadow-card">
      <div className="text-[10.5px] uppercase tracking-label text-gray-500">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}
