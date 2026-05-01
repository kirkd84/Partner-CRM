/**
 * /admin/tenant — tenant-level config: milestone years + per-touchpoint
 * default messages. Admin-only.
 */

import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@partnerradar/db';
import { Building2 } from 'lucide-react';
import { activeTenantId } from '@/lib/tenant/context';
import { TenantConfigClient } from './TenantConfigClient';

export const dynamic = 'force-dynamic';

export default async function TenantConfigPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const isAdmin = session.user.role === 'ADMIN' || session.user.role === 'SUPER_ADMIN';
  if (!isAdmin) redirect('/admin');

  const tenantId = await activeTenantId(session);
  const tenant = tenantId
    ? await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
          id: true,
          name: true,
          milestoneYears: true,
          touchpointTemplates: true,
        },
      })
    : null;

  return (
    <div className="p-6">
      <header className="flex items-start gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-100">
          <Building2 className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Tenant config</h1>
          <p className="text-xs text-gray-500">
            {tenant?.name
              ? `Configuring ${tenant.name}.`
              : 'No active tenant — switch via /super-admin first.'}
          </p>
        </div>
      </header>

      {tenant && (
        <div className="mt-5 max-w-3xl">
          <TenantConfigClient
            milestoneYears={tenant.milestoneYears}
            templates={
              (tenant.touchpointTemplates as Record<
                string,
                { subject: string; body: string }
              > | null) ?? null
            }
          />
        </div>
      )}
    </div>
  );
}
