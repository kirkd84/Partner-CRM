/**
 * /newsletters/new — compose form. Server component loads the
 * filterable axes (partner types, stages, networking groups) and
 * hands them to the client form.
 */

import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@partnerradar/db';
import { ArrowLeft } from 'lucide-react';
import { activeTenantId } from '@/lib/tenant/context';
import { ORDERED_STAGES, STAGE_LABELS, PARTNER_TYPE_LABELS } from '@partnerradar/types';
import { ComposeNewsletterClient } from './ComposeNewsletterClient';

export const dynamic = 'force-dynamic';

export default async function NewNewsletterPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const isManagerPlus =
    session.user.role === 'MANAGER' ||
    session.user.role === 'ADMIN' ||
    session.user.role === 'SUPER_ADMIN';
  if (!isManagerPlus) redirect('/radar');

  const tenantId = await activeTenantId(session);
  const groups = await prisma.networkingGroup
    .findMany({
      where: { ...(tenantId ? { tenantId } : {}), archivedAt: null },
      select: { id: true, name: true, shortCode: true },
      orderBy: { name: 'asc' },
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
      <h1 className="mt-1 text-xl font-semibold text-gray-900">New newsletter</h1>
      <p className="text-xs text-gray-500">
        Compose, pick your audience, send a test to yourself, then click Send. The CAN-SPAM footer +
        unsubscribe link are appended for you.
      </p>

      <div className="mt-5">
        <ComposeNewsletterClient
          partnerTypes={Object.entries(PARTNER_TYPE_LABELS).map(([key, label]) => ({
            key,
            label,
          }))}
          stages={ORDERED_STAGES.map((s) => ({ key: s, label: STAGE_LABELS[s] }))}
          groups={groups.map((g) => ({ id: g.id, label: g.shortCode || g.name }))}
        />
      </div>
    </div>
  );
}
