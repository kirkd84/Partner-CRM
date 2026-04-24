/**
 * Admin → Expenses — queue of submitted expenses with filter + bulk
 * approve/reject + reason capture. SPEC §6.6.
 *
 * Actions on each row are audit-logged. Bulk actions open a small
 * reason modal shared across selected rows so managers never have to
 * write "approved" ten times in a row.
 */
import { prisma } from '@partnerradar/db';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { Table, THead, TBody, TR, TH, TD, Pill, Avatar } from '@partnerradar/ui';
import { DollarSign } from 'lucide-react';
import { ExpenseRowActions } from './ExpenseRowActions';

export const dynamic = 'force-dynamic';

export default async function AdminExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;
  if (session.user.role === 'REP') redirect('/admin');

  const sp = await searchParams;
  const statusFilter = sp.status ?? 'all';

  const where: { approvalStatus?: 'AUTO_APPROVED' | 'PENDING' | 'APPROVED' | 'REJECTED' } = {};
  if (statusFilter === 'pending') where.approvalStatus = 'PENDING';
  else if (statusFilter === 'approved') where.approvalStatus = 'APPROVED';
  else if (statusFilter === 'auto') where.approvalStatus = 'AUTO_APPROVED';
  else if (statusFilter === 'rejected') where.approvalStatus = 'REJECTED';

  const expenses = await prisma.expense.findMany({
    where,
    orderBy: [{ approvalStatus: 'asc' }, { createdAt: 'desc' }],
    take: 100,
    include: {
      user: { select: { id: true, name: true, avatarColor: true } },
      partner: { select: { id: true, companyName: true, publicId: true } },
    },
  });

  const pendingCount = await prisma.expense.count({ where: { approvalStatus: 'PENDING' } });

  const isAdmin = session.user.role === 'ADMIN';
  const fmt = (n: number) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-card-border bg-white px-6 py-4">
        <DollarSign className="h-5 w-5 text-gray-500" />
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Expenses</h1>
          <p className="text-xs text-gray-500">
            {pendingCount} pending · {expenses.length} shown
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1 rounded-md border border-gray-200 bg-white p-0.5 text-xs">
          {(
            [
              ['all', 'All'],
              ['pending', 'Pending'],
              ['approved', 'Approved'],
              ['auto', 'Auto-approved'],
              ['rejected', 'Rejected'],
            ] as const
          ).map(([key, label]) => (
            <a
              key={key}
              href={`/admin/expenses${key === 'all' ? '' : `?status=${key}`}`}
              className={`rounded px-2.5 py-1 font-semibold ${
                statusFilter === key ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {label}
            </a>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-auto bg-white">
        {expenses.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-500">
            <DollarSign className="mx-auto h-8 w-8 text-gray-300" />
            <p className="mt-2">Nothing here for this filter.</p>
          </div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Rep</TH>
                <TH>Partner</TH>
                <TH>Category</TH>
                <TH className="text-right">Amount</TH>
                <TH>Description</TH>
                <TH>Date</TH>
                <TH>Status</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {expenses.map((e) => (
                <TR key={e.id}>
                  <TD>
                    <div className="flex items-center gap-2">
                      <Avatar name={e.user.name} color={e.user.avatarColor} size="sm" />
                      <span className="text-xs">{e.user.name}</span>
                    </div>
                  </TD>
                  <TD>
                    <a
                      href={`/partners/${e.partner.id}`}
                      className="text-xs text-primary hover:underline"
                    >
                      {e.partner.companyName}
                    </a>
                    <div className="font-mono text-[10px] text-gray-400">{e.partner.publicId}</div>
                  </TD>
                  <TD>
                    <Pill color="#6b7280" tone="soft">
                      {e.category}
                    </Pill>
                  </TD>
                  <TD className="text-right font-medium tabular-nums">{fmt(Number(e.amount))}</TD>
                  <TD>
                    <span className="text-xs text-gray-700">{e.description}</span>
                    {e.rejectedReason && (
                      <div className="mt-0.5 text-[11px] text-red-700">
                        Reason: {e.rejectedReason}
                      </div>
                    )}
                  </TD>
                  <TD>
                    <span className="text-xs text-gray-600">
                      {e.occurredOn.toLocaleDateString()}
                    </span>
                  </TD>
                  <TD>
                    <StatusBadge status={e.approvalStatus} />
                  </TD>
                  <TD className="text-right">
                    {e.approvalStatus === 'PENDING' ? (
                      <ExpenseRowActions expenseId={e.id} canAdmin={isAdmin} />
                    ) : (
                      <span className="text-[11px] text-gray-400">—</span>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: 'AUTO_APPROVED' | 'PENDING' | 'APPROVED' | 'REJECTED';
}) {
  const map = {
    AUTO_APPROVED: { color: '#10b981', label: 'Auto-approved' },
    PENDING: { color: '#f59e0b', label: 'Pending' },
    APPROVED: { color: '#22c55e', label: 'Approved' },
    REJECTED: { color: '#ef4444', label: 'Rejected' },
  }[status];
  return (
    <Pill color={map.color} tone="soft">
      {map.label}
    </Pill>
  );
}
