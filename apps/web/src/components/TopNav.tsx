'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { BrandLogo } from '@/components/BrandLogo';
import {
  Bell,
  Calendar,
  ChevronDown,
  Clock,
  Map as MapIcon,
  Plus,
  Radar as RadarIcon,
  Search,
  Users,
  ListTodo,
  BarChart3,
  Settings as SettingsIcon,
  Ticket,
  Sparkles,
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
  { href: '/map', label: 'Map', icon: MapIcon },
  { href: '/lists', label: 'Lists', icon: ListTodo, hasDropdown: true },
  { href: '/events', label: 'Events', icon: Ticket },
  { href: '/studio', label: 'Studio', icon: Sparkles, managerPlus: true },
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
    <header className="sticky top-0 z-40 flex h-[52px] shrink-0 items-center gap-2 border-b border-black/30 bg-nav-bg px-3 sm:gap-3 sm:px-4">
      {/* Logo — 2-tone handshake glyph, no background chip, larger */}
      <Link href="/radar" className="flex shrink-0 items-center gap-2 font-semibold text-white">
        <BrandLogo className="h-8 w-auto" />
        <span className="hidden text-[14px] md:inline">{t.brandName}</span>
      </Link>

      {/* Quick add — icon-only on mobile, full button from sm+ */}
      <div className="shrink-0">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2 py-1.5 text-[13px] font-semibold text-white shadow-sm hover:bg-primary-hover sm:px-3"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">New</span>
          <ChevronDown className="hidden h-3 w-3 opacity-80 sm:block" />
        </button>
      </div>

      {/*
        Primary nav — on mobile, we hide labels and let the icons do the
        talking; the whole strip scrolls horizontally so no item falls off
        the edge. At sm+ the labels come back.
      */}
      <nav
        className="ml-1 flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="Primary"
      >
        {NAV_ITEMS.map((item) => {
          if (item.managerPlus && !isManagerPlus) return null;
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] font-semibold transition-colors sm:px-2.5',
                active
                  ? 'bg-nav-active text-white shadow-sm'
                  : 'text-white/85 hover:bg-white/10 hover:text-white',
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden md:inline">{item.label}</span>
              {item.hasDropdown && <ChevronDown className="hidden h-3 w-3 opacity-70 md:block" />}
            </Link>
          );
        })}
      </nav>

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        {/* Search */}
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-white/80 hover:bg-white/10 hover:text-white"
          aria-label="Search"
        >
          <Search className="h-[18px] w-[18px]" />
        </button>
        {/* Calendar */}
        <Link
          href="/calendar"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-white/80 hover:bg-white/10 hover:text-white"
          aria-label="Calendar"
        >
          <Calendar className="h-[18px] w-[18px]" />
        </Link>
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
        {/* User menu — hover-controlled. The wrapper panel uses `pt-1`
            instead of `mt-1` so the gap between the avatar button and
            the visible menu is part of the hoverable area (otherwise
            moving the mouse across it closed the menu prematurely). */}
        {session?.user && (
          <div className="group relative ml-1">
            <button
              type="button"
              aria-haspopup="menu"
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
              <ChevronDown className="h-3 w-3 text-white/70 transition-transform group-hover:rotate-180" />
            </button>
            {/* Wrapper uses pt-1 (padding, not margin) so the 4px gap
                between the trigger and the visible panel is part of
                the hover area — crossing it with the mouse keeps the
                menu open. */}
            <div className="invisible absolute right-0 top-full pt-1 opacity-0 transition group-hover:visible group-hover:opacity-100">
              <div
                role="menu"
                className="w-52 rounded-md border border-gray-200 bg-white shadow-lg"
              >
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
          </div>
        )}
      </div>
    </header>
  );
}
