'use client';

/**
 * Invite queue client — three horizontal regions per SPEC_EVENTS §5.1:
 *   top = currently sent / accepted / confirmed (read-only with chips)
 *   middle = drag-reorderable queue of QUEUED invites
 *   bottom = fallback preview — partners marked autoWaitlistEligible
 *
 * Right side panel = add partners (multi-select) + add ad-hoc invitee.
 *
 * Drag-reorder uses native HTML5 DnD (same pattern as /lists/[id]).
 * Debounced save fires 500ms after the last drop so rapid reorders
 * don't flood the server.
 */

import { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Pill } from '@partnerradar/ui';
import { GripVertical, Plus, Send, Trash2, Search, UserPlus, Clock, Check, X } from 'lucide-react';
import {
  addPartnerInvites,
  addAdHocInvite,
  reorderQueue,
  removeInvite,
  setInvitePlusOne,
  sendBatch,
} from './invite-actions';
import { proximityWindowHours } from '@/lib/events/proximity';

interface TicketType {
  id: string;
  name: string;
  capacity: number;
  isPrimary: boolean;
}

interface PartnerLite {
  id: string;
  companyName: string;
  city: string | null;
  state: string | null;
  autoWaitlistEligible?: boolean;
  waitlistPriority?: number | null;
}

interface Invite {
  id: string;
  status: string;
  queueTier: string;
  queueOrder: number;
  plusOneAllowed: boolean;
  plusOneName: string | null;
  expiresAt: string | null;
  sentAt: string | null;
  confirmedAt: string | null;
  partner: PartnerLite | null;
  adHocName: string | null;
  adHocEmail: string | null;
  adHocPhone: string | null;
  ticketAssignments: Array<{
    id: string;
    ticketTypeId: string;
    status: string;
    quantity: number;
  }>;
}

export function InvitesClient({
  eventId,
  eventTimezone,
  eventStartsAt,
  ticketTypes,
  takenByTicket,
  defaultPlusOnes,
  canEdit,
  invites,
  partnersAvailable,
  fallbackPreview,
}: {
  eventId: string;
  eventTimezone: string;
  eventStartsAt: string;
  ticketTypes: TicketType[];
  takenByTicket: Record<string, number>;
  defaultPlusOnes: boolean;
  canEdit: boolean;
  invites: Invite[];
  partnersAvailable: PartnerLite[];
  fallbackPreview: Array<{ id: string; companyName: string; waitlistPriority: number | null }>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [localQueue, setLocalQueue] = useState(
    invites.filter((i) => i.status === 'QUEUED').sort((a, b) => a.queueOrder - b.queueOrder),
  );
  const [dragId, setDragId] = useState<string | null>(null);
  const reorderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showAdHoc, setShowAdHoc] = useState(false);
  const [adHoc, setAdHoc] = useState({ name: '', email: '', phone: '', plusOne: defaultPlusOnes });
  const [adHocError, setAdHocError] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<string | null>(null);

  const sentOrBeyond = invites.filter((i) => i.status !== 'QUEUED');
  const primary = ticketTypes.find((t) => t.isPrimary);
  const primaryTaken = primary ? (takenByTicket[primary.id] ?? 0) : 0;
  const availableCount = primary ? Math.max(0, primary.capacity - primaryTaken) : 0;
  const windowHours = proximityWindowHours(new Date(eventStartsAt));

  const filteredPartners = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return partnersAvailable.slice(0, 50);
    return partnersAvailable
      .filter(
        (p) =>
          p.companyName.toLowerCase().includes(q) ||
          p.city?.toLowerCase().includes(q) ||
          p.state?.toLowerCase().includes(q),
      )
      .slice(0, 50);
  }, [search, partnersAvailable]);

  function onDragStart(id: string) {
    if (!canEdit) return;
    setDragId(id);
  }
  function onDragOver(e: React.DragEvent, overId: string) {
    if (!canEdit || !dragId || dragId === overId) return;
    e.preventDefault();
    const dragIdx = localQueue.findIndex((i) => i.id === dragId);
    const overIdx = localQueue.findIndex((i) => i.id === overId);
    if (dragIdx === -1 || overIdx === -1) return;
    const next = [...localQueue];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(overIdx, 0, moved!);
    setLocalQueue(next);
  }
  function onDragEnd() {
    if (!dragId) return;
    setDragId(null);
    // Debounced save.
    if (reorderTimer.current) clearTimeout(reorderTimer.current);
    reorderTimer.current = setTimeout(() => {
      const ids = localQueue.map((i) => i.id);
      startTransition(async () => {
        try {
          await reorderQueue(eventId, ids);
        } catch (err) {
          console.warn('Reorder failed', err);
        }
      });
    }, 500);
  }

  function onAddSelected() {
    if (selected.size === 0) return;
    startTransition(async () => {
      try {
        const r = await addPartnerInvites(eventId, {
          partnerIds: [...selected],
          plusOneDefault: defaultPlusOnes,
        });
        setSelected(new Set());
        setSearch('');
        setSendResult(`Added ${r.added} to queue${r.skipped > 0 ? ` (${r.skipped} skipped)` : ''}`);
        router.refresh();
      } catch (err) {
        setSendResult(err instanceof Error ? err.message : 'Failed');
      }
    });
  }

  function onAddAdHoc() {
    setAdHocError(null);
    startTransition(async () => {
      try {
        await addAdHocInvite(eventId, {
          name: adHoc.name,
          email: adHoc.email || undefined,
          phone: adHoc.phone || undefined,
          plusOneAllowed: adHoc.plusOne,
        });
        setAdHoc({ name: '', email: '', phone: '', plusOne: defaultPlusOnes });
        setShowAdHoc(false);
        router.refresh();
      } catch (err) {
        setAdHocError(err instanceof Error ? err.message : 'Failed');
      }
    });
  }

  function onRemove(id: string) {
    startTransition(async () => {
      try {
        await removeInvite(eventId, id);
        setLocalQueue((q) => q.filter((i) => i.id !== id));
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Failed');
      }
    });
  }

  function onTogglePlusOne(id: string, next: boolean) {
    startTransition(async () => {
      try {
        await setInvitePlusOne(eventId, id, next);
        setLocalQueue((q) => q.map((i) => (i.id === id ? { ...i, plusOneAllowed: next } : i)));
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Failed');
      }
    });
  }

  function onSend() {
    setSendResult(null);
    startTransition(async () => {
      try {
        const r = await sendBatch(eventId);
        if (r.sent === 0) {
          setSendResult(
            r.firstError
              ? `Nothing sent · ${r.firstError}`
              : 'Nothing to send — queue empty or over capacity',
          );
        } else {
          setSendResult(
            `Sent ${r.sent} invite${r.sent === 1 ? '' : 's'} · ${windowHours}h response window${r.skipped > 0 ? ` · ${r.skipped} skipped` : ''}`,
          );
        }
        router.refresh();
      } catch (err) {
        setSendResult(err instanceof Error ? err.message : 'Failed');
      }
    });
  }

  return (
    <div className="grid grid-cols-1 gap-4 p-6 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
      <div className="space-y-4">
        {/* Sent / responding */}
        <div className="rounded-lg border border-card-border bg-white">
          <header className="flex items-center justify-between border-b border-card-border px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900">
              In flight · {sentOrBeyond.length}
            </h2>
            {primary && (
              <span className="text-[11px] text-gray-500">
                {availableCount} of {primary.capacity} {primary.name} available
              </span>
            )}
          </header>
          {sentOrBeyond.length === 0 ? (
            <p className="p-4 text-xs text-gray-500">
              Nothing sent yet. Add partners to the queue below and hit "Send batch".
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {sentOrBeyond.map((inv) => (
                <li key={inv.id} className="flex items-center gap-3 px-4 py-2.5">
                  <Pill color={statusColor(inv.status)} tone="soft">
                    {humanizeStatus(inv.status)}
                  </Pill>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-gray-900">
                      {inv.partner?.companyName ?? inv.adHocName ?? '—'}
                      {inv.plusOneAllowed && (
                        <span className="ml-1 text-[11px] text-gray-500">
                          +1{inv.plusOneName ? ` (${inv.plusOneName})` : ''}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-gray-500">
                      {inv.expiresAt && inv.status === 'SENT' && (
                        <>Expires {formatWhen(new Date(inv.expiresAt), eventTimezone)}</>
                      )}
                      {inv.confirmedAt && (
                        <>Confirmed {formatWhen(new Date(inv.confirmedAt), eventTimezone)}</>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Queue (drag-drop) */}
        <div className="rounded-lg border border-card-border bg-white">
          <header className="flex items-center justify-between border-b border-card-border px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Queue · {localQueue.length}</h2>
              <p className="text-[11px] text-gray-500">
                Drag to reorder. Sends top-N based on available capacity.
              </p>
            </div>
            {canEdit && (
              <Button
                size="sm"
                onClick={onSend}
                loading={isPending}
                disabled={localQueue.length === 0 || availableCount === 0}
              >
                <Send className="h-3.5 w-3.5" /> Send batch
              </Button>
            )}
          </header>
          {sendResult && (
            <div className="border-b border-card-border bg-blue-50/50 px-4 py-2 text-[11px] text-gray-700">
              {sendResult}
            </div>
          )}
          {localQueue.length === 0 ? (
            <p className="p-4 text-xs text-gray-500">
              Queue is empty. Add partners from the right panel.
            </p>
          ) : (
            <ul onDragEnd={onDragEnd}>
              {localQueue.map((inv, idx) => {
                const isOver = dragId && dragId !== inv.id;
                return (
                  <li
                    key={inv.id}
                    draggable={canEdit}
                    onDragStart={() => onDragStart(inv.id)}
                    onDragOver={(e) => onDragOver(e, inv.id)}
                    className={`flex items-center gap-2 border-b border-gray-100 px-3 py-2 transition ${
                      dragId === inv.id ? 'bg-blue-50' : ''
                    } ${isOver ? 'border-t-2 border-t-primary' : ''}`}
                  >
                    <span className="w-6 text-right font-mono text-[11px] text-gray-400">
                      {idx + 1}
                    </span>
                    {canEdit && (
                      <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-gray-400" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-gray-900">
                        {inv.partner?.companyName ?? inv.adHocName}
                      </div>
                      <div className="text-[11px] text-gray-500">
                        {inv.partner
                          ? [inv.partner.city, inv.partner.state].filter(Boolean).join(', ')
                          : [inv.adHocEmail, inv.adHocPhone].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    {inv.queueTier !== 'PRIMARY' && (
                      <Pill color="#f59e0b" tone="soft">
                        {inv.queueTier === 'AD_HOC' ? 'Ad-hoc' : 'Fallback'}
                      </Pill>
                    )}
                    {canEdit && (
                      <>
                        <label className="flex items-center gap-1 text-[11px] text-gray-500">
                          <input
                            type="checkbox"
                            checked={inv.plusOneAllowed}
                            onChange={(e) => onTogglePlusOne(inv.id, e.target.checked)}
                            className="rounded"
                          />
                          +1
                        </label>
                        <button
                          type="button"
                          onClick={() => onRemove(inv.id)}
                          disabled={isPending}
                          title="Remove from queue"
                          className="rounded p-1 text-gray-400 transition hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Fallback preview */}
        {fallbackPreview.length > 0 && (
          <div className="rounded-lg border border-card-border bg-white">
            <header className="border-b border-card-border px-4 py-3">
              <h2 className="text-sm font-semibold text-gray-900">Auto-fallback preview</h2>
              <p className="text-[11px] text-gray-500">
                If the queue above runs out, we'll invite these partners in this order
                (autoWaitlistEligible=true).
              </p>
            </header>
            <ol className="divide-y divide-gray-100">
              {fallbackPreview.map((p, i) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between px-4 py-2 text-xs text-gray-700"
                >
                  <span className="flex items-center gap-2">
                    <span className="w-5 text-right font-mono text-[11px] text-gray-400">
                      {i + 1}
                    </span>
                    {p.companyName}
                  </span>
                  {p.waitlistPriority !== null && (
                    <span className="font-mono text-[11px] text-gray-500">
                      priority {p.waitlistPriority}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>

      {/* Right: add panel */}
      {canEdit && (
        <div className="space-y-4">
          <div className="rounded-lg border border-card-border bg-white">
            <header className="border-b border-card-border px-4 py-3">
              <h2 className="text-sm font-semibold text-gray-900">Add to queue</h2>
              <p className="text-[11px] text-gray-500">
                Pick from partners in this market, or add someone ad-hoc.
              </p>
            </header>
            <div className="space-y-3 p-4">
              <div className="flex items-center gap-2 rounded-md border border-gray-300 px-2 py-1.5">
                <Search className="h-3.5 w-3.5 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, city, state…"
                  className="flex-1 text-sm focus:outline-none"
                />
              </div>
              <div className="max-h-72 overflow-y-auto rounded-md border border-gray-200">
                {filteredPartners.length === 0 ? (
                  <p className="p-3 text-xs text-gray-500">
                    {partnersAvailable.length === 0
                      ? 'Every partner in this market is already in the queue.'
                      : 'No matches.'}
                  </p>
                ) : (
                  <ul>
                    {filteredPartners.map((p) => (
                      <li
                        key={p.id}
                        className="flex items-center gap-2 border-b border-gray-100 px-2 py-1.5 last:border-b-0"
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(p.id)}
                          onChange={(e) => {
                            setSelected((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(p.id);
                              else next.delete(p.id);
                              return next;
                            });
                          }}
                          className="rounded"
                        />
                        <div className="min-w-0 flex-1 text-xs">
                          <div className="truncate text-gray-900">{p.companyName}</div>
                          <div className="text-[10px] text-gray-500">
                            {[p.city, p.state].filter(Boolean).join(', ')}
                          </div>
                        </div>
                        {p.autoWaitlistEligible && (
                          <span title="Auto-fallback eligible">
                            <Clock className="h-3 w-3 text-amber-500" />
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-gray-500">{selected.size} selected</span>
                <Button
                  size="sm"
                  onClick={onAddSelected}
                  disabled={selected.size === 0 || isPending}
                  loading={isPending}
                >
                  <Plus className="h-3.5 w-3.5" /> Add to queue
                </Button>
              </div>
              <div className="border-t border-gray-100 pt-3">
                {!showAdHoc ? (
                  <button
                    type="button"
                    onClick={() => setShowAdHoc(true)}
                    className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-blue-500 bg-transparent py-2 text-xs text-blue-600 transition hover:bg-blue-50"
                  >
                    <UserPlus className="h-3.5 w-3.5" /> Add ad-hoc invitee
                  </button>
                ) : (
                  <div className="space-y-2">
                    <input
                      autoFocus
                      type="text"
                      value={adHoc.name}
                      onChange={(e) => setAdHoc({ ...adHoc, name: e.target.value })}
                      placeholder="Name (required)"
                      className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                    <input
                      type="email"
                      value={adHoc.email}
                      onChange={(e) => setAdHoc({ ...adHoc, email: e.target.value })}
                      placeholder="Email"
                      className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                    <input
                      type="tel"
                      value={adHoc.phone}
                      onChange={(e) => setAdHoc({ ...adHoc, phone: e.target.value })}
                      placeholder="Phone"
                      className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                    <label className="flex items-center gap-1 text-[11px] text-gray-600">
                      <input
                        type="checkbox"
                        checked={adHoc.plusOne}
                        onChange={(e) => setAdHoc({ ...adHoc, plusOne: e.target.checked })}
                        className="rounded"
                      />
                      Allow plus-one
                    </label>
                    {adHocError && <p className="text-[11px] text-red-600">{adHocError}</p>}
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="secondary"
                        size="sm"
                        type="button"
                        onClick={() => setShowAdHoc(false)}
                      >
                        <X className="h-3 w-3" /> Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={onAddAdHoc}
                        loading={isPending}
                        disabled={!adHoc.name.trim()}
                      >
                        <Check className="h-3 w-3" /> Add
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function statusColor(s: string): string {
  switch (s) {
    case 'SENT':
      return '#0ea5e9';
    case 'ACCEPTED':
    case 'CONFIRMATION_REQUESTED':
      return '#f59e0b';
    case 'CONFIRMED':
      return '#10b981';
    case 'DECLINED':
    case 'EXPIRED':
    case 'AUTO_CANCELED':
    case 'CANCELED':
      return '#ef4444';
    case 'NO_SHOW':
      return '#6b7280';
    default:
      return '#9ca3af';
  }
}
function humanizeStatus(s: string): string {
  return s.toLowerCase().replace(/_/g, ' ');
}
function formatWhen(d: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}
