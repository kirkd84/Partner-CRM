/**
 * /newsletters/drips/new — quick drip creation form.
 *
 * Just captures name + description + minimal audience filter +
 * trigger type. Steps get added on the detail page after the row
 * exists. Keeps the UX a 2-step flow: define the container, then
 * add content.
 */

import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Card } from '@partnerradar/ui';
import { NewDripClient } from './NewDripClient';

export const dynamic = 'force-dynamic';

export default async function NewDripPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const isManagerPlus =
    session.user.role === 'MANAGER' ||
    session.user.role === 'ADMIN' ||
    session.user.role === 'SUPER_ADMIN';
  if (!isManagerPlus) redirect('/radar');

  return (
    <div className="mx-auto max-w-3xl p-6">
      <Link
        href="/newsletters/drips"
        className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-primary"
      >
        <ArrowLeft className="h-3 w-3" /> Back to drips
      </Link>
      <h1 className="mt-1 text-xl font-semibold text-gray-900">New drip</h1>
      <p className="text-xs text-gray-500">
        Set up the audience + trigger. Once the drip exists, you&apos;ll add the email steps with
        day-offset cadences.
      </p>
      <Card>
        <NewDripClient />
      </Card>
    </div>
  );
}
