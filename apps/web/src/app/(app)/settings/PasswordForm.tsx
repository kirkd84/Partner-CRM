'use client';
import { useState, useTransition } from 'react';
import { Button } from '@partnerradar/ui';
import { changePassword } from './actions';

export function PasswordForm() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus('idle');
    if (next !== confirm) {
      setError('New passwords do not match');
      setStatus('error');
      return;
    }
    startTransition(async () => {
      try {
        await changePassword(current, next);
        setCurrent('');
        setNext('');
        setConfirm('');
        setStatus('saved');
        window.setTimeout(() => setStatus('idle'), 2500);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Change failed');
        setStatus('error');
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Field label="Current password">
        <input
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
          required
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
        />
      </Field>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="New password">
          <input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            required
            minLength={8}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </Field>
        <Field label="Confirm new password">
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
            minLength={8}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" loading={isPending} disabled={!current || !next || !confirm}>
          Change password
        </Button>
        {status === 'saved' && <span className="text-sm text-green-700">Password updated.</span>}
        {error && <span className="text-sm text-red-700">{error}</span>}
      </div>
      <p className="text-[11px] text-gray-400">
        Other active sessions will be signed out immediately.
      </p>
    </form>
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
