/**
 * OAuth callback Google redirects back to after the user approves.
 *
 * Does:
 *   1. Verifies the state param we signed in /authorize.
 *   2. Exchanges the one-time code for access + refresh tokens.
 *   3. Hits Google's userinfo endpoint so we know which Google account
 *      this connection represents (stored as externalAccountId).
 *   4. Encrypts both tokens with our AES-256-GCM helper.
 *   5. Upserts a CalendarConnection row (userId + provider=google +
 *      externalAccountId is the unique key).
 *   6. Fires a `partner-portal/google-calendar.connected` Inngest
 *      event so the sync worker picks it up within seconds instead
 *      of waiting for the next 15-min cron.
 *   7. Bounces the rep back to /settings with ?connected=google.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@partnerradar/db';
import { encryptSecret } from '@partnerradar/integrations';
import { inngest } from '@/lib/inngest-client';
import { createHmac } from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v2/userinfo';

function verifyState(raw: string | null): string | null {
  if (!raw) return null;
  const parts = raw.split('.');
  if (parts.length !== 4) return null;
  const [userId, ts, nonce, sig] = parts;
  const secret = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET ?? 'dev-secret';
  const expected = createHmac('sha256', secret)
    .update(`${userId}.${ts}.${nonce}`)
    .digest('hex')
    .slice(0, 32);
  if (expected !== sig) return null;
  // Reject state older than 10 minutes — prevents replay.
  if (Date.now() - parseInt(ts!, 10) > 10 * 60 * 1000) return null;
  return userId!;
}

function appUrl(path: string): string {
  const base = process.env.INNGEST_SERVE_ORIGIN ?? 'https://partner-crm-production.up.railway.app';
  return `${base}${path}`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  const state = url.searchParams.get('state');

  if (error) {
    return NextResponse.redirect(appUrl(`/settings?connect_error=${encodeURIComponent(error)}`));
  }
  if (!code) {
    return NextResponse.redirect(appUrl('/settings?connect_error=missing_code'));
  }

  const userId = verifyState(state);
  if (!userId) {
    return NextResponse.redirect(appUrl('/settings?connect_error=bad_state'));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(appUrl('/settings?connect_error=missing_google_creds'));
  }

  // ── Exchange code for tokens ──
  const redirectUri = appUrl('/api/auth/google/callback');
  const tokenRes = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    console.error('[google/callback] token exchange failed', tokenRes.status, text);
    return NextResponse.redirect(appUrl('/settings?connect_error=token_exchange_failed'));
  }
  const tokens = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type: string;
    scope: string;
  };

  // ── Who did they sign in as? ──
  const infoRes = await fetch(USERINFO_ENDPOINT, {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });
  if (!infoRes.ok) {
    console.error('[google/callback] userinfo failed', infoRes.status);
    return NextResponse.redirect(appUrl('/settings?connect_error=userinfo_failed'));
  }
  const info = (await infoRes.json()) as { email: string; id: string };

  // ── Encrypt tokens before storing ──
  let accessCipher: string | null = null;
  let refreshCipher: string | null = null;
  try {
    accessCipher = encryptSecret(tokens.access_token);
    if (tokens.refresh_token) refreshCipher = encryptSecret(tokens.refresh_token);
  } catch (err) {
    console.error('[google/callback] encryption failed — is ENCRYPTION_KEY set?', err);
    return NextResponse.redirect(appUrl('/settings?connect_error=encryption_not_configured'));
  }

  // ── Upsert CalendarConnection ──
  const connection = await prisma.calendarConnection.upsert({
    where: {
      // Composite unique: the schema doesn't declare one, but the
      // (userId, provider, externalAccountId) tuple is how we treat
      // uniqueness. Find-or-create is the safe play.
      id:
        (
          await prisma.calendarConnection.findFirst({
            where: {
              userId,
              provider: 'google',
              externalAccountId: info.email,
            },
            select: { id: true },
          })
        )?.id ?? '__new__',
    },
    create: {
      userId,
      provider: 'google',
      externalAccountId: info.email,
      accessTokenEncrypted: accessCipher,
      refreshTokenEncrypted: refreshCipher,
      calendarIds: ['primary'],
      syncStatus: 'ok',
      syncError: null,
    },
    update: {
      accessTokenEncrypted: accessCipher,
      // Only overwrite the refresh token if Google handed us a new one
      // — re-connects without `prompt=consent` may omit it.
      ...(refreshCipher ? { refreshTokenEncrypted: refreshCipher } : {}),
      syncStatus: 'ok',
      syncError: null,
    },
  });

  // ── Kick off an immediate sync so the rep sees events right away ──
  try {
    await inngest.send({
      name: 'partner-portal/google-calendar.connected',
      data: { userId, connectionId: connection.id },
    });
  } catch (err) {
    console.error('[google/callback] failed to enqueue initial sync', err);
    // Non-fatal — the 15-min cron will pick it up next tick.
  }

  return NextResponse.redirect(appUrl('/settings?connected=google'));
}
