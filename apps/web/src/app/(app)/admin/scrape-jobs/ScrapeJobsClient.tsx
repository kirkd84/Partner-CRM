'use client';

/**
 * /admin/scrape-jobs client island. List + create + run + toggle active +
 * delete. Today only GOOGLE_PLACES has a working runner; other sources
 * are still imported via their own scripts (see /admin/scraped-leads).
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Loader2,
  Play,
  Plus,
  Power,
  PowerOff,
  Trash2,
  RefreshCcw,
  CircleAlert,
  CheckCircle2,
} from 'lucide-react';
import {
  createScrapeJob,
  deleteScrapeJob,
  runScrapeJobNow,
  setScrapeJobActive,
  updateScrapeJobCadence,
} from './actions';

type Source =
  | 'GOOGLE_PLACES'
  | 'NMLS'
  | 'STATE_REALTY'
  | 'STATE_INSURANCE'
  | 'OVERTURE'
  | 'CHAMBER';
type PartnerType =
  | 'REALTOR'
  | 'BROKER'
  | 'MORTGAGE_BROKER'
  | 'LOAN_OFFICER'
  | 'INSURANCE_AGENT'
  | 'PROPERTY_MANAGER'
  | 'CLAIMS_ADJUSTER'
  | 'ATTORNEY'
  | 'CONTRACTOR'
  | 'ROOFER'
  | 'OTHER';

const PARTNER_TYPES: PartnerType[] = [
  'REALTOR',
  'BROKER',
  'MORTGAGE_BROKER',
  'LOAN_OFFICER',
  'INSURANCE_AGENT',
  'PROPERTY_MANAGER',
  'CLAIMS_ADJUSTER',
  'ATTORNEY',
  'CONTRACTOR',
  'ROOFER',
  'OTHER',
];

interface MarketRow {
  id: string;
  name: string;
  timezone: string;
}
interface JobRow {
  id: string;
  name: string;
  source: Source;
  cadence: string;
  active: boolean;
  marketId: string;
  marketName: string;
  leadCount: number;
  lastRunAt: string | null;
  filters: Record<string, unknown> | null;
}

export function ScrapeJobsClient({ jobs, markets }: { jobs: JobRow[]; markets: MarketRow[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const [runMessage, setRunMessage] = useState<{ jobId: string; text: string; ok: boolean } | null>(
    null,
  );
  const [, startTransition] = useTransition();

  function onRun(id: string) {
    setBusyJobId(id);
    setRunMessage(null);
    startTransition(async () => {
      try {
        const result = await runScrapeJobNow(id);
        setRunMessage({
          jobId: id,
          ok: true,
          text: `Inserted ${result.inserted} new · ${result.duplicates} dupes · ${result.errors} errors (of ${result.total} fetched)`,
        });
        router.refresh();
      } catch (err) {
        setRunMessage({
          jobId: id,
          ok: false,
          text: err instanceof Error ? err.message : 'Run failed',
        });
      } finally {
        setBusyJobId(null);
      }
    });
  }

  function onToggleActive(id: string, active: boolean) {
    setBusyJobId(id);
    startTransition(async () => {
      try {
        await setScrapeJobActive(id, !active);
        router.refresh();
      } finally {
        setBusyJobId(null);
      }
    });
  }

  /**
   * Promote a job from manual → daily/weekly without SSH. We accept the
   * preset list (manual/hourly/daily/weekly) plus a free-text "every Nm/h/d"
   * via prompt() so power users aren't blocked by the dropdown.
   */
  function onCadenceChange(id: string, next: string) {
    setBusyJobId(id);
    setRunMessage(null);
    let value = next;
    if (next === '__custom__') {
      const entered = prompt(
        'Enter cadence (e.g. "every 30m", "every 6h", "every 3d"). Leave blank to cancel.',
      );
      if (!entered || !entered.trim()) {
        setBusyJobId(null);
        return;
      }
      value = entered.trim();
    }
    startTransition(async () => {
      try {
        await updateScrapeJobCadence(id, value);
        setRunMessage({ jobId: id, ok: true, text: `Cadence updated to "${value}"` });
        router.refresh();
      } catch (err) {
        setRunMessage({
          jobId: id,
          ok: false,
          text: err instanceof Error ? err.message : 'Cadence update failed',
        });
      } finally {
        setBusyJobId(null);
      }
    });
  }

  function onDelete(id: string) {
    if (!confirm('Delete this scrape job? Existing leads stay in the queue.')) return;
    setBusyJobId(id);
    startTransition(async () => {
      try {
        await deleteScrapeJob(id);
        router.refresh();
      } finally {
        setBusyJobId(null);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">
          {jobs.length} job{jobs.length === 1 ? '' : 's'}
        </p>
        <button
          type="button"
          onClick={() => setCreating(true)}
          disabled={markets.length === 0}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-primary/90 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> New job
        </button>
      </div>

      {jobs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
          No scrape jobs yet. Click <strong>New job</strong> to set up a Google Places search for a
          market.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-card-border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-[11px] uppercase tracking-label text-gray-500">
              <tr>
                <th className="px-3 py-2">Job</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Market</th>
                <th className="px-3 py-2">Filters</th>
                <th className="px-3 py-2">Last run</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id} className="border-t border-gray-100">
                  <td className="px-3 py-2">
                    <div className="font-semibold text-gray-900">{j.name}</div>
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-gray-500">
                      <span>{j.active ? 'Active' : 'Paused'}</span>
                      <span>·</span>
                      <CadenceChip
                        value={j.cadence}
                        disabled={busyJobId === j.id}
                        onChange={(next) => onCadenceChange(j.id, next)}
                      />
                      <span>·</span>
                      <span>
                        {j.leadCount} lead{j.leadCount === 1 ? '' : 's'}
                      </span>
                    </div>
                    {runMessage?.jobId === j.id && (
                      <div
                        className={`mt-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] ${
                          runMessage.ok
                            ? 'bg-emerald-50 text-emerald-800'
                            : 'bg-red-50 text-red-700'
                        }`}
                      >
                        {runMessage.ok ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : (
                          <CircleAlert className="h-3 w-3" />
                        )}
                        {runMessage.text}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-700">{j.source}</td>
                  <td className="px-3 py-2 text-xs text-gray-700">{j.marketName}</td>
                  <td className="px-3 py-2 text-[11px] text-gray-500">
                    {summarizeFilters(j.filters, j.source)}
                  </td>
                  <td className="px-3 py-2 text-[11px] text-gray-500">
                    {j.lastRunAt ? new Date(j.lastRunAt).toLocaleString() : 'Never'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => onRun(j.id)}
                        disabled={busyJobId === j.id || j.source !== 'GOOGLE_PLACES'}
                        title={
                          j.source === 'GOOGLE_PLACES'
                            ? 'Run now'
                            : `Run-now is wired for GOOGLE_PLACES only`
                        }
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-emerald-600 hover:bg-emerald-50 disabled:opacity-40"
                      >
                        {busyJobId === j.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Play className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => onToggleActive(j.id, j.active)}
                        disabled={busyJobId === j.id}
                        title={j.active ? 'Pause' : 'Resume'}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 disabled:opacity-40"
                      >
                        {j.active ? (
                          <PowerOff className="h-3.5 w-3.5" />
                        ) : (
                          <Power className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(j.id)}
                        disabled={busyJobId === j.id}
                        title="Delete"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <NewJobSheet
          markets={markets}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            router.refresh();
          }}
        />
      )}

      <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-[11px] text-blue-900">
        <div className="flex items-center gap-2 font-semibold">
          <RefreshCcw className="h-3.5 w-3.5" /> What runs today
        </div>
        <p className="mt-1">
          GOOGLE_PLACES jobs run on demand via the play button (uses your existing Places key). NMLS
          / state boards / Overture / Chamber sources still ingest via their per-source scripts and
          land in the same queue. Cron-scheduled execution arrives once Inngest is wired.
        </p>
      </div>
    </div>
  );
}

function summarizeFilters(filters: Record<string, unknown> | null, source: Source): string {
  if (!filters) return '—';
  if (source === 'GOOGLE_PLACES') {
    const parts: string[] = [];
    if (filters.partnerType)
      parts.push(String(filters.partnerType).toLowerCase().replace(/_/g, ' '));
    if (filters.radiusMi != null) parts.push(`${filters.radiusMi}mi`);
    if (filters.centerLat != null && filters.centerLng != null) {
      parts.push(
        `${Number(filters.centerLat).toFixed(3)}, ${Number(filters.centerLng).toFixed(3)}`,
      );
    }
    if (filters.maxResults) parts.push(`max ${filters.maxResults}`);
    return parts.join(' · ') || '—';
  }
  return JSON.stringify(filters).slice(0, 80);
}

function NewJobSheet({
  markets,
  onClose,
  onCreated,
}: {
  markets: MarketRow[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [marketId, setMarketId] = useState(markets[0]?.id ?? '');
  const [source, setSource] = useState<Source>('GOOGLE_PLACES');
  const [partnerType, setPartnerType] = useState<PartnerType>('REALTOR');
  const [centerLat, setCenterLat] = useState('');
  const [centerLng, setCenterLng] = useState('');
  const [radiusMi, setRadiusMi] = useState('10');
  const [maxResults, setMaxResults] = useState('60');
  const [cadence, setCadence] = useState('manual');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await createScrapeJob({
          marketId,
          source,
          name,
          cadence,
          filters: {
            partnerType,
            centerLat: centerLat ? Number(centerLat) : undefined,
            centerLng: centerLng ? Number(centerLng) : undefined,
            radiusMi: radiusMi ? Number(radiusMi) : undefined,
            maxResults: maxResults ? Number(maxResults) : undefined,
          },
        });
        onCreated();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not create job');
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 sm:items-center"
      role="dialog"
      aria-modal="true"
    >
      <form
        onSubmit={onSubmit}
        className="w-full max-w-lg rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl"
      >
        <h2 className="text-base font-semibold text-gray-900">New scrape job</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Name" required>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Realtors near downtown"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </Field>
          <Field label="Market" required>
            <select
              value={marketId}
              onChange={(e) => setMarketId(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              {markets.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Source" required>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as Source)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="GOOGLE_PLACES">Google Places (run-now ready)</option>
              <option value="NMLS">NMLS (run via importer)</option>
              <option value="STATE_REALTY">State realty board</option>
              <option value="STATE_INSURANCE">State insurance board</option>
              <option value="OVERTURE">Overture Maps</option>
              <option value="CHAMBER">Chamber of Commerce</option>
            </select>
          </Field>
          <Field label="Cadence" hint="cron or 'manual'">
            <input
              type="text"
              value={cadence}
              onChange={(e) => setCadence(e.target.value)}
              placeholder="manual"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </Field>
        </div>

        {source === 'GOOGLE_PLACES' && (
          <fieldset className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-3">
            <legend className="px-1 text-[11px] font-semibold uppercase tracking-label text-gray-500">
              Google Places filters
            </legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Partner type" required>
                <select
                  value={partnerType}
                  onChange={(e) => setPartnerType(e.target.value as PartnerType)}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                >
                  {PARTNER_TYPES.map((p) => (
                    <option key={p} value={p}>
                      {p.replace(/_/g, ' ').toLowerCase()}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Radius (mi)" required>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="30"
                  value={radiusMi}
                  onChange={(e) => setRadiusMi(e.target.value)}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Center latitude" required>
                <input
                  type="number"
                  step="any"
                  value={centerLat}
                  onChange={(e) => setCenterLat(e.target.value)}
                  placeholder="39.7392"
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Center longitude" required>
                <input
                  type="number"
                  step="any"
                  value={centerLng}
                  onChange={(e) => setCenterLng(e.target.value)}
                  placeholder="-104.9903"
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Max results" hint="cap to control quota">
                <input
                  type="number"
                  min="20"
                  max="200"
                  step="20"
                  value={maxResults}
                  onChange={(e) => setMaxResults(e.target.value)}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                />
              </Field>
            </div>
          </fieldset>
        )}

        {error && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending || !name.trim() || !marketId}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary/90 disabled:opacity-60"
          >
            {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Create job
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * Inline cadence selector for the job row. Common cadences are presets;
 * "Custom…" prompts for an `every Nm/h/d` string so power users can dial
 * in a tighter loop. Anything that doesn't match a preset is surfaced
 * verbatim under the chip so it remains visible.
 */
const CADENCE_PRESETS = ['manual', 'hourly', 'daily', 'weekly'] as const;
function CadenceChip({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (next: string) => void;
}) {
  const normalized = (value ?? '').trim().toLowerCase();
  const isPreset = (CADENCE_PRESETS as readonly string[]).includes(normalized);
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-gray-400">cadence</span>
      <select
        value={isPreset ? normalized : '__custom__'}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-gray-200 bg-white px-1.5 py-0.5 text-[11px] font-medium text-gray-700 hover:border-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
        title="Promote this job to auto-run on a schedule"
      >
        {CADENCE_PRESETS.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
        <option value="__custom__">{isPreset ? 'Custom…' : `Custom: ${value}`}</option>
      </select>
    </span>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-gray-600">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
        {hint && <span className="ml-1 text-[10px] font-normal text-gray-400">— {hint}</span>}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
