'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, CheckCircle2, ExternalLink, AlertTriangle, X, RefreshCw } from 'lucide-react';
import { Pill } from '@partnerradar/ui';
import type { CalendarProviderInfo } from '@partnerradar/integrations';
import { syncCalendarConnectionNow, disconnectCalendarConnection } from './actions';

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
                      <ConnectionRow key={c.id} connection={c} />
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

function ConnectionRow({ connection }: { connection: Connection }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function onSync() {
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await syncCalendarConnectionNow(connection.id);
        if (res.ok) {
          setMessage(`Synced ${res.synced} events`);
        } else {
          setMessage(`Sync failed: ${res.error ?? 'unknown error'}`);
        }
        router.refresh();
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Failed');
      }
    });
  }

  function onDisconnect() {
    if (
      !confirm(
        `Disconnect ${connection.externalAccountId}? Cached events will be removed and you'll need to reconnect to sync again.`,
      )
    )
      return;
    startTransition(async () => {
      try {
        await disconnectCalendarConnection(connection.id);
        router.refresh();
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Failed');
      }
    });
  }

  return (
    <li className="flex flex-col gap-1 rounded-sm bg-gray-50 px-2 py-1.5 text-xs">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600" />
        <span className="truncate font-medium text-gray-900">{connection.externalAccountId}</span>
        <span className="text-gray-500">·</span>
        <span className="text-gray-500">
          {connection.lastSyncedAt
            ? `synced ${timeAgo(connection.lastSyncedAt)}`
            : 'not yet synced'}
        </span>
        <button
          type="button"
          onClick={onSync}
          disabled={isPending}
          title="Sync now"
          className="ml-auto inline-flex items-center gap-1 rounded border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-medium text-gray-700 hover:border-primary hover:text-primary disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${isPending ? 'animate-spin' : ''}`} />
          {isPending ? 'Syncing…' : 'Sync now'}
        </button>
        <button
          type="button"
          onClick={onDisconnect}
          disabled={isPending}
          title="Disconnect"
          className="rounded p-1 text-gray-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {connection.syncStatus === 'error' && connection.syncError && (
        <div className="flex items-start gap-1 text-amber-700">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          <span className="break-all">{connection.syncError}</span>
        </div>
      )}
      {message && <div className="text-[11px] text-gray-600">{message}</div>}
    </li>
  );
}
