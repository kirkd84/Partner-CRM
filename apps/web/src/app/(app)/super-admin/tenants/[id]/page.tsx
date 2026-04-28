/**
 * /super-admin/tenants/[id] — single tenant detail with markets + users
 * + status controls. Act-as button lives here too for quick access.
 */

import { auth } from '@/auth';
import { redirect, notFound } from 'next/navigation';
import { prisma } from '@partnerradar/db';
import { Card, Pill } from '@partnerradar/ui';
import Link from 'next/link';
import { Building2, Users, MapPinned, Eye } from 'lucide-react';
import { actAsTenantAction, updateTenantStatusAction } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'SUPER_ADMIN') redirect('/radar');
  const { id } = await params;

  const tenant = await prisma.tenant.findUnique({
    where: { id },
    include: {
      markets: { select: { id: true, name: true, _count: { select: { partners: true } } } },
      users: {
        select: { id: true, name: true, email: true, role: true, active: true, lastLoginAt: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  if (!tenant) notFound();

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <header className="mb-4 flex items-start gap-3">
        <span
          className="flex h-12 w-12 items-center justify-center rounded-md text-white"
          style={{ background: tenant.primaryHex ?? '#1e40af' }}
        >
          <Building2 className="h-6 w-6" />
        </span>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-gray-900">{tenant.name}</h1>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
            <code className="font-mono">{tenant.slug}</code>
            <Pill
              tone="soft"
              color={
                tenant.status === 'ACTIVE'
                  ? 'emerald'
                  : tenant.status === 'TRIAL'
                    ? 'blue'
                    : tenant.status === 'SUSPENDED'
                      ? 'red'
                      : 'gray'
              }
            >
              {tenant.status}
            </Pill>
            {tenant.legalName && <span>· {tenant.legalName}</span>}
          </div>
        </div>
        <form action={actAsTenantAction}>
          <input type="hidden" name="tenantId" value={tenant.id} />
          <button
            type="submit"
            className="inline-flex items-center gap-1 rounded-md bg-purple-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-800"
          >
            <Eye className="h-3.5 w-3.5" /> Act as this tenant
          </button>
        </form>
      </header>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card title="Identity" className="lg:col-span-2">
          <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
            <Detail label="Address" value={tenant.address} />
            <Detail label="Phone" value={tenant.phone} />
            <Detail label="From address" value={tenant.fromAddress} mono />
            <Detail label="Website" value={tenant.websiteUrl} />
            <Detail label="Created" value={new Date(tenant.createdAt).toLocaleDateString()} />
            <Detail
              label="Trial ends"
              value={tenant.trialEndsAt ? new Date(tenant.trialEndsAt).toLocaleDateString() : '—'}
            />
          </dl>
        </Card>

        <Card title="Lifecycle">
          <p className="mb-2 text-[11px] text-gray-500">
            Suspending blocks every user from logging in and freezes all writes. Cancelling marks
            the tenant for deletion (data retained per Privacy Policy).
          </p>
          <div className="flex flex-wrap gap-1.5">
            {(['ACTIVE', 'TRIAL', 'SUSPENDED', 'CANCELLED'] as const).map((s) => (
              <form key={s} action={updateTenantStatusAction}>
                <input type="hidden" name="tenantId" value={tenant.id} />
                <input type="hidden" name="status" value={s} />
                <button
                  type="submit"
                  disabled={tenant.status === s}
                  className={`rounded-md border px-2 py-1 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    tenant.status === s
                      ? 'border-gray-300 bg-gray-100 text-gray-700'
                      : 'border-gray-300 bg-white text-gray-700 hover:border-purple-400 hover:text-purple-700'
                  }`}
                >
                  {s.toLowerCase()}
                </button>
              </form>
            ))}
          </div>
        </Card>

        <Card
          title={
            <span className="inline-flex items-center gap-1.5">
              <MapPinned className="h-3.5 w-3.5 text-primary" />
              Markets ({tenant.markets.length})
            </span>
          }
          className="lg:col-span-2"
        >
          {tenant.markets.length === 0 ? (
            <p className="text-xs text-gray-500">
              No markets yet. Act as this tenant and create one in /admin/markets.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {tenant.markets.map((m) => (
                <li key={m.id} className="flex items-center justify-between py-1.5 text-xs">
                  <span className="font-medium text-gray-900">{m.name}</span>
                  <span className="text-gray-500">{m._count.partners} partners</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title={
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-primary" />
              Users ({tenant.users.length})
            </span>
          }
        >
          {tenant.users.length === 0 ? (
            <p className="text-xs text-gray-500">No users yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {tenant.users.map((u) => (
                <li key={u.id} className="py-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="truncate font-medium text-gray-900">{u.name}</span>
                    <Pill
                      tone="soft"
                      color={u.role === 'ADMIN' ? 'blue' : u.role === 'MANAGER' ? 'amber' : 'gray'}
                    >
                      {u.role}
                    </Pill>
                  </div>
                  <div className="truncate text-[10.5px] text-gray-500">{u.email}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-4 text-center text-[11px] text-gray-500">
        <Link href="/super-admin" className="hover:text-purple-700">
          ← All tenants
        </Link>
      </div>
    </div>
  );
}

function Detail({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[10.5px] font-semibold uppercase tracking-label text-gray-500">
        {label}
      </dt>
      <dd className={`text-gray-900 ${mono ? 'font-mono text-[11px]' : ''}`}>
        {value || <span className="text-gray-400">—</span>}
      </dd>
    </div>
  );
}
