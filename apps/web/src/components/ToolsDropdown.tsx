'use client';

/**
 * Tools dropdown — replaces the older "Lists" tab. Groups feature
 * areas that aren't part of the day-to-day rep flow but get used
 * regularly enough that they need a single click from anywhere.
 *
 * Items + their managerPlus gates mirror the role logic from TopNav.
 * Generate Leads is reps+managers+admins (it's how a rep finds new
 * names to call); Studio + Reports are manager+; Hit List + Events
 * are everyone.
 */

import Link from 'next/link';
import {
  Wrench,
  ChevronDown,
  Ticket,
  Sparkles,
  BarChart3,
  ListTodo,
  Search,
  Camera,
  Users2,
  Mail,
  Cake,
} from 'lucide-react';

const TOOLS: Array<{
  href: string;
  label: string;
  description: string;
  icon: typeof Wrench;
  managerPlus?: boolean;
}> = [
  {
    href: '/lists',
    label: 'Hit List',
    description: 'Today’s door-knock route',
    icon: ListTodo,
  },
  {
    href: '/events',
    label: 'Events',
    description: 'Schedule + invite + check-in',
    icon: Ticket,
  },
  {
    href: '/generate-leads',
    label: 'Generate Leads',
    description: 'Lasso a territory or scrape a board',
    icon: Search,
  },
  {
    href: '/scan',
    label: 'Scan card',
    description: 'Photograph a business card',
    icon: Camera,
  },
  {
    href: '/networking-groups',
    label: 'Networking groups',
    description: 'BNI, CAI, Chamber — meetings + ROI',
    icon: Users2,
  },
  {
    href: '/newsletters',
    label: 'Newsletters',
    description: 'Email blast to your partners',
    icon: Mail,
    managerPlus: true,
  },
  {
    href: '/touchpoints',
    label: 'Touchpoints',
    description: 'Birthdays, anniversaries, milestones',
    icon: Cake,
    managerPlus: true,
  },
  {
    href: '/studio',
    label: 'Studio',
    description: 'Marketing flyers + business cards',
    icon: Sparkles,
    managerPlus: true,
  },
  {
    href: '/reports',
    label: 'Reports',
    description: 'Activity, funnel, ROI, expenses',
    icon: BarChart3,
    managerPlus: true,
  },
];

export function ToolsDropdown({
  isManagerPlus,
  active,
}: {
  isManagerPlus: boolean;
  active: boolean;
}) {
  const visible = TOOLS.filter((t) => !t.managerPlus || isManagerPlus);
  return (
    <div className="group relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        className={
          'inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] font-semibold transition-colors sm:px-2.5 ' +
          (active
            ? 'bg-nav-active text-white shadow-sm'
            : 'text-white/85 hover:bg-white/10 hover:text-white')
        }
      >
        <Wrench className="h-4 w-4" />
        <span className="hidden md:inline">Tools</span>
        <ChevronDown className="hidden h-3 w-3 opacity-70 md:block" />
      </button>
      <div className="invisible absolute left-0 top-full z-50 pt-1 opacity-0 transition group-hover:visible group-hover:opacity-100">
        <div role="menu" className="w-64 rounded-md border border-gray-200 bg-white shadow-lg">
          <div className="border-b border-gray-100 px-3 py-2 text-[10.5px] font-semibold uppercase tracking-label text-gray-500">
            Tools
          </div>
          <ul className="py-1">
            {visible.map((t) => {
              const Icon = t.icon;
              return (
                <li key={t.href}>
                  <Link
                    href={t.href}
                    className="flex items-start gap-2.5 px-3 py-2 text-sm text-gray-800 hover:bg-gray-50"
                  >
                    <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                    <span className="min-w-0">
                      <span className="block font-medium">{t.label}</span>
                      <span className="block text-[10.5px] text-gray-500">{t.description}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

// Active-route detection helper for the parent nav. Returns true when
// the current pathname matches any tool href.
export function isOnATool(pathname: string): boolean {
  return TOOLS.some((t) => pathname === t.href || pathname.startsWith(t.href + '/'));
}
