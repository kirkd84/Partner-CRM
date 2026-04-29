'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, DrawerModal, Pill } from '@partnerradar/ui';
import { Plus, Trash2, UserPlus, CalendarPlus } from 'lucide-react';
import {
  addPartnerToGroup,
  removePartnerFromGroup,
  logGroupMeeting,
  deleteGroupMeeting,
} from '../actions';

interface MemberRow {
  partnerId: string;
  publicId: string;
  companyName: string;
  role: string | null;
}

interface MeetingRow {
  id: string;
  occurredOn: string; // ISO
  topic: string | null;
  attendeesNote: string | null;
  notes: string | null;
  spendCents: number | null;
  userName: string;
}

export function GroupDetailClient({
  groupId,
  members,
  meetings,
  notes,
}: {
  groupId: string;
  members: MemberRow[];
  meetings: MeetingRow[];
  notes: string | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [memberOpen, setMemberOpen] = useState(false);
  const [meetingOpen, setMeetingOpen] = useState(false);

  // Add-member form
  const [partnerSearch, setPartnerSearch] = useState('');
  const [matches, setMatches] = useState<
    Array<{ id: string; publicId: string; companyName: string }>
  >([]);
  const [pickedPartner, setPickedPartner] = useState<{ id: string; companyName: string } | null>(
    null,
  );
  const [memberRole, setMemberRole] = useState('');

  // Log-meeting form
  const [meetingDate, setMeetingDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [meetingTopic, setMeetingTopic] = useState('');
  const [meetingAttendees, setMeetingAttendees] = useState('');
  const [meetingNotes, setMeetingNotes] = useState('');
  const [meetingSpend, setMeetingSpend] = useState<string>('');

  const [error, setError] = useState<string | null>(null);

  async function searchPartners(q: string) {
    setPartnerSearch(q);
    if (q.trim().length < 2) {
      setMatches([]);
      return;
    }
    try {
      // Reuse the existing /api/admin/partners endpoint if available;
      // fallback to a simple fetch against the partners list page.
      const r = await fetch(`/api/partners/search?q=${encodeURIComponent(q.trim())}`).catch(
        () => null,
      );
      if (r && r.ok) {
        const data = (await r.json()) as {
          results?: Array<{ id: string; publicId: string; companyName: string }>;
        };
        setMatches(data.results ?? []);
      } else {
        setMatches([]);
      }
    } catch {
      setMatches([]);
    }
  }

  function onAddMember() {
    setError(null);
    if (!pickedPartner) {
      setError('Pick a partner first.');
      return;
    }
    startTransition(async () => {
      try {
        await addPartnerToGroup({
          groupId,
          partnerId: pickedPartner.id,
          role: memberRole.trim() || undefined,
        });
        setMemberOpen(false);
        setPickedPartner(null);
        setPartnerSearch('');
        setMemberRole('');
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add member');
      }
    });
  }

  function onRemoveMember(partnerId: string) {
    if (!confirm('Remove this partner from the group? Their history is preserved.')) return;
    startTransition(async () => {
      try {
        await removePartnerFromGroup(groupId, partnerId);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Remove failed');
      }
    });
  }

  function onLogMeeting() {
    setError(null);
    if (!meetingDate) {
      setError('Pick a date');
      return;
    }
    const spend = meetingSpend.trim() ? Number(meetingSpend) : undefined;
    startTransition(async () => {
      try {
        await logGroupMeeting({
          groupId,
          occurredOn: new Date(meetingDate).toISOString(),
          topic: meetingTopic.trim() || undefined,
          notes: meetingNotes.trim() || undefined,
          attendeesNote: meetingAttendees.trim() || undefined,
          spendDollars:
            spend !== undefined && Number.isFinite(spend) && spend >= 0 ? spend : undefined,
        });
        setMeetingOpen(false);
        setMeetingTopic('');
        setMeetingAttendees('');
        setMeetingNotes('');
        setMeetingSpend('');
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to log meeting');
      }
    });
  }

  function onDeleteMeeting(id: string) {
    if (!confirm('Delete this meeting log?')) return;
    startTransition(async () => {
      try {
        await deleteGroupMeeting(id);
        router.refresh();
      } catch {
        // ignore
      }
    });
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      <section className="rounded-lg border border-card-border bg-white p-4 shadow-card">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Members ({members.length})</h3>
          <Button size="sm" variant="secondary" onClick={() => setMemberOpen(true)}>
            <UserPlus className="h-3.5 w-3.5" /> Add
          </Button>
        </div>
        {members.length === 0 ? (
          <p className="mt-2 text-xs text-gray-500">
            Add the partners you&apos;ve met through this group so the rankings start working.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-gray-100">
            {members.map((m) => (
              <li key={m.partnerId} className="flex items-center gap-2 py-1.5 text-sm">
                <a
                  href={`/partners/${m.partnerId}`}
                  className="min-w-0 flex-1 truncate text-gray-900 hover:text-primary"
                >
                  {m.companyName}{' '}
                  <span className="font-mono text-[10.5px] text-gray-400">{m.publicId}</span>
                </a>
                {m.role && (
                  <Pill tone="soft" color="gray">
                    {m.role}
                  </Pill>
                )}
                <button
                  type="button"
                  onClick={() => onRemoveMember(m.partnerId)}
                  aria-label="Remove member"
                  className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-card-border bg-white p-4 shadow-card">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Meetings ({meetings.length})</h3>
          <Button size="sm" variant="secondary" onClick={() => setMeetingOpen(true)}>
            <CalendarPlus className="h-3.5 w-3.5" /> Log
          </Button>
        </div>
        {meetings.length === 0 ? (
          <p className="mt-2 text-xs text-gray-500">
            Log every meeting you attend — even informal ones — so the group&apos;s ROI shows up.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-gray-100">
            {meetings.map((mt) => (
              <li key={mt.id} className="flex items-start gap-2 py-2 text-sm">
                <div className="flex-1">
                  <div className="font-medium text-gray-900">
                    {new Date(mt.occurredOn).toLocaleDateString()}{' '}
                    {mt.topic && <span className="text-gray-500">· {mt.topic}</span>}
                  </div>
                  <div className="text-[11px] text-gray-500">
                    {mt.userName}
                    {mt.spendCents != null && mt.spendCents > 0 && (
                      <span> · ${(mt.spendCents / 100).toFixed(0)} spend</span>
                    )}
                  </div>
                  {(mt.attendeesNote || mt.notes) && (
                    <div className="mt-1 text-[11px] text-gray-700">
                      {mt.attendeesNote && <div>Attendees: {mt.attendeesNote}</div>}
                      {mt.notes && <div className="italic">{mt.notes}</div>}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onDeleteMeeting(mt.id)}
                  aria-label="Delete"
                  className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {notes && (
        <section className="rounded-lg border border-card-border bg-white p-4 shadow-card">
          <h3 className="text-sm font-semibold text-gray-900">Notes</h3>
          <p className="mt-1 whitespace-pre-line text-xs text-gray-600">{notes}</p>
        </section>
      )}

      {/* Add-member drawer */}
      <DrawerModal
        open={memberOpen}
        onClose={() => setMemberOpen(false)}
        title="Add partner to group"
        footer={
          <>
            <Button variant="secondary" onClick={() => setMemberOpen(false)}>
              Cancel
            </Button>
            <Button onClick={onAddMember} disabled={!pickedPartner}>
              <Plus className="h-4 w-4" /> Add
            </Button>
          </>
        }
      >
        <label className="block">
          <span className="text-[11px] font-medium text-gray-600">Search partners</span>
          <input
            type="search"
            value={partnerSearch}
            onChange={(e) => searchPartners(e.target.value)}
            placeholder="Type a company name…"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        {matches.length > 0 && (
          <ul className="mt-2 max-h-48 divide-y divide-gray-100 overflow-y-auto rounded-md border border-gray-200">
            {matches.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    setPickedPartner({ id: p.id, companyName: p.companyName });
                    setPartnerSearch(p.companyName);
                    setMatches([]);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-gray-50"
                >
                  <span className="flex-1">{p.companyName}</span>
                  <span className="font-mono text-[10.5px] text-gray-400">{p.publicId}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {pickedPartner && (
          <div className="mt-2 rounded-md bg-blue-50 px-2 py-1.5 text-xs text-blue-900">
            Adding <strong>{pickedPartner.companyName}</strong>
          </div>
        )}
        <label className="mt-3 block">
          <span className="text-[11px] font-medium text-gray-600">
            Role at the group (optional)
          </span>
          <input
            type="text"
            value={memberRole}
            onChange={(e) => setMemberRole(e.target.value)}
            placeholder="Member / Officer / Sponsor / Guest"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
      </DrawerModal>

      {/* Log-meeting drawer */}
      <DrawerModal
        open={meetingOpen}
        onClose={() => setMeetingOpen(false)}
        title="Log a meeting"
        footer={
          <>
            <Button variant="secondary" onClick={() => setMeetingOpen(false)}>
              Cancel
            </Button>
            <Button onClick={onLogMeeting}>
              <CalendarPlus className="h-4 w-4" /> Log meeting
            </Button>
          </>
        }
      >
        <label className="block">
          <span className="text-[11px] font-medium text-gray-600">Date</span>
          <input
            type="date"
            value={meetingDate}
            onChange={(e) => setMeetingDate(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="mt-3 block">
          <span className="text-[11px] font-medium text-gray-600">Topic / focus (optional)</span>
          <input
            type="text"
            value={meetingTopic}
            onChange={(e) => setMeetingTopic(e.target.value)}
            placeholder="Quarterly mixer, education night, board meeting…"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="mt-3 block">
          <span className="text-[11px] font-medium text-gray-600">Who was there</span>
          <textarea
            value={meetingAttendees}
            onChange={(e) => setMeetingAttendees(e.target.value)}
            rows={2}
            placeholder="Quick notes — partners present, intros made"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="mt-3 block">
          <span className="text-[11px] font-medium text-gray-600">Notes</span>
          <textarea
            value={meetingNotes}
            onChange={(e) => setMeetingNotes(e.target.value)}
            rows={3}
            placeholder="Outcomes, follow-ups, anything else"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="mt-3 block">
          <span className="text-[11px] font-medium text-gray-600">Spend ($, optional)</span>
          <input
            type="number"
            min={0}
            step={0.01}
            value={meetingSpend}
            onChange={(e) => setMeetingSpend(e.target.value)}
            placeholder="Dinner / parking / drinks"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
      </DrawerModal>
    </div>
  );
}
