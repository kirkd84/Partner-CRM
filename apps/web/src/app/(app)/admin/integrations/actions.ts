'use server';
import { auth } from '@/auth';
import { stormClient } from '@partnerradar/integrations';

/** Admin-only wrapper around the Storm client's testConnection call. */
export async function testStormConnection(): Promise<{ ok: boolean; message: string }> {
  const session = await auth();
  if (session?.user?.role !== 'ADMIN') {
    throw new Error('Admin only');
  }
  return stormClient().testConnection();
}
