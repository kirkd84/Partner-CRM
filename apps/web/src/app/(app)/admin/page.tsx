import Link from 'next/link';
import { prisma } from '@partnerradar/db';
import { Card } from '@partnerradar/ui';
import { auth } from '@/auth';
import { Users, MapPinned, ScrollText, ArrowRight, Download } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function AdminOverviewPage() {
  const session = await auth();
  const userMarkets = session?.user?.markets ?? [];
  const isAdmin = session?.user?.role === 'ADMIN';

  const [userCount, marketCount, partnerCount, auditCount, accessibleMarkets] = await Promise.all([
    prisma.user.count({ where: { active: true } }),
    prisma.market.count(),
    prisma.partner.count({ where: { archivedAt: null } }),
    prisma.auditLog.count(),
    // Markets the caller can export from — admin sees all, manager their own.
    prisma.market.findMany({
      where: isAdmin ? {} : { id: { in: userMarkets } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  return (
    <div className="p-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold text-gray-900">Admin overview</h1>
        <p className="text-xs text-gray-500">
          Users, markets, audit log. SSO, templates, and budget rules arrive in later phases.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <AdminStat href="/admin/users" icon={Users} label="Active users" value={userCount} />
        <AdminStat
          href="/admin/markets"
          icon={MapPinned}
          label="Markets"
          value={marketCount}
          sub={`${partnerCount} active partners`}
        />
        <AdminStat
          href="/admin/audit-log"
          icon={ScrollText}
          label="Audit entries"
          value={auditCount}
        />
      </div>

      <Card title="Admin essentials" className="mt-5">
        <p className="text-sm text-gray-700">
          You can invite users, toggle roles and markets, create new markets, and comb through every
          mutation that has touched the database. The Map, Hit List, and Routes tools live in the
          main nav.
        </p>
      </Card>

      {/* Export + backup section. CSV streams from the API route — clicking
          the link triggers a file download. Per-market links narrow the
          export to one market's book; the "All markets" link uses no
          marketId filter so admin gets everything they can see. */}
      <Card
        title={
          <span className="inline-flex items-center gap-1.5">
            <Download className="h-3.5 w-3.5 text-primary" />
            Export &amp; backups
          </span>
        }
        className="mt-5"
      >
        <p className="text-xs text-gray-500">
          Download partner data as CSV. Useful for backups, audits, or onboarding a new manager.
          Admins see every market; managers see only their own. Reps can&apos;t bulk-export.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href="/api/admin/partners/export"
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:border-primary hover:text-primary"
          >
            <Download className="h-3.5 w-3.5" /> All markets ({partnerCount})
          </a>
          {accessibleMarkets.map((m) => (
            <a
              key={m.id}
              href={`/api/admin/partners/export?marketId=${encodeURIComponent(m.id)}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 transition hover:border-primary hover:text-primary"
            >
              <Download className="h-3 w-3" /> {m.name}
            </a>
          ))}
          <a
            href="/api/admin/partners/export?includeArchived=1"
            className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-600 transition hover:border-primary hover:text-primary"
          >
            <Download className="h-3 w-3" /> All + archived
          </a>
        </div>
      </Card>
    </div>
  );
}

function AdminStat({
  href,
  icon: Icon,
  label,
  value,
  sub,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  value: number;
  sub?: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-lg border border-card-border bg-white p-4 shadow-card transition hover:border-blue-200 hover:shadow-md"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-100">
        <Icon className="h-5 w-5" />
      </span>
      <div className="flex-1">
        <div className="text-[10.5px] font-medium uppercase tracking-label text-gray-500">
          {label}
        </div>
        <div className="mt-0.5 text-2xl font-semibold text-gray-900">{value}</div>
        {sub && <div className="text-xs text-gray-500">{sub}</div>}
      </div>
      <ArrowRight className="h-4 w-4 text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-blue-500" />
    </Link>
  );
}
