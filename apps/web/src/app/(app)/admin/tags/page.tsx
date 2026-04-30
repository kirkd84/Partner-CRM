/**
 * /admin/tags — every tag in use across the tenant + partner counts.
 * Lets the manager rename or delete tags in bulk so the taxonomy
 * doesn't fragment ("high-priority" vs "high priority" vs "high pri").
 */

import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@partnerradar/db';
import { Card, EmptyState, Pill } from '@partnerradar/ui';
import { Tag } from 'lucide-react';
import { activeTenantId } from '@/lib/tenant/context';
import { TagRowClient } from './TagRowClient';

export const dynamic = 'force-dynamic';

export default async function TagsAdminPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const isManagerPlus =
    session.user.role === 'MANAGER' ||
    session.user.role === 'ADMIN' ||
    session.user.role === 'SUPER_ADMIN';
  if (!isManagerPlus) redirect('/admin');

  const tenantId = await activeTenantId(session);

  // Group by tag with a partner count. Prisma's groupBy on a join via
  // partner.market.tenantId is awkward, so we pull all PartnerTag rows
  // for the scope and aggregate in code — fine at the volumes we're at.
  const rows = await prisma.partnerTag.findMany({
    where: tenantId ? { partner: { market: { tenantId } } } : {},
    select: { tag: true, partnerId: true },
    take: 5000,
  });

  type Bucket = { tag: string; partners: Set<string> };
  const map = new Map<string, Bucket>();
  for (const r of rows) {
    let b = map.get(r.tag);
    if (!b) {
      b = { tag: r.tag, partners: new Set() };
      map.set(r.tag, b);
    }
    b.partners.add(r.partnerId);
  }
  const buckets = [...map.values()]
    .map((b) => ({ tag: b.tag, count: b.partners.size }))
    .sort((a, b) => b.count - a.count);

  return (
    <div className="p-6">
      <header className="flex items-start gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-violet-50 text-violet-600 ring-1 ring-inset ring-violet-100">
          <Tag className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Partner tags</h1>
          <p className="text-xs text-gray-500">
            Every tag in use across your partners. Rename to consolidate
            (&ldquo;high-priority&rdquo; and &ldquo;high priority&rdquo; can become one). Delete to
            drop a tag everywhere.
          </p>
        </div>
      </header>

      <div className="mt-5">
        {buckets.length === 0 ? (
          <Card>
            <EmptyState
              title="No tags yet"
              description="Open any partner detail page and click + tag to create your first one."
            />
          </Card>
        ) : (
          <Card title={`Tags (${buckets.length})`}>
            <ul className="divide-y divide-gray-100">
              {buckets.map((b) => (
                <TagRowClient key={b.tag} tag={b.tag} count={b.count} />
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
