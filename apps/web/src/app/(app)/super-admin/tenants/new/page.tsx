/**
 * /super-admin/tenants/new — create a new tenant + seed its first admin.
 */

import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { Card } from '@partnerradar/ui';
import { NewTenantForm } from './NewTenantForm';

export const dynamic = 'force-dynamic';

export default async function NewTenantPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== 'SUPER_ADMIN') redirect('/radar');

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <header className="mb-4">
        <h1 className="text-xl font-semibold text-gray-900">Create new tenant</h1>
        <p className="text-xs text-gray-500">
          Provisions a new isolated workspace + seeds the first ADMIN user. Subsequent admins and
          reps get invited from inside the tenant&apos;s own /admin/users page.
        </p>
      </header>

      <Card>
        <NewTenantForm />
      </Card>
    </div>
  );
}
