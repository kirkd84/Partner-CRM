/**
 * Inngest function endpoint. This is the URL you register in the
 * Inngest dashboard ("Apps → Sync a new app") as:
 *   https://partner-crm-production.up.railway.app/api/inngest
 *
 * Inngest's `serve()` adapter handles three HTTP verbs:
 *   GET  → function introspection (Inngest's dashboard hits this)
 *   PUT  → register/update functions (on deploy)
 *   POST → execute a specific function (at Inngest's command)
 *
 * Signature verification uses INNGEST_SIGNING_KEY under the hood,
 * so as long as that env is set, random internet traffic can't
 * trigger our jobs.
 */
import { serve } from 'inngest/next';
import { inngest, functions } from '@/lib/inngest';

export const runtime = 'nodejs';
// We DO NOT set `export const dynamic = 'force-dynamic'` here.
// Inngest's serve() needs to be cacheable for the introspection GET.

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
  // Force the public canonical URL — Railway sits behind a proxy so
  // Next.js's automatic host detection can pick up an internal-only
  // hostname that Inngest Cloud can't reach. Hardcoding it to the
  // public domain fixes the "We could not reach your URL" sync error.
  // Override via `INNGEST_SERVE_ORIGIN` env if we ever need to point
  // Inngest at a staging URL.
  serveHost: process.env.INNGEST_SERVE_ORIGIN ?? 'https://partner-crm-production.up.railway.app',
});
