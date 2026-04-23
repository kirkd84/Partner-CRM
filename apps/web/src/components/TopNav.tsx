'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import {
  Bell,
  Calendar,
  ChevronDown,
  Plus,
  Radar as RadarIcon,
  Search,
  Users,
  ListTodo,
  BarChart3,
  Settings as SettingsIcon,
} from 'lucide-react';
import { Avatar, cn } from '@partnerradar/ui';
import { tenant } from '@partnerradar/config';

const NAV_ITEMS = [
  { href: '/radar', label: 'Radar', icon: RadarIcon },
  { href: '/partners', label: 'Partners', icon: Users },
  { href: '/lists', label: 'Lists', icon: ListTodo, hasDropdown: true },
  { href: '/reports', label: 'Reports', icon: BarChart3, managerPlus: true },
  { href: '/admin', label: 'Admin', icon: SettingsIcon, managerPlus: true },
] as const;

export function TopNav() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const role = session?.user.role ?? 'REP';
  const isManagerPlus = role === 'MANAGER' || role === 'ADMIN';
  const t = tenant();

  return (
    <header className="sticky top-0 z-40 h-[52px] bg-nav-bg border-b border-black/20 flex items-center px-4 gap-4">
      {/* Logo */}
      <Link href="/radar" className="flex items-center gap-2 text-white font-semibold text-sm">
        <div className="h-7 w-7 rounded-md bg-primary flex items-center justify-center text-white text-xs font-bold">
          PR
        </div>
        <span className="hidden sm:inline">{t.brandName}</span>
      </Link>

      {/* Quick add + primary nav */}
      <div className="flex items-center gap-1 ml-2">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md bg-white/10 hover:bg-white/15 text-nav-text px-3 py-1.5 text-sm font-medium"
        >
          <Plus className="h-4 w-4" /> New
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </div>

      <nav className="flex items-center gap-1 ml-2">
        {NAV_ITEMS.map((item) => {
          if (item.managerPlus && !isManagerPlus) return null;
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-nav-text/80 hover:text-white',
                active && 'bg-nav-active text-white hover:text-white',
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
              {item.hasDropdown && <ChevronDown className="h-3 w-3 opacity-60" />}
            </Link>
          );
        })}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          className="h-8 w-8 rounded-md inline-flex items-center justify-center text-nav-text/70 hover:text-white hover:bg-white/10"
          aria-label="Search"
        >
          <Search className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="h-8 w-8 rounded-md inline-flex items-center justify-center text-nav-text/70 hover:text-white hover:bg-white/10"
          aria-label="Calendar"
        >
          <Calendar className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="relative h-8 w-8 rounded-md inline-flex items-center justify-center text-nav-text/70 hover:text-white hover:bg-white/10"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute -right-0.5 -top-0.5 h-4 w-4 rounded-full bg-danger text-[10px] text-white font-bold flex items-center justify-center">
            0
          </span>
        </button>
        {session?.user && (
          <div className="relative group">
            <button
              type="button"
              className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-white/10"
            >
              <Avatar
                name={session.user.name ?? 'User'}
                color={session.user.avatarColor}
                size="md"
              />
              <span className="hidden md:inline text-sm text-white">{session.user.name}</span>
              <ChevronDown className="h-3 w-3 text-white/70" />
            </button>
            <div className="absolute right-0 top-full mt-1 w-48 rounded-md bg-white shadow-lg border border-gray-200 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition">
              <div className="p-2 text-xs text-gray-500 border-b border-gray-100">
                Signed in as <strong>{session.user.email}</strong>
              </div>
              <Link href="/settings" className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                Settings
              </Link>
              <button
                type="button"
                onClick={() => signOut({ redirectTo: '/login' })}
                className="block w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
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
