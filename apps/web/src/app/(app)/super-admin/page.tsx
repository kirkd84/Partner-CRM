/**
 * /super-admin — list every tenant + click-through to act-as.
 */

import Link from 'next/link';
import { prisma } from '@partnerradar/db';
import { Card, Pill } from '@partnerradar/ui';
import { Building2, ArrowRight, Eye, Users, MapPinned } from 'lucide-react';
import { actAsTenantAction } from './actions';
import { ACT_AS_COOKIE } from '@/lib/tenant/context';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export default async function SuperAdminTenantsPage() {
  const tenants = await prisma.tenant
    .findMany({
      include: {
        _count: { select: { markets: true, users: true } },
      },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    })
    .catch(() => []);

  const jar = await cookies();
  const actingAs = jar.get(ACT_AS_COOKIE)?.value ?? null;

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <header className="mb-4">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-gray-900">
          <Building2 className="h-5 w-5 text-purple-600" />
          Tenants
        </h1>
        <p className="text-xs text-gray-500">
          Each tenant is an isolated workspace — markets, users, partners, and audit log are scoped
          to one tenant. Act-as switches your session into a tenant so you can debug or demo without
          a separate login.
        </p>
      </header>

      {actingAs && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          <span className="font-semibold">Currently acting as a tenant.</span> Your session is
          scoped — every page you visit acts as that tenant. Click <strong>Stop acting</strong> on
          the matching row to clear.
        </div>
      )}

      {tenants.length === 0 ? (
        <Card>
          <p className="text-xs text-gray-500">
            No tenants yet — auto-migrate seeds the Demo + Roof Technologies tenants on next boot.
            If this list is still empty after a redeploy, check Railway logs for seed errors.
          </p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {tenants.map((t) => (
            <li
              key={t.id}
              className="rounded-lg border border-card-border bg-white p-4 shadow-card"
            >
              <div className="flex items-start gap-3">
                <span
                  className="flex h-10 w-10 items-center justify-center rounded-md text-white"
                  style={{ background: t.primaryHex ?? '#1e40af' }}
                >
                  <Building2 className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-gray-900">{t.name}</h2>
                    <Pill
                      tone="soft"
                      color={
                        t.status === 'ACTIVE'
                          ? 'emerald'
                          : t.status === 'TRIAL'
                            ? 'blue'
                            : t.status === 'SUSPENDED'
                              ? 'red'
                              : 'gray'
                      }
                    >
                      {t.status}
                    </Pill>
                    <code className="font-mono text-[11px] text-gray-400">{t.slug}</code>
                  </div>
                  {t.legalName && <div className="text-[11px] text-gray-500">{t.legalName}</div>}
                  <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-gray-600">
                    <span className="inline-flex items-center gap-1">
                      <MapPinned className="h-3 w-3" /> {t._count.markets} market
                      {t._count.markets === 1 ? '' : 's'}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3 w-3" /> {t._count.users} user
                      {t._count.users === 1 ? '' : 's'}
                    </span>
                    {t.address && <span className="truncate">{t.address}</span>}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Link
                    href={`/super-admin/tenants/${t.id}`}
                    className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-700 hover:border-purple-400 hover:text-purple-700"
                  >
                    Details <ArrowRight className="h-3 w-3" />
                  </Link>
                  {actingAs === t.id ? (
                    <form action={actAsTenantAction}>
                      <input type="hidden" name="tenantId" value="" />
                      <button
                        type="submit"
                        className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100"
                      >
                        Stop acting
                      </button>
                    </form>
                  ) : (
                    <form action={actAsTenantAction}>
                      <input type="hidden" name="tenantId" value={t.id} />
                      <button
                        type="submit"
                        className="inline-flex items-center gap-1 rounded-md bg-purple-700 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-purple-800"
                      >
                        <Eye className="h-3 w-3" /> Act as
                      </button>
                    </form>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
