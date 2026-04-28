'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus } from 'lucide-react';
import { createTenant } from '../../actions';

export function NewTenantForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [legalName, setLegalName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [fromAddress, setFromAddress] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [primaryHex, setPrimaryHex] = useState('#1e40af');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  // Auto-derive slug from name as the user types — they can override.
  function onNameChange(v: string) {
    setName(v);
    setSlug(
      v
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40),
    );
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const t = await createTenant({
          name,
          slug,
          legalName: legalName || undefined,
          address: address || undefined,
          phone: phone || undefined,
          fromAddress: fromAddress || undefined,
          websiteUrl: websiteUrl || undefined,
          primaryHex,
          adminEmail,
          adminName,
          adminPassword,
        });
        router.push(`/super-admin/tenants/${t.id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not create tenant.');
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Section title="Tenant identity">
        <Field label="Name" required>
          <input
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            required
            placeholder="Acme Roofing Co."
            className={inputCls}
          />
        </Field>
        <Field label="Slug" hint="URL-safe id; auto-derived from name">
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            required
            placeholder="acme-roofing"
            className={inputCls + ' font-mono'}
          />
        </Field>
        <Field label="Legal name" hint="for CAN-SPAM footer + invoices">
          <input
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
            placeholder="Acme Roofing Co., LLC"
            className={inputCls}
          />
        </Field>
        <Field label="Physical address" hint="CAN-SPAM requires this in every email">
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="123 Main St, Denver, CO 80202"
            className={inputCls}
          />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Phone">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(303) 555-1234"
              className={inputCls}
            />
          </Field>
          <Field label="Website">
            <input
              type="url"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://acmeroofing.com"
              className={inputCls}
            />
          </Field>
        </div>
        <Field label="From address" hint="outbound email From: header">
          <input
            value={fromAddress}
            onChange={(e) => setFromAddress(e.target.value)}
            placeholder="Acme <hello@acmeroofing.com>"
            className={inputCls}
          />
        </Field>
        <Field label="Primary brand color">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={primaryHex}
              onChange={(e) => setPrimaryHex(e.target.value)}
              className="h-9 w-12 cursor-pointer rounded-md border border-gray-300"
            />
            <input
              value={primaryHex}
              onChange={(e) => setPrimaryHex(e.target.value)}
              className={inputCls + ' font-mono'}
            />
          </div>
        </Field>
      </Section>

      <Section title="First admin">
        <p className="text-[11px] text-gray-500">
          This person will get full ADMIN access to the new tenant. They&apos;ll be able to invite
          reps + managers from inside the tenant. Hand them the temporary password out-of-band; they
          should rotate it immediately.
        </p>
        <Field label="Admin name" required>
          <input
            value={adminName}
            onChange={(e) => setAdminName(e.target.value)}
            required
            placeholder="Jane Doe"
            className={inputCls}
          />
        </Field>
        <Field label="Admin email" required>
          <input
            type="email"
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
            required
            placeholder="jane@acmeroofing.com"
            className={inputCls}
          />
        </Field>
        <Field
          label="Temporary password"
          required
          hint="≥10 chars; admin should rotate on first login"
        >
          <input
            type="text"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            required
            minLength={10}
            placeholder="ChangeMe!2026"
            className={inputCls + ' font-mono'}
          />
        </Field>
      </Section>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-md bg-purple-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-purple-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        {pending ? 'Creating tenant…' : 'Create tenant'}
      </button>
    </form>
  );
}

const inputCls =
  'w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3 border-t border-gray-100 pt-4 first:border-t-0 first:pt-0">
      <legend className="text-[11px] font-semibold uppercase tracking-label text-gray-600">
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold text-gray-700">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-[10.5px] text-gray-500">{hint}</p>}
    </div>
  );
}
