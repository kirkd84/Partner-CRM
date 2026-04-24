/**
 * Storm Cloud webhook receiver — Phase 5.
 *
 * Storm pushes events here when things happen on their side: new
 * project created, status changed, revenue booked, partner deactivated,
 * appointment synced, etc. The exact event shape isn't locked until
 * Kirk's team hands over docs, so this route is deliberately forgiving:
 * we accept any JSON, persist it raw to `WebhookEvent`, and (once we
 * know the real shapes) dispatch to typed handlers.
 *
 * Security:
 *   - HMAC signature check (STORM_WEBHOOK_SECRET). If unset, we still
 *     accept the event but mark it unverified — handy for local dev,
 *     dangerous in prod. The admin Integrations page surfaces a
 *     warning when secret is missing.
 *   - Raw body preservation for signature validation.
 *
 * Idempotency: Storm is expected to send an `x-storm-event-id` header.
 * We upsert by it so retries are safe.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { prisma } from '@partnerradar/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('x-storm-signature') ?? '';
  const eventId =
    req.headers.get('x-storm-event-id') ??
    `auto-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  const secret = process.env.STORM_WEBHOOK_SECRET;
  let verified = false;
  if (secret) {
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    try {
      const a = Buffer.from(expected, 'hex');
      const b = Buffer.from(signature, 'hex');
      verified = a.length === b.length && timingSafeEqual(a, b);
    } catch {
      verified = false;
    }
    if (!verified) {
      return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
    }
  }

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  // Persist to the WebhookEvent audit log. Graceful fallback if the
  // table doesn't exist yet (auto-migrate hasn't run for the first
  // deploy). In that case we still return 200 so Storm doesn't retry,
  // but log the miss to stderr.
  try {
    await prisma.webhookEvent.upsert({
      where: { externalEventId: eventId },
      create: {
        source: 'STORM',
        externalEventId: eventId,
        eventType: extractEventType(parsed) ?? 'unknown',
        verified,
        payload: parsed as object,
      },
      update: {
        // If we get the same event twice, keep the first-seen record.
      },
    });
  } catch (err) {
    console.error('[webhooks/storm] failed to persist WebhookEvent:', err);
  }

  // TODO(phase5): route to typed handlers once Storm event shapes land.
  // For now we just acknowledge; revenue sync + appointment sync run
  // on their own schedules via Inngest.

  return NextResponse.json({ ok: true, eventId, verified });
}

function extractEventType(payload: unknown): string | null {
  if (payload && typeof payload === 'object' && 'type' in payload) {
    const t = (payload as { type: unknown }).type;
    if (typeof t === 'string') return t;
  }
  return null;
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: 'Storm webhook receiver. POST signed events here.',
    signaturePresent: Boolean(process.env.STORM_WEBHOOK_SECRET),
  });
}
