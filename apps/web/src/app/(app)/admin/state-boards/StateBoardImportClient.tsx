'use client';

import { useState, useTransition } from 'react';
import { Card } from '@partnerradar/ui';
import {
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  Loader2,
  Upload,
} from 'lucide-react';
import Link from 'next/link';
import { uploadStateBoardCsv, type StateBoardUploadResult } from './actions';

const CONFIG_OPTIONS: Array<{ key: string; label: string; download: string }> = [
  {
    key: 'co-realty',
    label: 'Colorado realty (DORA)',
    download: 'https://apps.colorado.gov/dre/data',
  },
  {
    key: 'co-insurance',
    label: 'Colorado insurance',
    download: 'https://doi.colorado.gov/insurance-products/producer-search',
  },
  {
    key: 'tx-realty',
    label: 'Texas realty (TREC)',
    download: 'https://www.trec.texas.gov/license-holder-search',
  },
  {
    key: 'tx-insurance',
    label: 'Texas insurance (TDI)',
    download: 'https://www.tdi.texas.gov/agent/licensee-info-data.html',
  },
  {
    key: 'fl-realty',
    label: 'Florida realty (DBPR)',
    download: 'http://www.myfloridalicense.com/dbpr/sto/file_download/',
  },
  {
    key: 'fl-insurance',
    label: 'Florida insurance (DFS)',
    download: 'https://licenseesearch.fldfs.com/',
  },
];

interface ImportHistoryEntry {
  /** ISO day bucket — DATE(createdAt) of the leads ingested in that import. */
  day: string;
  /** Leads inserted that day. Treated as "this upload's delta vs. prior state." */
  count: number;
}

interface RecentJob {
  id: string;
  name: string;
  source: 'STATE_REALTY' | 'STATE_INSURANCE';
  marketName: string;
  leadCount: number;
  lastRunAt: string | null;
  configKey: string | null;
  uploadedFilename: string | null;
  history: ImportHistoryEntry[];
}

export function StateBoardImportClient({
  markets,
  recentJobs,
}: {
  markets: Array<{ id: string; name: string }>;
  recentJobs: RecentJob[];
}) {
  const [marketId, setMarketId] = useState(markets[0]?.id ?? '');
  const [configKey, setConfigKey] = useState(CONFIG_OPTIONS[0]!.key);
  const [file, setFile] = useState<File | null>(null);
  const [runImmediately, setRunImmediately] = useState(true);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StateBoardUploadResult | null>(null);

  function onUpload(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!marketId) {
      setError('Pick a market.');
      return;
    }
    if (!file) {
      setError('Choose a CSV file.');
      return;
    }
    startTransition(async () => {
      try {
        // Read the file as base64 client-side — server action takes the
        // string. This keeps things simple vs. wrestling with FormData
        // multipart parsing for files >1MB.
        const base64 = await fileToBase64(file);
        const uploaded = await uploadStateBoardCsv({
          marketId,
          configKey,
          csvBase64: base64,
          filename: file.name,
          runImmediately,
        });
        setResult(uploaded);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed.');
      }
    });
  }

  const selectedOption = CONFIG_OPTIONS.find((o) => o.key === configKey);

  return (
    <div className="flex flex-col gap-4">
      <Card title="Upload a state-board CSV">
        <form onSubmit={onUpload} className="space-y-4">
          {markets.length === 0 ? (
            <p className="text-xs text-amber-700">
              You don&apos;t have any markets assigned. Add yourself to a market in{' '}
              <Link href="/admin/markets" className="font-medium text-primary hover:underline">
                /admin/markets
              </Link>{' '}
              first.
            </p>
          ) : (
            <>
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
                  State board
                </label>
                <select
                  value={configKey}
                  onChange={(e) => setConfigKey(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                >
                  {CONFIG_OPTIONS.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {selectedOption && (
                  <p className="mt-1 text-[11px] text-gray-500">
                    Public download:{' '}
                    <a
                      href={selectedOption.download}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline"
                    >
                      {selectedOption.download}
                    </a>
                  </p>
                )}
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

              <label className="flex items-center gap-2 text-xs text-gray-700">
                <input
                  type="checkbox"
                  checked={runImmediately}
                  onChange={(e) => setRunImmediately(e.target.checked)}
                  className="h-3.5 w-3.5"
                />
                Run import immediately after upload
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
                      {result.ran
                        ? `${result.inserted ?? 0} new lead${
                            (result.inserted ?? 0) === 1 ? '' : 's'
                          } added`
                        : 'CSV uploaded; run pending.'}
                    </span>
                    <Link
                      href="/admin/scraped-leads"
                      className="inline-flex items-center gap-0.5 font-medium text-emerald-800 hover:underline"
                    >
                      Review queue <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                  {result.ran && (
                    <div className="mt-1 text-emerald-800/80">
                      {result.total} rows · {result.duplicates} already tracked
                      {result.errors && result.errors > 0 ? ` · ${result.errors} errors` : ''}
                    </div>
                  )}
                  <div className="mt-1 break-all text-emerald-800/60">CSV: {result.csvPath}</div>
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
                {pending ? 'Uploading…' : 'Upload + import'}
              </button>
            </>
          )}
        </form>
      </Card>

      {recentJobs.length > 0 && (
        <Card title="Recent state-board imports">
          <ul className="divide-y divide-gray-100">
            {recentJobs.map((j) => (
              <RecentJobRow key={j.id} job={j} />
            ))}
          </ul>
          <p className="mt-3 text-[10px] text-gray-400">
            “New leads” counts only rows accepted into the queue — duplicates already tracked from a
            prior upload don’t show up here.
          </p>
        </Card>
      )}
    </div>
  );
}

/**
 * Per-job history row. Collapsed view shows the headline (last upload's
 * delta vs prior state); expanded view shows the last 6 imports as a
 * mini-timeline with day + new-lead count, plus an "open in queue" link.
 */
function RecentJobRow({ job }: { job: RecentJob }) {
  const [expanded, setExpanded] = useState(false);
  const lastImport = job.history[0];
  const previous = job.history[1];
  const deltaLabel = lastImport
    ? previous
      ? `${lastImport.count} new vs ${previous.count} prior`
      : `${lastImport.count} new (first import)`
    : null;

  return (
    <li className="py-2">
      <button
        type="button"
        onClick={() => setExpanded((s) => !s)}
        className="flex w-full items-start gap-3 text-left"
      >
        {expanded ? (
          <ChevronDown className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" />
        ) : (
          <ChevronRight className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" />
        )}
        <FileSpreadsheet className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-medium text-gray-900">{job.name}</span>
            {deltaLabel && (
              <span className="flex-shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800">
                {deltaLabel}
              </span>
            )}
          </div>
          <div className="truncate text-[11px] text-gray-500">
            {job.marketName} · {job.leadCount} lead{job.leadCount === 1 ? '' : 's'} total
            {job.lastRunAt ? ` · last run ${new Date(job.lastRunAt).toLocaleString()}` : ''}
          </div>
          {job.uploadedFilename && (
            <div className="truncate text-[10px] text-gray-400">{job.uploadedFilename}</div>
          )}
        </div>
      </button>

      {expanded && (
        <div className="ml-11 mt-2 rounded-md border border-gray-100 bg-gray-50 p-2">
          {job.history.length === 0 ? (
            <p className="text-[11px] text-gray-500">
              No leads ingested under this job yet — upload a CSV and run the import.
            </p>
          ) : (
            <>
              <div className="text-[10px] font-semibold uppercase tracking-label text-gray-500">
                Import history
              </div>
              <ul className="mt-1 space-y-1">
                {job.history.map((entry, idx) => (
                  <li
                    key={entry.day}
                    className="flex items-center justify-between gap-2 text-[11px] text-gray-700"
                  >
                    <span>{formatHistoryDay(entry.day)}</span>
                    <span className="flex items-center gap-2 text-gray-500">
                      {idx === 0 && (
                        <span className="rounded bg-emerald-100 px-1 text-[9px] font-bold uppercase text-emerald-800">
                          latest
                        </span>
                      )}
                      <span className="font-mono">+{entry.count}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <Link
                href="/admin/scraped-leads"
                className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
              >
                Review lead queue <ArrowUpRight className="h-3 w-3" />
              </Link>
            </>
          )}
        </div>
      )}
    </li>
  );
}

function formatHistoryDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result;
      if (typeof r !== 'string') {
        reject(new Error('Unexpected reader result type.'));
        return;
      }
      // result is "data:<mime>;base64,<data>" — strip the prefix.
      const idx = r.indexOf(',');
      resolve(idx >= 0 ? r.slice(idx + 1) : r);
    };
    reader.onerror = () => reject(reader.error ?? new Error('File read failed.'));
    reader.readAsDataURL(file);
  });
}
