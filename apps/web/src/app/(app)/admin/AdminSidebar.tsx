'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Users,
  MapPinned,
  ScrollText,
  Settings2,
  Sparkles,
  Inbox,
  CalendarClock,
  Plug,
  DollarSign,
  ShieldCheck,
  Mail,
  Workflow,
  Trophy,
  ListChecks,
  Rocket,
  Layers,
  Tag,
  Building2,
} from 'lucide-react';

// Note: state-boards + import-partners (CSV book) used to live here too,
// but they've moved to /generate-leads where every lead-source path
// (lasso, scanner, state boards, CSV import) sits side-by-side. Admin
// is for true admin functions only — config, queues, audit.
const ITEMS = [
  { href: '/admin', label: 'Overview', icon: Settings2, adminOnly: false },
  { href: '/admin/users', label: 'Users', icon: Users, adminOnly: false },
  { href: '/admin/markets', label: 'Markets', icon: MapPinned, adminOnly: false },
  { href: '/admin/stages', label: 'Partner stages', icon: Layers, adminOnly: false },
  { href: '/admin/tags', label: 'Partner tags', icon: Tag, adminOnly: false },
  {
    href: '/admin/appointment-types',
    label: 'Appointment types',
    icon: CalendarClock,
    adminOnly: false,
  },
  { href: '/admin/expenses', label: 'Expenses', icon: DollarSign, adminOnly: false },
  { href: '/admin/budget-rules', label: 'Budget rules', icon: ShieldCheck, adminOnly: false },
  { href: '/admin/templates', label: 'Message templates', icon: Mail, adminOnly: false },
  { href: '/admin/cadences', label: 'Cadences', icon: Workflow, adminOnly: false },
  { href: '/admin/cadence-queue', label: 'Cadence queue', icon: Sparkles, adminOnly: false },
  { href: '/admin/scraped-leads', label: 'Prospect queue', icon: Inbox, adminOnly: false },
  { href: '/admin/scrape-jobs', label: 'Scrape jobs', icon: ListChecks, adminOnly: false },
  { href: '/admin/reliability', label: 'Partner reliability', icon: Trophy, adminOnly: false },
  { href: '/admin/integrations', label: 'Integrations', icon: Plug, adminOnly: true },
  { href: '/admin/tenant', label: 'Tenant config', icon: Building2, adminOnly: true },
  {
    href: '/admin/launch-checklist',
    label: 'Launch checklist',
    icon: Rocket,
    adminOnly: true,
  },
  { href: '/admin/audit-log', label: 'Audit log', icon: ScrollText, adminOnly: true },
];

export function AdminSidebar({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  return (
    <aside className="w-56 shrink-0 border-r border-card-border bg-white">
      <div className="flex items-center gap-2 border-b border-card-border px-4 py-3 text-[11px] font-semibold uppercase tracking-label text-gray-500">
        <Sparkles className="h-3.5 w-3.5" />
        Admin
      </div>
      <nav className="p-2">
        {ITEMS.filter((i) => !i.adminOnly || isAdmin).map((i) => {
          const active =
            pathname === i.href || (i.href !== '/admin' && pathname?.startsWith(i.href));
          return (
            <Link
              key={i.href}
              href={i.href}
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                active ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <i.icon className="h-4 w-4" />
              {i.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
