import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { AdminSidebar } from './AdminSidebar';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const role = session.user.role;
  if (role !== 'MANAGER' && role !== 'ADMIN') redirect('/radar');

  return (
    <div className="flex h-full">
      <AdminSidebar isAdmin={role === 'ADMIN'} />
      <div className="min-w-0 flex-1 overflow-auto bg-canvas">{children}</div>
    </div>
  );
}
