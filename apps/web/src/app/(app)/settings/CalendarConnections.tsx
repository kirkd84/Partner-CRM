'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Calendar,
  CheckCircle2,
  ExternalLink,
  AlertTriangle,
  X,
  RefreshCw,
  ListChecks,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Pill } from '@partnerradar/ui';
import type { CalendarProviderInfo } from '@partnerradar/integrations';
import {
  syncCalendarConnectionNow,
  disconnectCalendarConnection,
  listGoogleCalendarsForConnection,
  updateCalendarSelection,
} from './actions';

type RemoteCalendar = {
  id: string;
  summary: string;
  primary: boolean;
  backgroundColor?: string;
  accessRole: string;
  selected: boolean;
};

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

  // Calendar picker state — lazy-loaded on first expand so we're not
  // hitting Google's calendarList API for every row on page render.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [remoteCalendars, setRemoteCalendars] = useState<RemoteCalendar[] | null>(null);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [pickerLoading, setPickerLoading] = useState(false);

  async function loadCalendars() {
    setPickerLoading(true);
    setPickerError(null);
    try {
      const res = await listGoogleCalendarsForConnection(connection.id);
      if (!res.ok) {
        setPickerError(res.error ?? 'Failed to load');
        setRemoteCalendars([]);
      } else {
        setRemoteCalendars(res.calendars);
      }
    } catch (err) {
      setPickerError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setPickerLoading(false);
    }
  }

  function togglePicker() {
    const next = !pickerOpen;
    setPickerOpen(next);
    if (next && remoteCalendars === null) {
      void loadCalendars();
    }
  }

  function toggleCalendar(id: string) {
    if (!remoteCalendars) return;
    setRemoteCalendars(
      remoteCalendars.map((c) => (c.id === id ? { ...c, selected: !c.selected } : c)),
    );
  }

  function saveSelection() {
    if (!remoteCalendars) return;
    const selected = remoteCalendars.filter((c) => c.selected).map((c) => c.id);
    if (selected.length === 0) {
      setPickerError('Pick at least one calendar — otherwise nothing will sync.');
      return;
    }
    setPickerError(null);
    startTransition(async () => {
      try {
        await updateCalendarSelection(connection.id, selected);
        // Kick an immediate sync so the new selection takes effect now.
        const res = await syncCalendarConnectionNow(connection.id);
        setMessage(
          res.ok
            ? `Saved · synced ${res.synced} events from ${selected.length} calendar${selected.length === 1 ? '' : 's'}`
            : `Saved, but sync failed: ${res.error ?? 'unknown'}`,
        );
        router.refresh();
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Failed to save');
      }
    });
  }

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
        {connection.provider === 'google' && (
          <button
            type="button"
            onClick={togglePicker}
            title="Pick which calendars to sync"
            className="ml-auto inline-flex items-center gap-1 rounded border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-medium text-gray-700 hover:border-primary hover:text-primary"
          >
            <ListChecks className="h-3 w-3" /> Calendars
            {pickerOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        )}
        <button
          type="button"
          onClick={onSync}
          disabled={isPending}
          title="Sync now"
          className={`inline-flex items-center gap-1 rounded border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-medium text-gray-700 hover:border-primary hover:text-primary disabled:opacity-50 ${connection.provider !== 'google' ? 'ml-auto' : ''}`}
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

      {/* Expandable calendar picker — lazy-loaded on open */}
      {pickerOpen && (
        <div className="mt-2 rounded border border-card-border bg-white p-2">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-label text-gray-600">
              Calendars to sync
            </span>
            {remoteCalendars && (
              <span className="text-[10px] text-gray-400">
                {remoteCalendars.filter((c) => c.selected).length} of {remoteCalendars.length}{' '}
                selected
              </span>
            )}
          </div>
          {pickerLoading && (
            <div className="py-2 text-center text-[11px] text-gray-500">
              Loading your Google calendars…
            </div>
          )}
          {pickerError && (
            <div className="flex items-start gap-1 rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-700">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span className="break-all">{pickerError}</span>
            </div>
          )}
          {remoteCalendars && remoteCalendars.length > 0 && (
            <>
              <ul className="max-h-64 space-y-0.5 overflow-y-auto">
                {remoteCalendars.map((c) => (
                  <li key={c.id}>
                    <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={c.selected}
                        onChange={() => toggleCalendar(c.id)}
                        className="rounded"
                      />
                      {c.backgroundColor && (
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-sm"
                          style={{ backgroundColor: c.backgroundColor }}
                        />
                      )}
                      <span className="min-w-0 flex-1 truncate">{c.summary}</span>
                      {c.primary && (
                        <span className="rounded bg-blue-50 px-1 py-0.5 text-[9px] font-semibold text-blue-700">
                          PRIMARY
                        </span>
                      )}
                      {c.accessRole === 'reader' && (
                        <span className="text-[9px] text-gray-400">read-only</span>
                      )}
                    </label>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPickerOpen(false)}
                  className="rounded border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-600 hover:border-gray-300"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={saveSelection}
                  disabled={isPending}
                  className="rounded bg-primary px-3 py-1 text-[11px] font-semibold text-white hover:bg-primary-hover disabled:opacity-50"
                >
                  {isPending ? 'Saving…' : 'Save + sync'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </li>
  );
}
