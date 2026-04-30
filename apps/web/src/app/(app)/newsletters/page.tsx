/**
 * /newsletters — list of drafted + sent newsletters with quick stats.
 * Manager+ only.
 */

import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@partnerradar/db';
import { Card, EmptyState, Pill } from '@partnerradar/ui';
import { Mail, ArrowRight, Plus, Repeat } from 'lucide-react';
import { activeTenantId } from '@/lib/tenant/context';

export const dynamic = 'force-dynamic';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'gray',
  SENDING: 'amber',
  SENT: 'emerald',
  FAILED: 'red',
};

export default async function NewslettersPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const isManagerPlus =
    session.user.role === 'MANAGER' ||
    session.user.role === 'ADMIN' ||
    session.user.role === 'SUPER_ADMIN';
  if (!isManagerPlus) redirect('/radar');

  const tenantId = await activeTenantId(session);

  const newsletters = await prisma.newsletter
    .findMany({
      where: tenantId ? { tenantId } : {},
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
      take: 100,
      include: {
        creator: { select: { name: true } },
      },
    })
    .catch(() => []);

  return (
    <div className="p-6">
      <header className="flex items-start gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-100">
          <Mail className="h-5 w-5" />
        </span>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-gray-900">Newsletters</h1>
          <p className="text-xs text-gray-500">
            Send a one-shot email to a segment of your partners. CAN-SPAM-compliant footer with your
            physical address + a one-click unsubscribe is appended automatically. Anyone who
            previously unsubscribed is skipped.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/newsletters/drips"
            className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            <Repeat className="h-3.5 w-3.5" /> Drips
          </Link>
          <Link
            href="/newsletters/new"
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-hover"
          >
            <Plus className="h-3.5 w-3.5" /> New newsletter
          </Link>
        </div>
      </header>

      {newsletters.length === 0 ? (
        <div className="mt-6">
          <Card>
            <EmptyState
              title="No newsletters yet"
              description="Click New newsletter to compose your first one. Drafts stay editable until you click Send."
            />
          </Card>
        </div>
      ) : (
        <div className="mt-5 overflow-hidden rounded-lg border border-card-border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-[11px] uppercase tracking-label text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">Subject</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-right">Recipients</th>
                <th className="px-3 py-2 text-right">Sent</th>
                <th className="px-3 py-2 text-right">Errors</th>
                <th className="px-3 py-2 text-left">Author</th>
                <th className="px-3 py-2 text-left">Updated</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {newsletters.map((n) => (
                <tr key={n.id} className="hover:bg-blue-50/30">
                  <td className="px-3 py-2 font-medium text-gray-900">{n.subject}</td>
                  <td className="px-3 py-2">
                    <Pill tone="soft" color={STATUS_COLORS[n.status] ?? 'gray'}>
                      {n.status}
                    </Pill>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                    {n.recipientCount || (n.status === 'DRAFT' ? '—' : 0)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-700">
                    {n.sentCount || 0}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-red-700">
                    {n.errorCount || 0}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600">{n.creator?.name ?? '—'}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">
                    {n.updatedAt.toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/newsletters/${n.id}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      Open <ArrowRight className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
