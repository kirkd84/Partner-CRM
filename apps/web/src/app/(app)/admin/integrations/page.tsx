/**
 * Admin → Integrations — single pane of glass for every outbound /
 * inbound integration Partner Portal talks to. Shows mode (mock vs real),
 * credential presence (without exposing the values), last sync + last
 * webhook events. Kirk can glance here to see what's wired and what's
 * missing without SSH-ing into Railway.
 *
 * SPEC §6.5 calls for Storm status + test-connection button + last-sync
 * time + last 20 events. We render that for Storm and leave clearly
 * labelled "coming soon" tiles for Google / Microsoft / Apple / Resend
 * / Twilio so the shape of the page is ready as those phases light up.
 */
import { prisma } from '@partnerradar/db';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { stormClient, stormClientMode } from '@partnerradar/integrations';
import { Pill } from '@partnerradar/ui';
import { StormTestConnectionButton } from './StormTestConnectionButton';
import {
  Plug,
  Calendar as CalendarIcon,
  Mail,
  MessageSquare,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function AdminIntegrationsPage() {
  const session = await auth();
  if (!session?.user) return null;
  if (session.user.role !== 'ADMIN') redirect('/admin');

  const mode = stormClientMode();
  const diagnostics = stormClient().getDiagnostics();

  // Last 20 webhook events — graceful if the table doesn't exist yet.
  type WE = { id: string; source: string; eventType: string; verified: boolean; createdAt: Date };
  let webhookEvents: WE[] = [];
  try {
    webhookEvents = await prisma.webhookEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, source: true, eventType: true, verified: true, createdAt: true },
    });
  } catch {
    /* auto-migrate hasn't run yet — show empty state */
  }

  // Activation audit — count of partners with stormCloudId (a rough
  // "things we've pushed to Storm" metric).
  const activatedCount = await prisma.partner.count({
    where: { stormCloudId: { not: null } },
  });

  // Present check for each secret we care about. We never render the
  // values — just a green/grey "configured / missing" badge.
  const envChecks: Array<{ label: string; present: boolean; requiredBy: string }> = [
    {
      label: 'STORM_API_MODE',
      present: Boolean(process.env.STORM_API_MODE),
      requiredBy: 'Storm adapter (falls back to "mock")',
    },
    {
      label: 'STORM_API_URL',
      present: Boolean(process.env.STORM_API_URL),
      requiredBy: 'Real Storm client',
    },
    {
      label: 'STORM_API_KEY',
      present: Boolean(process.env.STORM_API_KEY),
      requiredBy: 'Real Storm client',
    },
    {
      label: 'STORM_WEBHOOK_SECRET',
      present: Boolean(process.env.STORM_WEBHOOK_SECRET),
      requiredBy: 'Storm webhook signature check',
    },
    {
      label: 'ENCRYPTION_KEY',
      present: Boolean(process.env.ENCRYPTION_KEY),
      requiredBy: 'Calendar token encryption (Phase 4)',
    },
    {
      label: 'GOOGLE_CLIENT_ID / SECRET',
      present: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      requiredBy: 'Google Calendar sync (Phase 4)',
    },
    {
      label: 'MICROSOFT_CLIENT_ID / SECRET',
      present: Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET),
      requiredBy: 'Microsoft 365 Calendar sync (Phase 4)',
    },
    {
      label: 'RESEND_API_KEY',
      present: Boolean(process.env.RESEND_API_KEY),
      requiredBy: 'Email sending (Phase 3 invites + Phase 7 AI drafts)',
    },
    {
      label: 'TWILIO_ACCOUNT_SID / AUTH_TOKEN',
      present: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
      requiredBy: 'SMS outbound (Phase 7)',
    },
    {
      label: 'INNGEST_EVENT_KEY / SIGNING_KEY',
      present: Boolean(process.env.INNGEST_EVENT_KEY && process.env.INNGEST_SIGNING_KEY),
      requiredBy: 'Scheduled jobs (calendar sync, revenue sync, cadences)',
    },
  ];

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-card-border bg-white px-6 py-4">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-gray-900">
          <Plug className="h-5 w-5 text-gray-500" /> Integrations
        </h1>
        <p className="mt-1 text-xs text-gray-500">
          Single pane of glass for every outbound service Partner Portal talks to. Status is live —
          swap modes by updating the Railway env, then redeploy.
        </p>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto bg-gray-50 p-6">
        {/* ── Storm Cloud ─────────────────────────────────────────── */}
        <section className="rounded-lg border border-card-border bg-white p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
                Storm Cloud
                {mode === 'mock' ? (
                  <Pill color="#6b7280" tone="soft">
                    Mock
                  </Pill>
                ) : (
                  <Pill color="#10b981" tone="soft">
                    Real
                  </Pill>
                )}
              </h2>
              <p className="mt-1 text-xs text-gray-500">
                {mode === 'mock'
                  ? 'Mock client — persists to dev-data/storm-mock.json, returns deterministic fake project + revenue data so the UI looks real in dev.'
                  : 'Real client — issuing signed requests to the production Storm API.'}
              </p>
            </div>
            <StormTestConnectionButton />
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-xs md:grid-cols-4">
            <Stat label="Mode" value={mode} />
            <Stat label="Activated partners" value={activatedCount.toString()} />
            <Stat
              label="Breaker state"
              value={diagnostics.breaker.state}
              tone={diagnostics.breaker.state === 'closed' ? 'ok' : 'warn'}
            />
            <Stat
              label="Consecutive failures"
              value={diagnostics.breaker.consecutiveFailures.toString()}
            />
            <Stat label="Rate limit" value={`${diagnostics.rateLimitPerSec} req/s`} />
            <Stat label="Max retries" value={diagnostics.maxAttempts.toString()} />
            <Stat
              label="Webhook secret"
              value={process.env.STORM_WEBHOOK_SECRET ? 'configured' : 'missing'}
              tone={process.env.STORM_WEBHOOK_SECRET ? 'ok' : 'warn'}
            />
            <Stat label="Webhook URL" value="/api/webhooks/storm" />
          </dl>

          {!process.env.STORM_WEBHOOK_SECRET && (
            <div className="mt-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                STORM_WEBHOOK_SECRET is not set — inbound webhooks will be accepted but marked{' '}
                <em>unverified</em>. Set the secret in Railway before going live.
              </span>
            </div>
          )}
        </section>

        {/* ── Last 20 webhook events ──────────────────────────────── */}
        <section className="rounded-lg border border-card-border bg-white">
          <header className="flex items-center justify-between border-b border-card-border px-5 py-3">
            <h3 className="text-sm font-semibold text-gray-900">Recent webhook events</h3>
            <span className="text-[11px] text-gray-500">
              Showing last {webhookEvents.length} (max 20)
            </span>
          </header>
          {webhookEvents.length === 0 ? (
            <div className="px-5 py-10 text-center text-xs text-gray-500">
              No webhook deliveries yet. Send a test payload with{' '}
              <code className="rounded bg-gray-100 px-1 py-0.5">POST /api/webhooks/storm</code>.
            </div>
          ) : (
            <ul className="divide-y divide-card-border">
              {webhookEvents.map((ev) => (
                <li
                  key={ev.id}
                  className="flex items-center gap-3 px-5 py-2.5 text-xs text-gray-700"
                >
                  <Pill color={ev.source === 'STORM' ? '#3b82f6' : '#9ca3af'} tone="soft">
                    {ev.source}
                  </Pill>
                  <span className="font-medium text-gray-900">{ev.eventType}</span>
                  {ev.verified ? (
                    <span className="inline-flex items-center gap-1 text-green-700">
                      <ShieldCheck className="h-3 w-3" /> verified
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-amber-700">
                      <AlertTriangle className="h-3 w-3" /> unverified
                    </span>
                  )}
                  <span className="ml-auto tabular-nums text-gray-500">
                    {ev.createdAt.toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── Calendar providers (Phase 4) ────────────────────────── */}
        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <ProviderCard
            title="Google Calendar"
            icon={<CalendarIcon className="h-4 w-4" />}
            ready={Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)}
            note="Reps connect from /settings. Two-way sync + conflict detection."
          />
          <ProviderCard
            title="Microsoft 365"
            icon={<CalendarIcon className="h-4 w-4" />}
            ready={Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET)}
            note="Azure AD app registration → multi-tenant. Same UX as Google."
          />
          <ProviderCard
            title="Apple iCloud"
            icon={<CalendarIcon className="h-4 w-4" />}
            ready={false}
            note="Per-rep Apple ID + app-specific password. No tenant-wide cred."
            alwaysReadyText="Per-user only"
          />
        </section>

        {/* ── Messaging (Phase 3 + 7) ─────────────────────────────── */}
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <ProviderCard
            title="Resend (email)"
            icon={<Mail className="h-4 w-4" />}
            ready={Boolean(process.env.RESEND_API_KEY)}
            note="Magic-link invites + AI-drafted outreach. Needs DKIM/SPF on rooftechnologies.com."
          />
          <ProviderCard
            title="Twilio (SMS)"
            icon={<MessageSquare className="h-4 w-4" />}
            ready={Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN)}
            note="Outbound SMS with A2P 10DLC registration. Phase 7."
          />
        </section>

        {/* ── Env var checklist ───────────────────────────────────── */}
        <section className="rounded-lg border border-card-border bg-white">
          <header className="border-b border-card-border px-5 py-3">
            <h3 className="text-sm font-semibold text-gray-900">Environment variables</h3>
            <p className="mt-0.5 text-[11px] text-gray-500">
              Values are never rendered — this just tells you which ones Railway has. Missing ones
              degrade gracefully (no crashes), but the tied feature stays dark.
            </p>
          </header>
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-5 py-2">Variable</th>
                <th className="px-5 py-2">Status</th>
                <th className="px-5 py-2">Required by</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              {envChecks.map((c) => (
                <tr key={c.label}>
                  <td className="px-5 py-2 font-mono text-[11px]">{c.label}</td>
                  <td className="px-5 py-2">
                    {c.present ? (
                      <span className="inline-flex items-center gap-1 font-medium text-green-700">
                        <ShieldCheck className="h-3 w-3" /> configured
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-gray-500">
                        <AlertTriangle className="h-3 w-3" /> missing
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-2 text-gray-600">{c.requiredBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-label text-gray-500">{label}</dt>
      <dd
        className={`mt-0.5 text-sm ${
          tone === 'warn' ? 'text-amber-700' : tone === 'ok' ? 'text-green-700' : 'text-gray-900'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function ProviderCard({
  title,
  icon,
  ready,
  note,
  alwaysReadyText,
}: {
  title: string;
  icon: React.ReactNode;
  ready: boolean;
  note: string;
  alwaysReadyText?: string;
}) {
  return (
    <div className="rounded-lg border border-card-border bg-white p-5">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          {icon}
          {title}
        </h3>
        {ready ? (
          <Pill color="#10b981" tone="soft">
            Ready
          </Pill>
        ) : (
          <Pill color="#9ca3af" tone="soft">
            {alwaysReadyText ?? 'Not configured'}
          </Pill>
        )}
      </div>
      <p className="mt-2 text-xs text-gray-600">{note}</p>
    </div>
  );
}
