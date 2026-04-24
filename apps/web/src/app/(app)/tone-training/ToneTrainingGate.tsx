/**
 * Server-side gate that decides whether to render the tone-training modal.
 *
 * Rules:
 *   • Only REPs see it — managers/admins can train from Settings when
 *     they start personally reaching out.
 *   • Status must still be NOT_STARTED — any other state means the rep
 *     has seen the modal already (dismissed it, completed it, or
 *     approved it).
 *   • The rep must have actually logged in (session exists).
 *
 * If any check fails, we return null and the layout stays clean.
 */

import { auth } from '@/auth';
import { prisma } from '@partnerradar/db';
import { isAIConfigured } from '@partnerradar/ai';
import { ToneTrainingModal } from './ToneTrainingModal';

export async function ToneTrainingGate() {
  const session = await auth();
  if (!session?.user) return null;
  if (session.user.role !== 'REP') return null;

  const user = await prisma.user
    .findUnique({
      where: { id: session.user.id },
      select: { aiToneTrainingStatus: true, name: true },
    })
    .catch(() => null);
  if (!user) return null;
  if (user.aiToneTrainingStatus !== 'NOT_STARTED') return null;

  return <ToneTrainingModal repName={user.name} aiConfigured={isAIConfigured()} />;
}
