'use client';

/**
 * Single-page new-brand form.
 *
 * Captures company + color + voice inputs; hands them to `createBrand`
 * which (a) persists a MwBrand row, (b) runs extractBrandProfile so the
 * BrandProfile JSON is populated, and (c) returns `usedAi: false`
 * with a note when ANTHROPIC_API_KEY isn't set. Submit redirects to
 * /studio/brands with the new brand in TRAINING status.
 *
 * Sample-file upload is stubbed — we collect metadata refs only until
 * R2 storage is wired in a later pass. Dropping real files still
 * works in the form but the file bytes aren't stored anywhere yet.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createBrand } from '../brand-actions';

interface Defaults {
  name: string;
  companyName: string;
  primaryHex: string;
  secondaryHex: string;
  accentHex: string;
  phone: string;
  email: string;
  website: string;
  physicalAddress: string;
  industry: string;
}

export function BrandSetupForm({
  workspaceId,
  defaults,
}: {
  workspaceId: string;
  defaults: Defaults;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({
    ...defaults,
    voiceDescriptors: ['Professional', 'Trustworthy'] as string[],
    dos: '' as string,
    donts: '' as string,
  });
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ usedAi: boolean; notes: string[] } | null>(null);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function submit() {
    setErr(null);
    setResult(null);
    startTransition(async () => {
      try {
        const res = await createBrand({
          workspaceId,
          name: form.name,
          companyName: form.companyName,
          primaryHex: form.primaryHex,
          secondaryHex: form.secondaryHex,
          accentHex: form.accentHex,
          phone: form.phone || undefined,
          email: form.email || undefined,
          website: form.website || undefined,
          physicalAddress: form.physicalAddress || undefined,
          industry: form.industry || undefined,
          voiceDescriptors: form.voiceDescriptors,
          dos: form.dos
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
          donts: form.donts
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
        });
        setResult({ usedAi: res.usedAi, notes: res.notes });
        setTimeout(() => router.push('/studio/brands'), 1500);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Failed');
      }
    });
  }

  const voiceOptions = [
    'Professional',
    'Trustworthy',
    'Friendly',
    'Bold',
    'Technical',
    'Urgent',
    'Warm',
    'Authoritative',
  ];
  function toggleVoice(d: string) {
    update(
      'voiceDescriptors',
      form.voiceDescriptors.includes(d)
        ? form.voiceDescriptors.filter((x) => x !== d)
        : [...form.voiceDescriptors, d],
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <section className="rounded-md border border-card-border bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-900">Identity</h2>
        <p className="mt-1 text-[11px] text-gray-500">
          The name the team sees in the brand picker. Company name is the legal name used on
          CAN-SPAM email footers + flyer bylines.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Brand name">
            <input
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              className="h-9 w-full rounded-md border border-gray-200 px-2 text-sm"
            />
          </Field>
          <Field label="Company name (legal)">
            <input
              value={form.companyName}
              onChange={(e) => update('companyName', e.target.value)}
              className="h-9 w-full rounded-md border border-gray-200 px-2 text-sm"
            />
          </Field>
          <Field label="Industry">
            <input
              value={form.industry}
              onChange={(e) => update('industry', e.target.value)}
              className="h-9 w-full rounded-md border border-gray-200 px-2 text-sm"
            />
          </Field>
          <Field label="Website">
            <input
              value={form.website}
              onChange={(e) => update('website', e.target.value)}
              placeholder="https://…"
              className="h-9 w-full rounded-md border border-gray-200 px-2 text-sm"
            />
          </Field>
          <Field label="Phone">
            <input
              value={form.phone}
              onChange={(e) => update('phone', e.target.value)}
              className="h-9 w-full rounded-md border border-gray-200 px-2 text-sm"
            />
          </Field>
          <Field label="Email">
            <input
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
              className="h-9 w-full rounded-md border border-gray-200 px-2 text-sm"
            />
          </Field>
          <Field label="Physical address (for email footers)" span={2}>
            <input
              value={form.physicalAddress}
              onChange={(e) => update('physicalAddress', e.target.value)}
              className="h-9 w-full rounded-md border border-gray-200 px-2 text-sm"
            />
          </Field>
        </div>
      </section>

      <section className="rounded-md border border-card-border bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-900">Colors</h2>
        <p className="mt-1 text-[11px] text-gray-500">
          Admin picks are the source of truth. AI extraction (when enabled) can suggest additions
          from uploaded samples.
        </p>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <ColorField
            label="Primary"
            value={form.primaryHex}
            onChange={(v) => update('primaryHex', v)}
          />
          <ColorField
            label="Secondary"
            value={form.secondaryHex}
            onChange={(v) => update('secondaryHex', v)}
          />
          <ColorField
            label="Accent"
            value={form.accentHex}
            onChange={(v) => update('accentHex', v)}
          />
        </div>
      </section>

      <section className="rounded-md border border-card-border bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-900">Voice</h2>
        <p className="mt-1 text-[11px] text-gray-500">
          Pick descriptors the AI should match. Dos and don'ts steer every generated headline.
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {voiceOptions.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => toggleVoice(d)}
              className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                form.voiceDescriptors.includes(d)
                  ? 'bg-indigo-600 text-white'
                  : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Do">
            <textarea
              rows={4}
              value={form.dos}
              onChange={(e) => update('dos', e.target.value)}
              placeholder={'One per line:\nUse active voice\nLead with the customer outcome'}
              className="w-full rounded-md border border-gray-200 p-2 text-sm"
            />
          </Field>
          <Field label="Don't">
            <textarea
              rows={4}
              value={form.donts}
              onChange={(e) => update('donts', e.target.value)}
              placeholder={'One per line:\nNo exclamation-point headlines\nNever say "cheap"'}
              className="w-full rounded-md border border-gray-200 p-2 text-sm"
            />
          </Field>
        </div>
      </section>

      <section className="rounded-md border border-dashed border-gray-300 bg-white p-5 text-[12px] text-gray-500">
        <p className="font-semibold text-gray-700">Sample upload (coming soon)</p>
        <p className="mt-1">
          Drag-drop training samples (flyers, social posts) lands in the MW-2 polish pass once R2
          storage + Claude Opus vision are wired. For now the profile is derived from the explicit
          inputs above — still usable by MW-3 template generation.
        </p>
      </section>

      {err ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {err}
        </div>
      ) : null}
      {result ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
          Brand created — {result.usedAi ? 'AI extraction ran' : 'explicit inputs only'}.
          Redirecting to /studio/brands…
          {result.notes.length > 0 ? (
            <ul className="mt-1 list-disc pl-4">
              {result.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={pending || !form.name.trim() || !form.companyName.trim()}
          onClick={submit}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-60"
        >
          {pending ? 'Creating…' : 'Create brand'}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  span,
}: {
  label: string;
  children: React.ReactNode;
  span?: number;
}) {
  return (
    <label className={span === 2 ? 'md:col-span-2' : ''}>
      <span className="block text-[11px] uppercase tracking-label text-gray-500">{label}</span>
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-label text-gray-500">{label}</span>
      <span className="mt-1 flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-8 cursor-pointer rounded border border-gray-200"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 flex-1 rounded-md border border-gray-200 px-2 font-mono text-xs"
        />
      </span>
    </label>
  );
}
