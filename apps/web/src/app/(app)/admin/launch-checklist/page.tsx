/**
 * /admin/launch-checklist — single page that tells Kirk exactly what's
 * configured vs. missing before going live with a real rep team.
 *
 * Every check has three parts:
 *   1. status (ok / warn / missing)
 *   2. what it controls (which feature works / doesn't without it)
 *   3. how to fix (env var to set, page to visit, etc.)
 *
 * No mutations on this page — strictly diagnostic. The fixes link out
 * to wherever the work actually happens (Railway dashboard, /admin/users,
 * an external service).
 *
 * Permissions: admin only. Reps and managers shouldn't see "your
 * Anthropic key isn't configured" — that's not their problem to solve.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@partnerradar/db';
import { Card, Pill } from '@partnerradar/ui';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Rocket,
  ExternalLink,
  Database,
  Map as MapIcon,
  Mail,
  Sparkles,
  Image as ImageIcon,
  KeyRound,
  Cloud,
  Zap,
  Bell,
  Calendar,
  Lock,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

type CheckStatus = 'ok' | 'warn' | 'missing';

interface Check {
  id: string;
  label: string;
  status: CheckStatus;
  /** What feature this gates. Always render — even when ok, so the user knows what they unlocked. */
  controls: string;
  /** How to fix when status !== 'ok'. */
  fix?: string;
  /** Optional link the user can click to take action. */
  fixUrl?: string;
  fixUrlIsExternal?: boolean;
  /** Group icon for the heading. */
  group: 'core' | 'integrations' | 'monitoring' | 'optional';
  icon?: React.ElementType;
}

export default async function LaunchChecklistPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'ADMIN') redirect('/admin');

  // Run every check in parallel — most are env reads (free), a few are
  // DB counts (cheap with the right indexes).
  const [marketCount, userCount, partnerCount, brandCount] = await Promise.all([
    prisma.market.count().catch(() => 0),
    prisma.user.count({ where: { active: true } }).catch(() => 0),
    prisma.partner.count({ where: { archivedAt: null } }).catch(() => 0),
    prisma.mwBrand?.count?.().catch(() => 0) ?? Promise.resolve(0),
  ]);

  const checks: Check[] = [
    // ─── CORE ──────────────────────────────────────────────────────
    {
      id: 'database',
      label: 'PostgreSQL connection',
      status: process.env.DATABASE_URL ? 'ok' : 'missing',
      controls: 'Everything. Without DB, nothing works.',
      fix: 'Set DATABASE_URL on Railway → Variables.',
      group: 'core',
      icon: Database,
    },
    {
      id: 'auth-secret',
      label: 'NEXTAUTH_SECRET',
      status: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET ? 'ok' : 'missing',
      controls: 'Session cookies. Logins fail without it.',
      fix: 'Generate one: `openssl rand -base64 32`, set as NEXTAUTH_SECRET on Railway.',
      group: 'core',
      icon: Lock,
    },
    {
      id: 'markets',
      label: 'At least one market created',
      status: marketCount > 0 ? 'ok' : 'missing',
      controls: 'Reps need a market to be assigned to. Lasso scrape needs one to anchor on.',
      fix: 'Create one in Markets admin.',
      fixUrl: '/admin/markets',
      group: 'core',
      icon: MapIcon,
    },
    {
      id: 'users',
      label: 'Active users invited',
      status: userCount > 1 ? 'ok' : userCount === 1 ? 'warn' : 'missing',
      controls: `${userCount} active user${userCount === 1 ? '' : 's'} so far. Invite the rep team.`,
      fix: 'Invite reps in Users admin.',
      fixUrl: '/admin/users',
      group: 'core',
      icon: KeyRound,
    },
    {
      id: 'partners',
      label: 'Seed data — partners loaded',
      status: partnerCount >= 25 ? 'ok' : partnerCount > 0 ? 'warn' : 'missing',
      controls: `${partnerCount} partners. Enough to test events, lasso, route optimization.`,
      fix: 'Use /admin/markets → Seed demo to drop 50 plausible partners into a market.',
      fixUrl: '/admin/markets',
      group: 'core',
      icon: Sparkles,
    },

    // ─── INTEGRATIONS ─────────────────────────────────────────────
    {
      id: 'google-maps',
      label: 'Google Maps JS API key',
      status: process.env.GOOGLE_MAPS_API_KEY ? 'ok' : 'missing',
      controls: 'The map page. Without it the map falls back to a list view.',
      fix: 'Create at Google Cloud Console; enable Maps JS, Drawing, Geometry, Places. Set GOOGLE_MAPS_API_KEY.',
      fixUrl: 'https://console.cloud.google.com/apis/credentials',
      fixUrlIsExternal: true,
      group: 'integrations',
      icon: MapIcon,
    },
    {
      id: 'google-places',
      label: 'Google Places API key (server-side)',
      status:
        process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY ? 'ok' : 'missing',
      controls: 'Lasso → Find new leads. Scrape jobs. Without this, only state-board imports work.',
      fix: 'Best practice: separate key with NO referrer restriction (server-side). Set GOOGLE_PLACES_API_KEY.',
      fixUrl: 'https://console.cloud.google.com/apis/credentials',
      fixUrlIsExternal: true,
      group: 'integrations',
      icon: MapIcon,
    },
    {
      id: 'cron-secret',
      label: 'CRON_SECRET (gates every /api/cron/* tick)',
      status: process.env.CRON_SECRET ? 'ok' : 'missing',
      controls:
        'Auth for scrape-tick + newsletter-tick + touchpoints-tick + drip-tick. Without it those endpoints reject every request and the corresponding feature can only be triggered manually.',
      fix: 'Generate: `openssl rand -hex 24`. Set CRON_SECRET on Railway. Then add Cron Schedules: POST /api/cron/scrape-tick every 5m, GET /api/cron/newsletter-tick every 5m, GET /api/cron/touchpoints-tick daily 9am, GET /api/cron/drip-tick hourly. All with header `Authorization: Bearer <CRON_SECRET>`.',
      group: 'integrations',
      icon: Calendar,
    },
    {
      id: 'anthropic',
      label: 'Anthropic API key (LLM director)',
      status: process.env.ANTHROPIC_API_KEY ? 'ok' : 'warn',
      controls:
        'AI draft drawer, intent extractor, design director. Falls back to rule-based without — works but less smart.',
      fix: 'Get a key at console.anthropic.com. Set ANTHROPIC_API_KEY on Railway.',
      fixUrl: 'https://console.anthropic.com/settings/keys',
      fixUrlIsExternal: true,
      group: 'integrations',
      icon: Sparkles,
    },
    {
      id: 'fal',
      label: 'fal.ai key (image generation)',
      status: process.env.FAL_KEY ? 'ok' : 'warn',
      controls:
        'AI image generation in marketing wizard. Falls back to solid color blocks without.',
      fix: 'Get a key at fal.ai. Set FAL_KEY on Railway.',
      fixUrl: 'https://fal.ai/dashboard/keys',
      fixUrlIsExternal: true,
      group: 'integrations',
      icon: ImageIcon,
    },
    {
      id: 'resend',
      label: 'Resend API key (outbound email)',
      status: process.env.RESEND_API_KEY ? 'ok' : 'missing',
      controls:
        'AI Follow-Up emails, expense receipts, RSVP confirmations. Today they log but DO NOT send.',
      fix: 'Sign up at resend.com, verify your domain, set RESEND_API_KEY.',
      fixUrl: 'https://resend.com/api-keys',
      fixUrlIsExternal: true,
      group: 'integrations',
      icon: Mail,
    },
    {
      id: 'twilio',
      label: 'Twilio (outbound SMS)',
      status: process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN ? 'ok' : 'warn',
      controls:
        'AI Follow-Up SMS + birthday/anniversary touchpoint sends. Without it SMS steps log but DO NOT send.',
      fix: 'Sign up at twilio.com, set TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM (E.164 number).',
      fixUrl: 'https://console.twilio.com/',
      fixUrlIsExternal: true,
      group: 'integrations',
      icon: Mail,
    },
    {
      id: 'resend-webhook',
      label: 'Resend webhook secret',
      status: process.env.RESEND_WEBHOOK_SECRET ? 'ok' : 'warn',
      controls:
        'Newsletter delivery + bounce backfill. Without it, opens still register via the tracking pixel and clicks via the link rewriter — bounces just go uncaught.',
      fix: 'Resend dashboard → Webhooks → add /api/webhooks/resend → copy the signing secret into RESEND_WEBHOOK_SECRET on Railway.',
      fixUrl: 'https://resend.com/webhooks',
      fixUrlIsExternal: true,
      group: 'integrations',
      icon: Mail,
    },
    {
      id: 'distance-matrix',
      label: 'Google Distance Matrix (route planner)',
      status:
        process.env.GOOGLE_DIRECTIONS_API_KEY || process.env.GOOGLE_MAPS_API_KEY ? 'ok' : 'warn',
      controls:
        'Multi-day hit-list planner uses Distance Matrix for real drive times. Without it falls back to a 28 mph haversine estimate — close enough to plan but not as accurate.',
      fix: 'Same Google project as Maps; enable Distance Matrix API on the existing GOOGLE_MAPS_API_KEY.',
      fixUrl: 'https://console.cloud.google.com/apis/library/distancematrix-backend.googleapis.com',
      fixUrlIsExternal: true,
      group: 'integrations',
      icon: MapIcon,
    },
    {
      id: 'inngest',
      label: 'Inngest (proper background jobs)',
      status: process.env.INNGEST_EVENT_KEY ? 'ok' : 'warn',
      controls:
        'Cron + retry + observability for background jobs. Without it /api/cron/scrape-tick handles scheduling.',
      fix: 'Sign up at inngest.com, set INNGEST_EVENT_KEY + INNGEST_SIGNING_KEY.',
      fixUrl: 'https://app.inngest.com/',
      fixUrlIsExternal: true,
      group: 'integrations',
      icon: Zap,
    },
    {
      id: 'r2',
      label: 'Cloudflare R2 (asset storage)',
      status: process.env.R2_BUCKET && process.env.R2_ACCESS_KEY_ID ? 'ok' : 'warn',
      controls:
        'Image uploads + cached PDFs. Without it images are stored as base64 in DB rows (works for hundreds of designs, fragile past thousands).',
      fix: 'Create an R2 bucket, generate API token, set R2_BUCKET + R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY + R2_ENDPOINT.',
      fixUrl: 'https://dash.cloudflare.com/?to=/:account/r2',
      fixUrlIsExternal: true,
      group: 'integrations',
      icon: Cloud,
    },
    {
      id: 'vapid',
      label: 'VAPID keys (web push)',
      status: process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY ? 'ok' : 'warn',
      controls:
        'Browser push notifications for events / Follow-Ups. Without it push notifications silently fail.',
      fix: 'Generate: `npx web-push generate-vapid-keys`. Set VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY + NEXT_PUBLIC_VAPID_PUBLIC_KEY (same value as VAPID_PUBLIC_KEY).',
      group: 'integrations',
      icon: Bell,
    },
    {
      id: 'oauth-google',
      label: 'Google OAuth (optional sign-in)',
      status: process.env.GOOGLE_CLIENT_ID ? 'ok' : 'warn',
      controls: 'Sign in with Google. Without it reps use email + password (still works fine).',
      fix: 'Set GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET. Configure redirect URIs in Google Cloud Console.',
      fixUrl: 'https://console.cloud.google.com/apis/credentials',
      fixUrlIsExternal: true,
      group: 'integrations',
      icon: KeyRound,
    },

    // ─── BRANDING / MARKETING WIZARD ─────────────────────────────
    {
      id: 'brand',
      label: 'Active brand profile',
      status: brandCount > 0 ? 'ok' : 'warn',
      controls:
        'The marketing wizard renders designs against your colors / logo / contact info. Without an active brand, designs use placeholders.',
      fix: 'Create one in /studio brand setup.',
      fixUrl: '/studio/brand',
      group: 'optional',
      icon: ImageIcon,
    },
  ];

  // Group + summary
  const byGroup = {
    core: checks.filter((c) => c.group === 'core'),
    integrations: checks.filter((c) => c.group === 'integrations'),
    optional: checks.filter((c) => c.group === 'optional'),
    monitoring: checks.filter((c) => c.group === 'monitoring'),
  };
  const blockers = checks.filter((c) => c.status === 'missing' && c.group === 'core').length;
  const warnings =
    checks.filter((c) => c.status === 'missing' || c.status === 'warn').length - blockers;
  const ready = blockers === 0;

  return (
    <div className="p-6">
      <header className="mb-5">
        <div className="flex items-center gap-2">
          <Rocket className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold text-gray-900">Launch checklist</h1>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Everything that needs to be true before you invite a real rep team. Blockers (red) must be
          fixed; warnings (amber) gracefully degrade — features still work, just less smart.
        </p>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Pill tone="soft" color={ready ? 'emerald' : 'red'}>
          {ready ? 'Ready to launch' : `${blockers} blocker${blockers === 1 ? '' : 's'}`}
        </Pill>
        {warnings > 0 && (
          <Pill tone="soft" color="amber">
            {warnings} warning{warnings === 1 ? '' : 's'}
          </Pill>
        )}
        <Pill tone="soft" color="gray">
          {checks.filter((c) => c.status === 'ok').length} / {checks.length} checks pass
        </Pill>
      </div>

      <ChecklistGroup title="Core — required before launch" checks={byGroup.core} />
      <ChecklistGroup
        title="Integrations — graceful but recommended"
        checks={byGroup.integrations}
      />
      <ChecklistGroup title="Branding & wizard" checks={byGroup.optional} />

      <Card title="Where to set env vars" className="mt-5">
        <ol className="list-decimal space-y-1 pl-5 text-xs text-gray-700">
          <li>Open Railway → your PartnerRadar service.</li>
          <li>
            Variables tab → add each variable above. Newly-added vars trigger a redeploy
            automatically.
          </li>
          <li>
            After redeploy, refresh this page. Greens should light up. If a check is still red you
            set the variable, double-check spelling — Railway is case-sensitive.
          </li>
        </ol>
      </Card>
    </div>
  );
}

function ChecklistGroup({ title, checks }: { title: string; checks: Check[] }) {
  if (checks.length === 0) return null;
  return (
    <Card title={title} className="mb-4">
      <ul className="divide-y divide-gray-100">
        {checks.map((c) => (
          <ChecklistRow key={c.id} check={c} />
        ))}
      </ul>
    </Card>
  );
}

function ChecklistRow({ check }: { check: Check }) {
  const Icon = check.icon ?? CheckCircle2;
  const statusBadge =
    check.status === 'ok' ? (
      <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-500" />
    ) : check.status === 'warn' ? (
      <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-500" />
    ) : (
      <XCircle className="h-4 w-4 flex-shrink-0 text-red-500" />
    );
  return (
    <li className="flex items-start gap-3 py-2.5">
      {statusBadge}
      <Icon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-gray-900">{check.label}</div>
        <div className="text-[11px] text-gray-500">{check.controls}</div>
        {check.status !== 'ok' && check.fix && (
          <div className="mt-1 text-[11px] text-gray-700">
            <span className="font-semibold">Fix:</span> {check.fix}
            {check.fixUrl && (
              <>
                {' '}
                <a
                  href={check.fixUrl}
                  target={check.fixUrlIsExternal ? '_blank' : undefined}
                  rel={check.fixUrlIsExternal ? 'noreferrer' : undefined}
                  className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
                >
                  Open
                  {check.fixUrlIsExternal ? <ExternalLink className="h-3 w-3" /> : null}
                </a>
              </>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
