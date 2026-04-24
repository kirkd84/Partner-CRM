/**
 * Kicks off the Google OAuth flow for the logged-in user.
 *
 * Lands at /api/auth/google/authorize → redirects to Google's consent
 * screen with the scopes we need (calendar.readonly). Google bounces
 * back to /api/auth/google/callback with a code that we exchange for
 * access + refresh tokens.
 *
 * State parameter carries the user's id so the callback can attach the
 * resulting CalendarConnection to the right row. HMAC-signed with
 * NEXTAUTH_SECRET so an attacker can't spoof it.
 */
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { createHmac, randomBytes } from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function signState(userId: string): string {
  const nonce = randomBytes(12).toString('hex');
  const payload = `${userId}.${Date.now()}.${nonce}`;
  const secret = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET ?? 'dev-secret';
  const sig = createHmac('sha256', secret).update(payload).digest('hex').slice(0, 32);
  return `${payload}.${sig}`;
}

export async function GET(_req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.redirect(
      new URL('/login', process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
    );
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: 'GOOGLE_CLIENT_ID not configured' }, { status: 503 });
  }

  const origin =
    process.env.INNGEST_SERVE_ORIGIN ?? 'https://partner-crm-production.up.railway.app';
  const redirectUri = `${origin}/api/auth/google/callback`;
  const state = signState(session.user.id);

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'https://www.googleapis.com/auth/calendar.readonly email profile');
  // `offline` + `consent` — required to get a refresh_token back.
  // Without these Google hands us an access_token only, and we'd have
  // to prompt the user to re-auth every hour.
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('state', state);

  return NextResponse.redirect(url.toString());
}
