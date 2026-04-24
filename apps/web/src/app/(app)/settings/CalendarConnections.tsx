'use client';
import { Calendar, CheckCircle2, ExternalLink, AlertTriangle, X } from 'lucide-react';
import { Pill } from '@partnerradar/ui';
import type { CalendarProviderInfo } from '@partnerradar/integrations';

interface Connection {
  id: string;
  provider: string;
  externalAccountId: string;
  lastSyncedAt: Date | null;
  syncStatus: string;
  syncError: string | null;
}

export function CalendarConnections({
  providers,
  connections,
}: {
  providers: CalendarProviderInfo[];
  connections: Connection[];
}) {
  return (
    <div className="space-y-2">
      {providers.map((p) => {
        const mine = connections.filter((c) => c.provider === p.id);
        return (
          <div
            key={p.id}
            className="rounded-md border border-card-border bg-white p-3 transition hover:border-gray-300"
          >
            <div className="flex items-start gap-3">
              <Calendar className="mt-0.5 h-5 w-5 text-gray-500" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-900">{p.label}</h3>
                  {mine.length > 0 ? (
                    <Pill color="#10b981" tone="soft">
                      Connected
                    </Pill>
                  ) : p.configured ? (
                    <Pill color="#3b82f6" tone="soft">
                      Ready to connect
                    </Pill>
                  ) : (
                    <Pill color="#9ca3af" tone="soft">
                      Coming soon
                    </Pill>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-gray-600">{p.description}</p>
                {!p.configured && !p.perUserOnly && (
                  <p className="mt-1 text-[11px] text-gray-400">{p.unconfiguredHint}</p>
                )}

                {mine.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {mine.map((c) => (
                      <li
                        key={c.id}
                        className="flex items-center gap-2 rounded-sm bg-gray-50 px-2 py-1 text-xs"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                        <span className="font-medium text-gray-900">{c.externalAccountId}</span>
                        <span className="text-gray-500">·</span>
                        <span className="text-gray-500">
                          {c.lastSyncedAt ? `synced ${timeAgo(c.lastSyncedAt)}` : 'not yet synced'}
                        </span>
                        {c.syncStatus === 'error' && c.syncError && (
                          <span className="inline-flex items-center gap-1 text-amber-700">
                            <AlertTriangle className="h-3 w-3" />
                            {c.syncError}
                          </span>
                        )}
                        <button
                          type="button"
                          className="ml-auto text-gray-400 hover:text-red-600"
                          title="Disconnect"
                          disabled
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="flex flex-col items-end gap-1">
                {p.id === 'apple' ? (
                  <button
                    type="button"
                    disabled={!p.configured}
                    className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:border-primary hover:text-primary disabled:opacity-50"
                  >
                    Add iCloud password
                  </button>
                ) : p.id === 'google' && p.configured ? (
                  // Live Google OAuth flow — /api/auth/google/authorize
                  // generates the Google consent URL and redirects us
                  // there. Callback stores encrypted tokens and fires
                  // an Inngest event to trigger the first sync.
                  <a
                    href="/api/auth/google/authorize"
                    className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:border-primary hover:text-primary"
                  >
                    Connect <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled={!p.configured}
                    className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:border-primary hover:text-primary disabled:opacity-50"
                  >
                    Connect <ExternalLink className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
      <p className="text-[11px] text-gray-400">
        External events render read-only and striped on /calendar. Conflict detection catches
        overlaps with your new appointments.
      </p>
    </div>
  );
}

function timeAgo(d: Date): string {
  const ms = Date.now() - d.getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}
