/**
 * /super-admin route group — only SUPER_ADMIN sees this. Layout is
 * deliberately distinct (purple chrome) so it's obvious when you're
 * operating across tenants vs. inside one.
 */

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/auth';
import { Crown, Building2, Plus } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'SUPER_ADMIN') redirect('/radar');

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="border-b-2 border-purple-300 bg-gradient-to-r from-purple-900 to-purple-700 text-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <Crown className="h-5 w-5 text-amber-300" />
          <div className="flex-1">
            <Link href="/super-admin" className="text-sm font-semibold">
              Super Admin
            </Link>
            <p className="text-[10.5px] text-purple-200">Cross-tenant operator console — Copayee</p>
          </div>
          <nav className="flex items-center gap-1 text-xs">
            <Link
              href="/super-admin"
              className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 hover:bg-purple-800"
            >
              <Building2 className="h-3.5 w-3.5" /> Tenants
            </Link>
            <Link
              href="/super-admin/tenants/new"
              className="inline-flex items-center gap-1 rounded-md bg-purple-800 px-2.5 py-1.5 hover:bg-purple-900"
            >
              <Plus className="h-3.5 w-3.5" /> New tenant
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
