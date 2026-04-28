import { prisma } from '@partnerradar/db';
import { auth } from '@/auth';
import { Avatar, Pill, Table, THead, TBody, TR, TH, TD } from '@partnerradar/ui';
import { UsersToolbar } from './UsersToolbar';
import { UserRowActions } from './UserRowActions';
import { activeTenantId } from '@/lib/tenant/context';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  const session = await auth();
  if (!session?.user) return null;
  const isAdmin = session.user.role === 'ADMIN' || session.user.role === 'SUPER_ADMIN';

  // Multi-tenant: scope users + markets to the active tenant. SUPER_ADMIN
  // with no act-as cookie sees nothing here — they should pick a tenant
  // first via /super-admin. Returning empty arrays is intentional rather
  // than leaking cross-tenant data.
  const tenantId = await activeTenantId(session);
  const tenantScope = tenantId ? { tenantId } : { tenantId: '__none__' };

  const [users, markets] = await Promise.all([
    prisma.user.findMany({
      where: tenantScope,
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      include: {
        markets: {
          include: { market: { select: { id: true, name: true } } },
        },
      },
    }),
    prisma.market.findMany({
      where: tenantScope,
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  const activeCount = users.filter((u) => u.active).length;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-card-border bg-white px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Users</h1>
          <p className="text-xs text-gray-500">
            {activeCount} active · {users.length - activeCount} deactivated · {users.length} total
          </p>
        </div>
        <div className="ml-auto">
          <UsersToolbar markets={markets} canCreateAdmin={isAdmin} />
        </div>
      </header>

      <div className="flex-1 overflow-auto bg-white">
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Email</TH>
              <TH>Role</TH>
              <TH>Markets</TH>
              <TH>Last login</TH>
              <TH>Status</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {users.map((u) => (
              <TR key={u.id}>
                <TD>
                  <div className="flex items-center gap-2">
                    <Avatar name={u.name} color={u.avatarColor} size="sm" />
                    <span className="font-medium text-gray-900">{u.name}</span>
                    {u.id === session.user.id && (
                      <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-label text-blue-700">
                        You
                      </span>
                    )}
                  </div>
                </TD>
                <TD>
                  <span className="text-gray-700">{u.email}</span>
                </TD>
                <TD>
                  <Pill
                    color={
                      u.role === 'ADMIN' ? '#a855f7' : u.role === 'MANAGER' ? '#2563eb' : '#6b7280'
                    }
                    tone="soft"
                  >
                    {u.role}
                  </Pill>
                </TD>
                <TD>
                  <div className="flex flex-wrap gap-1">
                    {u.markets.length === 0 ? (
                      <span className="text-xs text-gray-400">—</span>
                    ) : (
                      u.markets.map((um) => (
                        <span
                          key={um.marketId}
                          className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-700"
                        >
                          {um.market.name}
                          {um.isPrimary && <span className="ml-1 text-amber-600">★</span>}
                        </span>
                      ))
                    )}
                  </div>
                </TD>
                <TD>
                  {u.lastLoginAt ? (
                    <span className="text-xs text-gray-600">
                      {new Date(u.lastLoginAt).toLocaleDateString()}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">Never</span>
                  )}
                </TD>
                <TD>
                  {u.active ? (
                    <span className="inline-flex items-center gap-1 text-xs text-green-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                      <span className="h-1.5 w-1.5 rounded-full bg-gray-300" />
                      Deactivated
                    </span>
                  )}
                </TD>
                <TD className="text-right">
                  {u.id !== session.user.id && (
                    <UserRowActions
                      userId={u.id}
                      name={u.name}
                      role={u.role}
                      active={u.active}
                      markets={u.markets.map((m) => m.marketId)}
                      allMarkets={markets}
                      isAdmin={isAdmin}
                    />
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
    </div>
  );
}
