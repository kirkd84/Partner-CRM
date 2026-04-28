import { TopNav } from '@/components/TopNav';
import { CommandPalette } from '@/components/CommandPalette';
import { ToneTrainingGate } from './tone-training/ToneTrainingGate';
import { auth } from '@/auth';
import { activeTenantId } from '@/lib/tenant/context';
import { prisma } from '@partnerradar/db';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Multi-tenant: load the active tenant's branding so the TopNav can
  // show the customer's name + color instead of the hardcoded fallback
  // from packages/config/tenant.ts. Falls back to the static config
  // when there's no active tenant (super-admin not acting-as).
  const session = await auth();
  const tenantId = await activeTenantId(session);
  const activeTenant = tenantId
    ? await prisma.tenant
        .findUnique({
          where: { id: tenantId },
          select: { name: true, primaryHex: true, status: true },
        })
        .catch(() => null)
    : null;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-canvas">
      <TopNav
        activeTenantName={activeTenant?.name ?? null}
        activeTenantPrimaryHex={activeTenant?.primaryHex ?? null}
      />
      <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      <CommandPalette />
      {/* Async server component — returns null unless the rep still needs training */}
      <ToneTrainingGate />
    </div>
  );
}
