'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, DrawerModal } from '@partnerradar/ui';
import { Plus } from 'lucide-react';
import { createNetworkingGroup } from './actions';

export function NewNetworkingGroupButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [shortCode, setShortCode] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [meetingCadence, setMeetingCadence] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setName('');
    setShortCode('');
    setWebsiteUrl('');
    setMeetingCadence('');
    setNotes('');
    setError(null);
  }

  function onSubmit() {
    setError(null);
    if (!name.trim()) {
      setError('Group name required');
      return;
    }
    startTransition(async () => {
      try {
        const r = await createNetworkingGroup({
          name: name.trim(),
          shortCode: shortCode.trim() || undefined,
          websiteUrl: websiteUrl.trim() || undefined,
          meetingCadence: meetingCadence.trim() || undefined,
          notes: notes.trim() || undefined,
        });
        setOpen(false);
        reset();
        router.push(`/networking-groups/${r.id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create');
      }
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> New group
      </Button>
      <DrawerModal
        open={open}
        onClose={() => {
          setOpen(false);
          reset();
        }}
        title="New networking group"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={onSubmit} loading={isPending} disabled={!name.trim()}>
              Create group
            </Button>
          </>
        }
      >
        {error && (
          <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}
        <Field label="Name" required>
          <input
            autoFocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. BNI Chapter 47, Aurora Chamber, CAI Colorado"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Short code">
          <input
            type="text"
            value={shortCode}
            onChange={(e) => setShortCode(e.target.value)}
            placeholder="BNI / CAI / Chamber"
            maxLength={12}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Meeting cadence">
          <input
            type="text"
            value={meetingCadence}
            onChange={(e) => setMeetingCadence(e.target.value)}
            placeholder="e.g. 1st + 3rd Tuesday at 7am, Weekly Friday 11:30am"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Website">
          <input
            type="url"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder="https://"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Anything useful — annual dues amount, contact at the org, key referral partners…"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </Field>
      </DrawerModal>
    </>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="mb-3 block">
      <span className="block text-[11px] font-medium text-gray-600">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </span>
      <div className="mt-0.5">{children}</div>
    </label>
  );
}
