import { Prisma, prisma } from '@partnerradar/db';
import { Table, THead, TBody, TR, TH } from '@partnerradar/ui';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { AuditFilters, AuditRow } from './AuditClient';
import { activeTenantId } from '@/lib/tenant/context';

export const dynamic = 'force-dynamic';

type Search = {
  user?: string;
  entity?: string;
  action?: string;
  from?: string;
  to?: string;
};

const PAGE_SIZE = 50;

export default async function AdminAuditLogPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const session = await auth();
  if (!session?.user) return null;
  if (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN') redirect('/admin');
  const params = await searchParams;

  // Multi-tenant: scope audit log to the active tenant. Three cases:
  //   (a) Tenant ADMIN — only their tenant's rows.
  //   (b) SUPER_ADMIN acting-as a tenant — only that tenant's rows.
  //   (c) SUPER_ADMIN with no act-as cookie — see EVERYTHING (super-admin
  //       audit log is the sole legitimate cross-tenant view; without it
  //       Copayee can't audit its own super-admin act-as actions).
  const tenantId = await activeTenantId(session);
  const isCrossTenantSuperAdmin = session.user.role === 'SUPER_ADMIN' && tenantId == null;

  const where: Prisma.AuditLogWhereInput = {};
  if (!isCrossTenantSuperAdmin) {
    where.tenantId = tenantId ?? '__none__';
  }
  if (params.user) where.userId = params.user;
  if (params.entity) where.entityType = params.entity;
  if (params.action) where.action = params.action;
  if (params.from || params.to) {
    where.createdAt = {};
    if (params.from) where.createdAt.gte = new Date(params.from);
    if (params.to) {
      const to = new Date(params.to);
      to.setHours(23, 59, 59, 999);
      where.createdAt.lte = to;
    }
  }

  const [rows, users, entityTypes, actions, totalCount] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE,
    }),
    prisma.user.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    // Distinct entity types already in the log
    prisma.auditLog
      .findMany({
        distinct: ['entityType'],
        select: { entityType: true },
        orderBy: { entityType: 'asc' },
      })
      .then((r) => r.map((x) => x.entityType)),
    prisma.auditLog
      .findMany({
        distinct: ['action'],
        select: { action: true },
        orderBy: { action: 'asc' },
      })
      .then((r) => r.map((x) => x.action)),
    prisma.auditLog.count({ where }),
  ]);

  // Hydrate userId → name
  const userMap = new Map(users.map((u) => [u.id, u.name]));

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-card-border bg-white px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Audit log</h1>
          <p className="text-xs text-gray-500">
            {totalCount.toLocaleString()} entr{totalCount === 1 ? 'y' : 'ies'}
            {rows.length < totalCount ? ` · newest ${rows.length} shown` : ''}
          </p>
        </div>
      </header>

      <AuditFilters users={users} entityTypes={entityTypes} actions={actions} />

      <div className="flex-1 overflow-auto bg-white">
        <Table>
          <THead>
            <TR>
              <TH>When</TH>
              <TH>User</TH>
              <TH>Entity</TH>
              <TH>Action</TH>
              <TH>Target ID</TH>
              <TH className="text-right">Diff</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => (
              <AuditRow
                key={r.id}
                row={{
                  id: r.id,
                  createdAt: r.createdAt.toISOString(),
                  userId: r.userId,
                  userName: r.userId ? (userMap.get(r.userId) ?? '—') : 'system',
                  entityType: r.entityType,
                  entityId: r.entityId,
                  action: r.action,
                  diff: r.diff,
                }}
              />
            ))}
          </TBody>
        </Table>
        {rows.length === 0 && (
          <div className="px-6 py-10 text-center text-sm text-gray-400">
            No audit entries match those filters.
          </div>
        )}
      </div>
    </div>
  );
}
