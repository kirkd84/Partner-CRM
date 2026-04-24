'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Avatar, Pill } from '@partnerradar/ui';
import { UserPlus, Trash2 } from 'lucide-react';
import { addHost, removeHost } from './host-actions';

interface TicketType {
  id: string;
  name: string;
  isPrimary: boolean;
}

interface Host {
  id: string;
  userId: string;
  role: string | null;
  ticketTypeIds: unknown;
  user: { id: string; name: string; avatarColor: string; role: string };
}

interface Rep {
  id: string;
  name: string;
  email: string;
  avatarColor: string;
  role: string;
}

interface Event {
  id: string;
  ticketTypes: TicketType[];
  hosts: Host[];
  canceledAt: Date | null;
}

export function HostsTab({
  event,
  reps,
  canEdit,
}: {
  event: Event;
  reps: Rep[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState('');
  const [ticketIds, setTicketIds] = useState<string[]>(
    event.ticketTypes.filter((t) => t.isPrimary).map((t) => t.id),
  );
  const [error, setError] = useState<string | null>(null);

  const availableReps = reps.filter((r) => !event.hosts.some((h) => h.userId === r.id));

  function onAdd() {
    setError(null);
    if (!userId) {
      setError('Pick someone');
      return;
    }
    startTransition(async () => {
      try {
        await addHost(event.id, {
          userId,
          role: role.trim() || undefined,
          ticketTypeIds: ticketIds,
        });
        setPickerOpen(false);
        setUserId('');
        setRole('');
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed');
      }
    });
  }

  function onRemove(hostId: string) {
    if (!confirm('Remove this host? Their confirmed tickets release back into capacity.')) return;
    startTransition(async () => {
      try {
        await removeHost(event.id, hostId);
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Failed');
      }
    });
  }

  const ticketById = new Map(event.ticketTypes.map((t) => [t.id, t]));

  return (
    <div className="p-6">
      <div className="mx-auto max-w-3xl rounded-lg border border-card-border bg-white">
        <header className="flex items-center justify-between border-b border-card-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Hosts</h2>
            <p className="text-[11px] text-gray-500">
              Hosts' tickets auto-confirm and consume capacity immediately.
            </p>
          </div>
          {canEdit && !event.canceledAt && !pickerOpen && availableReps.length > 0 && (
            <Button size="sm" onClick={() => setPickerOpen(true)}>
              <UserPlus className="h-3.5 w-3.5" /> Add host
            </Button>
          )}
        </header>

        {pickerOpen && (
          <div className="space-y-3 border-b border-card-border bg-blue-50/30 p-4">
            <div>
              <label className="block text-[11px] font-medium text-gray-600">User</label>
              <select
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
              >
                <option value="">— Pick a rep —</option>
                {availableReps.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} · {r.role.toLowerCase()} · {r.email}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-600">Role (optional)</label>
              <input
                type="text"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="Primary Host, Setup Lead, Co-Host"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <div className="text-[11px] font-medium text-gray-600">Tickets they consume</div>
              <div className="mt-1 space-y-1">
                {event.ticketTypes.map((t) => (
                  <label key={t.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={ticketIds.includes(t.id)}
                      onChange={(e) =>
                        setTicketIds((prev) =>
                          e.target.checked ? [...prev, t.id] : prev.filter((id) => id !== t.id),
                        )
                      }
                      className="rounded"
                    />
                    {t.name}
                    {t.isPrimary && <span className="text-[11px] text-gray-500">(primary)</span>}
                  </label>
                ))}
              </div>
            </div>
            {error && <p className="text-[11px] text-red-600">{error}</p>}
            <div className="flex items-center justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setPickerOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={onAdd} loading={isPending}>
                Add host
              </Button>
            </div>
          </div>
        )}

        {event.hosts.length === 0 ? (
          <div className="p-8 text-center text-xs text-gray-500">
            No hosts yet. Add at least one so someone's on-point.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {event.hosts.map((h) => {
              const hostTickets = Array.isArray(h.ticketTypeIds)
                ? (h.ticketTypeIds as string[])
                    .map((id) => ticketById.get(id)?.name)
                    .filter(Boolean)
                : [];
              return (
                <li key={h.id} className="flex items-center gap-3 px-4 py-3">
                  <Avatar name={h.user.name} color={h.user.avatarColor} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{h.user.name}</span>
                      <Pill color="#6b7280" tone="soft">
                        {h.user.role.toLowerCase()}
                      </Pill>
                      {h.role && <span className="text-[11px] text-gray-500">· {h.role}</span>}
                    </div>
                    <div className="text-[11px] text-gray-500">
                      Consumes: {hostTickets.length > 0 ? hostTickets.join(', ') : '—'}
                    </div>
                  </div>
                  {canEdit && !event.canceledAt && (
                    <button
                      type="button"
                      onClick={() => onRemove(h.id)}
                      disabled={isPending}
                      title="Remove host"
                      className="rounded p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
