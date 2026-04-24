/**
 * Google Calendar sync worker — SPEC §6.4.
 *
 * Two entry points, same work:
 *   • `partner-portal/google-calendar.connected` — event sent by the
 *     OAuth callback the instant a rep finishes connecting, so they
 *     see events within seconds instead of waiting for the next cron.
 *   • `every 15 minutes` cron — fires across ALL active Google
 *     connections; keeps CalendarEventCache fresh.
 *
 * For each connection:
 *   1. Decrypt the refresh token.
 *   2. Exchange it for a fresh access token (Google access tokens
 *      expire in an hour; we don't bother caching them).
 *   3. List events in a ±30-day window for each configured calendarId.
 *   4. Upsert into CalendarEventCache (unique on userId + externalEventId
 *      + provider so re-runs don't duplicate).
 *   5. Update lastSyncedAt + clear any sync error.
 *
 * Errors are persisted to `syncError` on the connection so /settings
 * can surface them to the rep, then the function exits cleanly so the
 * next user's sync still runs. Never let one bad connection break
 * the whole cron.
 */
import { inngest } from '../inngest-client';
import { prisma } from '@partnerradar/db';
import { decryptSecret, isEncryptionConfigured } from '@partnerradar/integrations';

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

// ─── Shared worker logic ─────────────────────────────────────────────
async function syncOneConnection(connectionId: string): Promise<{
  ok: boolean;
  synced: number;
  error?: string;
}> {
  const conn = await prisma.calendarConnection.findUnique({
    where: { id: connectionId },
  });
  if (!conn) return { ok: false, synced: 0, error: 'connection not found' };
  if (conn.provider !== 'google') {
    return { ok: false, synced: 0, error: `skipped — provider is ${conn.provider}` };
  }
  if (!conn.refreshTokenEncrypted) {
    return { ok: false, synced: 0, error: 'no refresh token stored' };
  }
  if (!isEncryptionConfigured()) {
    return { ok: false, synced: 0, error: 'ENCRYPTION_KEY not configured' };
  }
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return { ok: false, synced: 0, error: 'GOOGLE_CLIENT_ID / SECRET missing' };
  }

  // ── Step 1: refresh the access token ──
  let accessToken: string;
  try {
    const refreshToken = decryptSecret(conn.refreshTokenEncrypted);
    const res = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`refresh token exchange failed: ${res.status} ${text}`);
    }
    const payload = (await res.json()) as { access_token: string };
    accessToken = payload.access_token;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'refresh failed';
    await prisma.calendarConnection.update({
      where: { id: conn.id },
      data: { syncStatus: 'error', syncError: msg, lastSyncedAt: new Date() },
    });
    return { ok: false, synced: 0, error: msg };
  }

  // ── Step 2: fetch events for each configured calendar ──
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - 7);
  const windowEnd = new Date();
  windowEnd.setDate(windowEnd.getDate() + 30);

  const calendarIds = conn.calendarIds.length > 0 ? conn.calendarIds : ['primary'];
  let synced = 0;

  for (const calId of calendarIds) {
    const url = new URL(`${CALENDAR_API}/calendars/${encodeURIComponent(calId)}/events`);
    url.searchParams.set('timeMin', windowStart.toISOString());
    url.searchParams.set('timeMax', windowEnd.toISOString());
    url.searchParams.set('singleEvents', 'true'); // expand recurring
    url.searchParams.set('orderBy', 'startTime');
    url.searchParams.set('maxResults', '250');

    const res = await fetch(url.toString(), {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const text = await res.text();
      const msg = `calendar ${calId} fetch failed: ${res.status} ${text.slice(0, 200)}`;
      await prisma.calendarConnection.update({
        where: { id: conn.id },
        data: { syncStatus: 'error', syncError: msg, lastSyncedAt: new Date() },
      });
      return { ok: false, synced, error: msg };
    }
    const payload = (await res.json()) as {
      items?: Array<{
        id: string;
        summary?: string;
        location?: string;
        start?: { dateTime?: string; date?: string };
        end?: { dateTime?: string; date?: string };
        status?: string;
      }>;
    };

    const events = payload.items ?? [];
    for (const ev of events) {
      if (ev.status === 'cancelled') continue;
      const startsAt = parseEventTime(ev.start);
      const endsAt = parseEventTime(ev.end);
      if (!startsAt || !endsAt) continue;

      await prisma.calendarEventCache.upsert({
        where: {
          userId_externalEventId_provider: {
            userId: conn.userId,
            externalEventId: ev.id,
            provider: 'google',
          },
        },
        create: {
          userId: conn.userId,
          connectionId: conn.id,
          externalEventId: ev.id,
          provider: 'google',
          title: ev.summary ?? '(no title)',
          location: ev.location ?? null,
          startsAt,
          endsAt,
        },
        update: {
          title: ev.summary ?? '(no title)',
          location: ev.location ?? null,
          startsAt,
          endsAt,
          lastSeenAt: new Date(),
        },
      });
      synced += 1;
    }
  }

  // ── Step 3: mark success ──
  await prisma.calendarConnection.update({
    where: { id: conn.id },
    data: { syncStatus: 'ok', syncError: null, lastSyncedAt: new Date() },
  });

  return { ok: true, synced };
}

function parseEventTime(slot?: { dateTime?: string; date?: string }): Date | null {
  if (!slot) return null;
  if (slot.dateTime) return new Date(slot.dateTime);
  if (slot.date) return new Date(`${slot.date}T00:00:00Z`); // all-day events
  return null;
}

// ─── Event-triggered sync (one user) ─────────────────────────────────
export const googleCalendarSyncOnConnect = inngest.createFunction(
  {
    id: 'google-calendar-sync-on-connect',
    name: 'Google Calendar — sync on connect',
    // Avoid thundering herd if the same user reconnects rapidly.
    concurrency: { key: 'event.data.userId', limit: 1 },
  },
  { event: 'partner-portal/google-calendar.connected' },
  async ({ event, step }) => {
    const { connectionId } = event.data as { userId: string; connectionId: string };
    const result = await step.run('sync-one', () => syncOneConnection(connectionId));
    return result;
  },
);

// ─── Scheduled sync (all users, every 15 min) ────────────────────────
export const googleCalendarSyncCron = inngest.createFunction(
  {
    id: 'google-calendar-sync-cron',
    name: 'Google Calendar — 15-min sync',
  },
  { cron: '*/15 * * * *' },
  async ({ step }) => {
    // Pull every active Google connection that has a refresh token.
    // We skip connections flagged as 'disconnected' — those require
    // the rep to re-auth. Keep going on individual failures.
    const connections = await step.run('list-connections', async () => {
      return prisma.calendarConnection.findMany({
        where: {
          provider: 'google',
          syncStatus: { not: 'disconnected' },
          refreshTokenEncrypted: { not: null },
        },
        select: { id: true, userId: true },
      });
    });

    const results: Array<{ connectionId: string; ok: boolean; synced: number; error?: string }> =
      [];
    for (const c of connections) {
      const r = await step.run(`sync-${c.id}`, () => syncOneConnection(c.id));
      results.push({ connectionId: c.id, ...r });
    }

    const totalSynced = results.reduce((n, r) => n + r.synced, 0);
    const errorCount = results.filter((r) => !r.ok).length;
    return { connectionsProcessed: connections.length, totalSynced, errorCount, results };
  },
);
