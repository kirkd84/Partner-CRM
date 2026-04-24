'use server';

/**
 * Tone training onboarding actions.
 *
 * Flow:
 *   1. Rep pastes 3–10 real sample messages (email or SMS) into the
 *      modal. We stash them in AIToneSample rows so they're kept for
 *      re-training if the profile drifts later.
 *   2. We call extractTone() (Claude Haiku) to turn samples into a
 *      ToneProfile JSON and persist it on User.aiToneProfile.
 *   3. User.aiToneTrainingStatus advances NOT_STARTED → IN_PROGRESS →
 *      CALIBRATED. The modal won't re-open on login once CALIBRATED
 *      (or REP_APPROVED, which REPs set by confirming the profile).
 *
 * Everything here is rep-scoped — you can only train your own tone.
 */

import { revalidatePath } from 'next/cache';
import { prisma, Prisma } from '@partnerradar/db';
import { auth } from '@/auth';
import { extractTone, isAIConfigured } from '@partnerradar/ai';

export interface ToneSampleInput {
  text: string;
  channel: 'email' | 'sms' | 'both';
}

const MIN_SAMPLES = 3;
const MAX_SAMPLES = 10;
const MIN_SAMPLE_LEN = 20;
const MAX_SAMPLE_LEN = 4000;

async function assertSelf() {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');
  return session;
}

/**
 * Save samples + run the extraction. Returns the resulting profile so
 * the modal can show a one-line summary ("Warm and direct, avg. 18
 * words/sentence") without a second DB hit.
 */
export async function saveSamplesAndExtractTone(samples: ToneSampleInput[]): Promise<{
  ok: boolean;
  profileSummary?: string;
  skipped?: 'ai-not-configured';
  error?: string;
}> {
  const session = await assertSelf();

  const clean = samples
    .map((s) => ({ text: s.text.trim(), channel: s.channel }))
    .filter((s) => s.text.length >= MIN_SAMPLE_LEN && s.text.length <= MAX_SAMPLE_LEN);
  if (clean.length < MIN_SAMPLES) {
    return {
      ok: false,
      error: `At least ${MIN_SAMPLES} samples of ≥${MIN_SAMPLE_LEN} chars needed`,
    };
  }
  if (clean.length > MAX_SAMPLES) clean.length = MAX_SAMPLES;

  // Persist samples regardless of whether extraction succeeds so we
  // don't lose what the rep pasted. Wipe old samples first — a re-run
  // should replace, not append, otherwise the profile drifts.
  await prisma.$transaction([
    prisma.aIToneSample.deleteMany({ where: { userId: session.user.id } }),
    prisma.aIToneSample.createMany({
      data: clean.map((s) => ({
        userId: session.user.id,
        kind: s.channel === 'sms' ? 'SMS' : 'EMAIL', // 'both' → EMAIL bucket; quirks still surface
        sample: s.text,
        channel: s.channel,
      })),
    }),
    prisma.user.update({
      where: { id: session.user.id },
      data: { aiToneTrainingStatus: 'IN_PROGRESS' },
    }),
  ]);

  // No Anthropic key? Mark IN_PROGRESS and let Kirk set the key later,
  // at which point an admin can re-run the extraction for every rep.
  if (!isAIConfigured()) {
    revalidatePath('/settings');
    return {
      ok: true,
      skipped: 'ai-not-configured',
      profileSummary:
        'Samples saved — your tone profile will be extracted once the Anthropic key is configured.',
    };
  }

  try {
    const profile = await extractTone(clean.map((s) => s.text));
    await prisma.$transaction([
      prisma.user.update({
        where: { id: session.user.id },
        data: {
          aiToneProfile: profile as unknown as Prisma.InputJsonValue,
          aiToneTrainingStatus: 'CALIBRATED',
        },
      }),
      prisma.auditLog.create({
        data: {
          userId: session.user.id,
          entityType: 'user',
          entityId: session.user.id,
          action: 'tone_calibrated',
          diff: {
            sampleCount: clean.length,
            formality: profile.formality,
            preferredLength: profile.preferredLength,
          } as Prisma.InputJsonValue,
        },
      }),
    ]);
    revalidatePath('/settings');
    return {
      ok: true,
      profileSummary: summarizeProfile(profile),
    };
  } catch (err) {
    // Extraction failed — keep samples, leave status at IN_PROGRESS so
    // the rep can retry (or an admin can kick it off later).
    const msg = err instanceof Error ? err.message : 'extraction failed';
    return { ok: false, error: msg };
  }
}

/**
 * Rep confirms the extracted profile looks right. Moves status to
 * REP_APPROVED and is what flips drafts from suggest-only to
 * suggest-with-confidence. Autonomous-send toggle in settings is a
 * separate gate (requires 5 successful approvals).
 */
export async function approveExtractedTone(): Promise<void> {
  const session = await assertSelf();
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { aiToneTrainingStatus: true, aiToneProfile: true },
  });
  if (!user) throw new Error('NOT_FOUND');
  if (user.aiToneTrainingStatus !== 'CALIBRATED') {
    throw new Error('Tone must be calibrated first');
  }
  await prisma.user.update({
    where: { id: session.user.id },
    data: { aiToneTrainingStatus: 'REP_APPROVED' },
  });
  revalidatePath('/settings');
  revalidatePath('/');
}

/**
 * Dismiss the onboarding modal without running extraction. Status
 * moves to IN_PROGRESS so the modal doesn't auto-reopen on every page
 * load — the rep can come back from /settings when ready.
 */
export async function dismissToneTraining(): Promise<void> {
  const session = await assertSelf();
  await prisma.user.update({
    where: { id: session.user.id },
    data: { aiToneTrainingStatus: 'IN_PROGRESS' },
  });
  revalidatePath('/');
}

function summarizeProfile(p: {
  formality: number;
  preferredLength: 'short' | 'medium' | 'long';
  emojiRate: number;
  avgSentenceLength: number;
  quirks: string[];
}): string {
  const formalityLabel =
    p.formality <= 3
      ? 'very casual'
      : p.formality <= 5
        ? 'casual'
        : p.formality <= 7
          ? 'polished'
          : 'formal';
  const emoji = p.emojiRate > 0.5 ? 'with emojis' : p.emojiRate > 0.1 ? 'some emojis' : 'no emojis';
  const quirk = p.quirks[0] ? ` · quirk: "${p.quirks[0]}"` : '';
  return `${formalityLabel} · ${p.preferredLength} · ${emoji} · ~${Math.round(
    p.avgSentenceLength,
  )} words/sentence${quirk}`;
}
