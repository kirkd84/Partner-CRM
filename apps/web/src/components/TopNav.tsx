'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import {
  Bell,
  Calendar,
  ChevronDown,
  Clock,
  Plus,
  Radar as RadarIcon,
  Search,
  Users,
  ListTodo,
  BarChart3,
  Settings as SettingsIcon,
  type LucideIcon,
} from 'lucide-react';
import { Avatar, cn } from '@partnerradar/ui';
import { tenant } from '@partnerradar/config';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  hasDropdown?: boolean;
  managerPlus?: boolean;
}

const NAV_ITEMS: readonly NavItem[] = [
  { href: '/recent', label: 'Recent', icon: Clock, hasDropdown: true },
  { href: '/radar', label: 'Radar', icon: RadarIcon },
  { href: '/partners', label: 'Partners', icon: Users },
  { href: '/lists', label: 'Lists', icon: ListTodo, hasDropdown: true },
  { href: '/reports', label: 'Reports', icon: BarChart3, managerPlus: true },
  { href: '/admin', label: 'Admin', icon: SettingsIcon, managerPlus: true },
];

// Unread notification count — real count comes from tRPC in Phase 2
// activity feed integration. For now we show the seeded baseline.
const UNREAD_NOTIFICATIONS = 0;

export function TopNav() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const role = session?.user.role ?? 'REP';
  const isManagerPlus = role === 'MANAGER' || role === 'ADMIN';
  const t = tenant();

  return (
    <header className="sticky top-0 z-40 flex h-[52px] items-center gap-3 border-b border-black/30 bg-nav-bg px-4">
      {/* Logo */}
      <Link href="/radar" className="flex items-center gap-2 font-semibold text-white">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-[11px] font-bold tracking-tight text-white">
          PR
        </div>
        <span className="hidden text-[14px] sm:inline">{t.brandName}</span>
      </Link>

      {/* Quick add — solid button, more prominent like Storm's */}
      <div className="ml-2 flex items-center">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[13px] font-semibold text-white shadow-sm hover:bg-primary-hover"
        >
          <Plus className="h-4 w-4" /> New
          <ChevronDown className="h-3 w-3 opacity-80" />
        </button>
      </div>

      {/* Primary nav — Storm-style: bolder text, tighter pills */}
      <nav className="ml-1 flex items-center gap-0.5">
        {NAV_ITEMS.map((item) => {
          if (item.managerPlus && !isManagerPlus) return null;
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] font-semibold transition-colors',
                active
                  ? 'bg-nav-active text-white shadow-sm'
                  : 'text-white/85 hover:bg-white/10 hover:text-white',
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
              {item.hasDropdown && <ChevronDown className="h-3 w-3 opacity-70" />}
            </Link>
          );
        })}
      </nav>

      <div className="ml-auto flex items-center gap-1.5">
        {/* Search */}
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-white/80 hover:bg-white/10 hover:text-white"
          aria-label="Search"
        >
          <Search className="h-[18px] w-[18px]" />
        </button>
        {/* Calendar */}
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-white/80 hover:bg-white/10 hover:text-white"
          aria-label="Calendar"
        >
          <Calendar className="h-[18px] w-[18px]" />
        </button>
        {/* Notifications — prominent red badge with unread count, Storm-style */}
        <button
          type="button"
          className="relative inline-flex h-8 w-8 items-center justify-center rounded-md text-white/80 hover:bg-white/10 hover:text-white"
          aria-label={`Notifications${UNREAD_NOTIFICATIONS ? ` (${UNREAD_NOTIFICATIONS} unread)` : ''}`}
        >
          <Bell className="h-[18px] w-[18px]" />
          {UNREAD_NOTIFICATIONS > 0 && (
            <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold tabular-nums text-white ring-2 ring-nav-bg">
              {UNREAD_NOTIFICATIONS > 99 ? '99+' : UNREAD_NOTIFICATIONS}
            </span>
          )}
        </button>
        {/* User menu */}
        {session?.user && (
          <div className="group relative ml-1">
            <button
              type="button"
              className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-white/10"
            >
              <Avatar
                name={session.user.name ?? 'User'}
                color={session.user.avatarColor}
                size="md"
              />
              <span className="hidden text-[13px] font-semibold text-white md:inline">
                {session.user.name}
              </span>
              <ChevronDown className="h-3 w-3 text-white/70" />
            </button>
            <div className="invisible absolute right-0 top-full mt-1 w-52 rounded-md border border-gray-200 bg-white opacity-0 shadow-lg transition group-hover:visible group-hover:opacity-100">
              <div className="border-b border-gray-100 p-2.5 text-xs text-gray-500">
                Signed in as <strong className="text-gray-900">{session.user.email}</strong>
              </div>
              <Link
                href="/settings"
                className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Settings
              </Link>
              <button
                type="button"
                onClick={() => signOut({ redirectTo: '/login' })}
                className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
              >
                Sign out
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
