'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Avatar } from '@partnerradar/ui';
import { updateProfile } from './actions';

interface NotificationPrefs {
  taskDue: boolean;
  stageChange: boolean;
  activation: boolean;
  mentionInComment: boolean;
}

interface Initial {
  name: string;
  avatarColor: string;
  homeAddress: string;
  officeAddress: string;
  defaultStart: 'HOME' | 'OFFICE' | 'LAST_STOP' | 'CUSTOM';
  preferredMapApp: 'GOOGLE' | 'APPLE';
  soundEffects: boolean;
  notificationPrefs: NotificationPrefs;
}

const COLOR_PALETTE = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ec4899',
  '#a855f7',
  '#f97316',
  '#06b6d4',
  '#ef4444',
  '#14b8a6',
  '#6366f1',
];

export function SettingsForm({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [form, setForm] = useState<Initial>(initial);
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus('idle');
    startTransition(async () => {
      try {
        await updateProfile({
          name: form.name,
          avatarColor: form.avatarColor,
          homeAddress: form.homeAddress,
          officeAddress: form.officeAddress,
          defaultStart: form.defaultStart,
          preferredMapApp: form.preferredMapApp,
          soundEffects: form.soundEffects,
          notificationPrefs: form.notificationPrefs,
        });
        setStatus('saved');
        window.setTimeout(() => setStatus('idle'), 2500);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Save failed');
        setStatus('error');
      }
    });
  }

  function setPref<K extends keyof NotificationPrefs>(key: K, value: boolean) {
    setForm({
      ...form,
      notificationPrefs: { ...form.notificationPrefs, [key]: value },
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="flex items-center gap-4">
        <Avatar name={form.name || '—'} color={form.avatarColor} size="lg" />
        <div className="flex-1">
          <Field label="Name">
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </Field>
        </div>
      </div>

      <Field label="Avatar color">
        <div className="flex flex-wrap items-center gap-2">
          {COLOR_PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setForm({ ...form, avatarColor: c })}
              className={`h-7 w-7 rounded-full border-2 transition ${
                form.avatarColor === c
                  ? 'border-gray-900'
                  : 'border-transparent hover:border-gray-300'
              }`}
              style={{ backgroundColor: c }}
              aria-label={`Use color ${c}`}
            />
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Home address">
          <input
            type="text"
            value={form.homeAddress}
            onChange={(e) => setForm({ ...form, homeAddress: e.target.value })}
            placeholder="123 Your Street, City"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </Field>
        <Field label="Office address">
          <input
            type="text"
            value={form.officeAddress}
            onChange={(e) => setForm({ ...form, officeAddress: e.target.value })}
            placeholder="Your office"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Default route start">
          <select
            value={form.defaultStart}
            onChange={(e) =>
              setForm({
                ...form,
                defaultStart: e.target.value as Initial['defaultStart'],
              })
            }
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
          >
            <option value="OFFICE">Office</option>
            <option value="HOME">Home</option>
            <option value="LAST_STOP">Last stop</option>
            <option value="CUSTOM">Custom (pick each time)</option>
          </select>
        </Field>
        <Field label="Preferred map app">
          <select
            value={form.preferredMapApp}
            onChange={(e) =>
              setForm({
                ...form,
                preferredMapApp: e.target.value as Initial['preferredMapApp'],
              })
            }
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
          >
            <option value="GOOGLE">Google Maps</option>
            <option value="APPLE">Apple Maps</option>
          </select>
        </Field>
      </div>

      <Field label="Notifications">
        <div className="space-y-1.5">
          <PrefToggle
            label="Task due reminders"
            checked={form.notificationPrefs.taskDue}
            onChange={(v) => setPref('taskDue', v)}
          />
          <PrefToggle
            label="Stage changes on my partners"
            checked={form.notificationPrefs.stageChange}
            onChange={(v) => setPref('stageChange', v)}
          />
          <PrefToggle
            label="Activations (balloon moments) 🎈"
            checked={form.notificationPrefs.activation}
            onChange={(v) => setPref('activation', v)}
          />
          <PrefToggle
            label="@mentions in comments"
            checked={form.notificationPrefs.mentionInComment}
            onChange={(v) => setPref('mentionInComment', v)}
          />
        </div>
      </Field>

      <PrefToggle
        label="Play sound effects (balloon pop, tick on task complete)"
        checked={form.soundEffects}
        onChange={(v) => setForm({ ...form, soundEffects: v })}
      />

      <div className="flex items-center gap-3 border-t border-card-border pt-4">
        <Button type="submit" loading={isPending}>
          Save changes
        </Button>
        {status === 'saved' && <span className="text-sm text-green-700">Saved.</span>}
        {error && <span className="text-sm text-red-700">{error}</span>}
      </div>
    </form>
  );
}

function PrefToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-gray-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded"
      />
      {label}
    </label>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-gray-600">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
