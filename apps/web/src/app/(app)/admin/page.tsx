import Link from 'next/link';
import { prisma } from '@partnerradar/db';
import { Card } from '@partnerradar/ui';
import { Users, MapPinned, ScrollText, ArrowRight } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function AdminOverviewPage() {
  const [userCount, marketCount, partnerCount, auditCount] = await Promise.all([
    prisma.user.count({ where: { active: true } }),
    prisma.market.count(),
    prisma.partner.count({ where: { archivedAt: null } }),
    prisma.auditLog.count(),
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

      <Card title="Phase 3 is live" className="mt-5">
        <p className="text-sm text-gray-700">
          You can invite users, toggle roles and markets, create new markets, and comb through every
          mutation that has touched the database. Phase 4 (Map, Hit List, Routes) is next.
        </p>
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
