import { auth } from '@/auth';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user) return null;
  const role = session.user.role;
  if (role !== 'MANAGER' && role !== 'ADMIN') redirect('/radar');

  return (
    <div className="max-w-[1400px] mx-auto p-6">
      <h1 className="text-xl font-semibold text-gray-900">Admin</h1>
      <p className="text-sm text-gray-500 mt-1">
        Users · Markets · Audit Log · Templates · Cadences · Integrations · Budget rules — lands in Phase 3+.
      </p>
    </div>
  );
}
