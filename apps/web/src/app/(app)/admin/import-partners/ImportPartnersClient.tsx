'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Card } from '@partnerradar/ui';
import { ArrowRight, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { importPartnersCsv, type PartnerImportResult } from './actions';

const PARTNER_TYPES = [
  'REALTOR',
  'PROPERTY_MANAGER',
  'INSURANCE_AGENT',
  'MORTGAGE_BROKER',
  'HOME_INSPECTOR',
  'PUBLIC_ADJUSTER',
  'REAL_ESTATE_ATTORNEY',
  'HVAC',
  'PLUMBING',
  'ELECTRICAL',
  'LANDSCAPER',
  'GENERAL_CONTRACTOR',
  'RESTORATION_MITIGATION',
  'FACILITIES_MANAGER_COMMERCIAL',
  'OTHER',
] as const;
type PartnerType = (typeof PARTNER_TYPES)[number];

export function ImportPartnersClient({
  markets,
}: {
  markets: Array<{ id: string; name: string }>;
}) {
  const [marketId, setMarketId] = useState(markets[0]?.id ?? '');
  const [defaultType, setDefaultType] = useState<PartnerType>('REALTOR');
  const [overwrite, setOverwrite] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PartnerImportResult | null>(null);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!marketId) return setError('Pick a market.');
    if (!file) return setError('Choose a CSV file.');
    startTransition(async () => {
      try {
        const base64 = await fileToBase64(file);
        const res = await importPartnersCsv({
          marketId,
          csvBase64: base64,
          filename: file.name,
          defaultPartnerType: defaultType,
          overwriteExisting: overwrite,
        });
        setResult(res);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Import failed.');
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card title="Upload your partner CSV">
        {markets.length === 0 ? (
          <p className="text-xs text-amber-700">
            You don&apos;t have any markets yet. Create one first in{' '}
            <Link href="/admin/markets" className="font-medium text-primary hover:underline">
              /admin/markets
            </Link>
            .
          </p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-label text-gray-600">
                Market
              </label>
              <select
                value={marketId}
                onChange={(e) => setMarketId(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
              >
                {markets.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-label text-gray-600">
                Default partner type
              </label>
              <select
                value={defaultType}
                onChange={(e) => setDefaultType(e.target.value as PartnerType)}
                className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
              >
                {PARTNER_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/_/g, ' ').toLowerCase()}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-gray-500">
                Used when a row in the CSV doesn&apos;t have a <code>partner_type</code> /{' '}
                <code>type</code> column. Per-row values still take precedence.
              </p>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-label text-gray-600">
                CSV file
              </label>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-primary/90"
              />
              {file && (
                <p className="mt-1 text-[11px] text-gray-500">
                  {file.name} · {(file.size / 1024).toFixed(0)} KB
                </p>
              )}
            </div>

            <label className="flex items-start gap-2 text-xs text-gray-700">
              <input
                type="checkbox"
                checked={overwrite}
                onChange={(e) => setOverwrite(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5"
              />
              <span>
                <span className="font-medium">Overwrite existing matches</span>
                <span className="ml-1 text-gray-500">
                  Refresh contact info / address on partners already in the system. Stage is never
                  bumped backwards.
                </span>
              </span>
            </label>

            {error && (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">
                {error}
              </p>
            )}

            {result && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-[11px] text-emerald-900">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">
                    {result.inserted} new · {result.updated} updated · {result.skipped} skipped
                  </span>
                  <Link
                    href="/partners"
                    className="inline-flex items-center gap-0.5 font-medium text-emerald-800 hover:underline"
                  >
                    Open partners <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
                <div className="mt-1 text-emerald-800/80">
                  {result.total} total rows
                  {result.errors > 0 ? ` · ${result.errors} errors` : ''}
                </div>
                {result.sampleErrors.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-[11px] text-red-700">
                      Show first {result.sampleErrors.length} error
                      {result.sampleErrors.length === 1 ? '' : 's'}
                    </summary>
                    <ul className="mt-1 list-disc pl-4 text-[11px] text-red-700">
                      {result.sampleErrors.map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={pending || !file || !marketId}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              {pending ? 'Importing…' : 'Import partners'}
            </button>
          </form>
        )}
      </Card>

      <Card title="CSV format — accepted columns">
        <p className="mb-2 text-xs text-gray-500">
          Headers are case-insensitive. Aliases are supported so a CSV from any common CRM should
          work without renaming columns.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="text-gray-600">
              <tr>
                <th className="border-b border-gray-100 px-2 py-1 text-left">Field</th>
                <th className="border-b border-gray-100 px-2 py-1 text-left">Aliases</th>
                <th className="border-b border-gray-100 px-2 py-1 text-left">Required?</th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              {[
                ['companyName', 'company, name, business, account', 'yes'],
                ['partnerType', 'type, partner_type, category', 'no (default applies)'],
                ['stage', 'status', 'no'],
                ['address', 'street, address1', 'no'],
                ['city', 'town', 'no'],
                ['state', 'province', 'no'],
                ['zip', 'postal_code, zipcode, postcode', 'no'],
                ['phone', 'phone_number, tel', 'no'],
                ['website', 'url, site', 'no'],
                ['notes', 'note, comment', 'no'],
                ['contactName', 'contact, primary_contact', 'no'],
                ['contactEmail', 'email, email_address', 'no'],
                ['contactPhone', 'mobile, cell', 'no'],
                ['contactTitle', 'title, role, job_title', 'no'],
              ].map(([f, a, r]) => (
                <tr key={f} className="border-b border-gray-50">
                  <td className="px-2 py-1 font-mono">{f}</td>
                  <td className="px-2 py-1 text-gray-500">{a}</td>
                  <td className="px-2 py-1 text-gray-500">{r}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] text-gray-500">
          <span className="font-medium">Stage values</span> are forgiving: <code>active</code> →{' '}
          <code>ACTIVATED</code>, <code>won</code> → <code>ACTIVATED</code>, <code>contacted</code>{' '}
          → <code>INITIAL_CONTACT</code>, <code>lost</code> → <code>INACTIVE</code>, etc.
        </p>
      </Card>

      <Card title="What happens after import">
        <ul className="list-disc pl-4 text-xs text-gray-700">
          <li>
            Partners go directly into the active{' '}
            <Link href="/partners" className="text-primary hover:underline">
              /partners
            </Link>{' '}
            table — no review step.
          </li>
          <li>
            Dedup: an existing partner with the same name in the same market is left alone (or
            refreshed if you tick the overwrite box). Stage is never bumped backwards.
          </li>
          <li>
            Each new partner gets one primary <FileSpreadsheet className="mb-0.5 inline h-3 w-3" />{' '}
            Contact row when contact info is present in the CSV.
          </li>
          <li>The import is recorded in the audit log with the row count + filename.</li>
        </ul>
      </Card>
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result;
      if (typeof r !== 'string') {
        reject(new Error('Unexpected reader result.'));
        return;
      }
      const idx = r.indexOf(',');
      resolve(idx >= 0 ? r.slice(idx + 1) : r);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Read failed.'));
    reader.readAsDataURL(file);
  });
}
