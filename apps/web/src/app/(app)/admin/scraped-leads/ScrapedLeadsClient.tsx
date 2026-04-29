'use client';
import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Pill, DrawerModal } from '@partnerradar/ui';
import { Check, Search, X, Info, Users } from 'lucide-react';
import {
  approveLead,
  bulkApproveLeads,
  bulkApproveLeadsAssigned,
  bulkRejectLeads,
  rejectLead,
} from './actions';

interface Lead {
  id: string;
  createdAt: string;
  status: string;
  source: string;
  jobName: string;
  marketName: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  normalized: Record<string, any>;
  sourceLabel: string;
  statusColor: string;
}

type SortKey = 'newest' | 'oldest' | 'company';

export function ScrapedLeadsClient({
  leads,
  reps,
  activeStatus,
}: {
  leads: Lead[];
  reps: { id: string; name: string }[];
  markets: { id: string; name: string }[];
  activeStatus: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Single-row drawers (kept from before — useful for one-off approvals).
  const [rejectOpen, setRejectOpen] = useState<Lead | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [inspectOpen, setInspectOpen] = useState<Lead | null>(null);
  const [assignToRepId, setAssignToRepId] = useState<string>('');

  // Bulk selection.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkRejectOpen, setBulkRejectOpen] = useState(false);
  const [bulkRejectReason, setBulkRejectReason] = useState('');
  const [bulkAssignToRepId, setBulkAssignToRepId] = useState<string>('');

  // Multi-rep assignment modes for batch approval.
  // - 'one'   : assign every selected lead to a single rep (legacy)
  // - 'even'  : round-robin across the picked reps (rep[0], rep[1], rep[2], rep[0]…)
  // - 'area'  : group selected leads by ZIP (or city if no ZIP), then
  //             distribute whole groups across the picked reps. Keeps
  //             reps geographically coherent so they're not driving
  //             across town.
  type AssignMode = 'one' | 'even' | 'area';
  const [assignMode, setAssignMode] = useState<AssignMode>('one');
  const [splitRepIds, setSplitRepIds] = useState<Set<string>>(new Set());
  const [areaGroupBy, setAreaGroupBy] = useState<'zip' | 'city'>('zip');

  // Filters (client-side over the already-loaded 200-lead window).
  const [query, setQuery] = useState('');
  const [partnerTypeFilter, setPartnerTypeFilter] = useState<string>('');
  const [sourceFilter, setSourceFilter] = useState<string>('');
  const [sort, setSort] = useState<SortKey>('newest');

  const [error, setError] = useState<string | null>(null);
  const [batchSummary, setBatchSummary] = useState<string | null>(null);

  // Derive filter dropdown options from the visible leads so we don't
  // surface choices that won't match anything.
  const partnerTypes = useMemo(() => {
    const set = new Set<string>();
    for (const l of leads) {
      const t = l.normalized.partnerType;
      if (typeof t === 'string') set.add(t);
    }
    return [...set].sort();
  }, [leads]);

  const sources = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of leads) m.set(l.source, l.sourceLabel);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [leads]);

  const filteredLeads = useMemo(() => {
    const q = query.trim().toLowerCase();
    let arr = leads.filter((l) => {
      if (partnerTypeFilter && l.normalized.partnerType !== partnerTypeFilter) return false;
      if (sourceFilter && l.source !== sourceFilter) return false;
      if (!q) return true;
      const fields = [
        l.normalized.companyName,
        l.normalized.address,
        l.normalized.city,
        l.normalized.state,
        l.normalized.zip,
        l.normalized.partnerType,
        l.marketName,
        l.sourceLabel,
      ]
        .filter(Boolean)
        .map((s: string) => String(s).toLowerCase());
      return fields.some((f) => f.includes(q));
    });
    arr = [...arr].sort((a, b) => {
      if (sort === 'company') {
        return (a.normalized.companyName ?? '').localeCompare(b.normalized.companyName ?? '');
      }
      const ta = new Date(a.createdAt).getTime();
      const tb = new Date(b.createdAt).getTime();
      return sort === 'newest' ? tb - ta : ta - tb;
    });
    return arr;
  }, [leads, query, partnerTypeFilter, sourceFilter, sort]);

  const visiblePendingIds = useMemo(
    () => filteredLeads.filter((l) => l.status === 'PENDING').map((l) => l.id),
    [filteredLeads],
  );

  const allFilteredSelected =
    visiblePendingIds.length > 0 && visiblePendingIds.every((id) => selected.has(id));

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        for (const id of visiblePendingIds) next.delete(id);
      } else {
        for (const id of visiblePendingIds) next.add(id);
      }
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  /**
   * Compute a per-lead rep assignment given the current mode + selected
   * reps. Always returns one entry per selected lead so the server can
   * iterate without nulls (a null repId still means 'unassigned').
   *
   * 'one': everything to bulkAssignToRepId (or null)
   * 'even': leadsArr[i] → repsArr[i % repsArr.length] — round-robin
   * 'area': group leads by ZIP/city, then deal whole groups to reps in
   *         order; if no ZIP/city is set on a lead it falls in the
   *         catch-all '__none__' bucket which goes to repsArr[0].
   */
  function computeAssignments(): Array<{ leadId: string; assignedRepId: string | null }> {
    const ids = [...selected];
    const idLeadMap = new Map(filteredLeads.map((l) => [l.id, l]));
    const orderedLeads = ids.map((id) => idLeadMap.get(id)).filter(Boolean) as Lead[];

    if (assignMode === 'one') {
      const rep = bulkAssignToRepId || null;
      return orderedLeads.map((l) => ({ leadId: l.id, assignedRepId: rep }));
    }

    const repsArr = [...splitRepIds];
    if (repsArr.length === 0) {
      // Multi-rep mode but no reps picked → leave unassigned.
      return orderedLeads.map((l) => ({ leadId: l.id, assignedRepId: null }));
    }

    if (assignMode === 'even') {
      return orderedLeads.map((l, idx) => ({
        leadId: l.id,
        assignedRepId: repsArr[idx % repsArr.length] ?? null,
      }));
    }

    // 'area' — bucket by ZIP/city, then deal buckets to reps.
    const buckets = new Map<string, Lead[]>();
    for (const l of orderedLeads) {
      const key =
        areaGroupBy === 'zip'
          ? String(l.normalized.zip ?? '__none__')
          : String(l.normalized.city ?? '__none__');
      const arr = buckets.get(key) ?? [];
      arr.push(l);
      buckets.set(key, arr);
    }
    // Sort bucket keys so '__none__' lands last and the assignment is
    // stable run-to-run.
    const keys = [...buckets.keys()].sort((a, b) => {
      if (a === '__none__') return 1;
      if (b === '__none__') return -1;
      return a.localeCompare(b);
    });
    const out: Array<{ leadId: string; assignedRepId: string | null }> = [];
    keys.forEach((k, idx) => {
      const rep = repsArr[idx % repsArr.length] ?? null;
      for (const l of buckets.get(k) ?? []) {
        out.push({ leadId: l.id, assignedRepId: rep });
      }
    });
    return out;
  }

  // Live preview of the distribution: "Sarah: 8 · Jose: 8 · Maria: 7"
  const distributionPreview = useMemo(() => {
    if (selected.size === 0) return null;
    if (assignMode === 'one') {
      const repName = reps.find((r) => r.id === bulkAssignToRepId)?.name;
      if (!repName) return `${selected.size} → unassigned`;
      return `${repName}: ${selected.size}`;
    }
    if (splitRepIds.size === 0) return 'Pick at least one rep above';
    const counts = new Map<string, number>();
    for (const a of computeAssignments()) {
      const k = a.assignedRepId ?? '__unassigned';
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([repId, n]) => {
        const name =
          repId === '__unassigned'
            ? 'Unassigned'
            : (reps.find((r) => r.id === repId)?.name ?? repId);
        return `${name}: ${n}`;
      })
      .join(' · ');
    // computeAssignments depends on selected, splitRepIds, areaGroupBy,
    // bulkAssignToRepId, assignMode — all listed below so the memo
    // recomputes on any of them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, splitRepIds, areaGroupBy, bulkAssignToRepId, assignMode, reps, filteredLeads]);

  function toggleSplitRep(id: string) {
    setSplitRepIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onFilterStatus(next: string) {
    const p = new URLSearchParams(sp?.toString() ?? '');
    if (next === 'PENDING') p.delete('status');
    else p.set('status', next);
    clearSelection();
    router.push(`/admin/scraped-leads${p.toString() ? `?${p.toString()}` : ''}`);
  }

  function onApprove(lead: Lead) {
    setError(null);
    setBatchSummary(null);
    startTransition(async () => {
      try {
        const result = await approveLead({
          leadId: lead.id,
          assignedRepId: assignToRepId || null,
        });
        setAssignToRepId('');
        router.push(`/partners/${result.partnerId}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not approve');
      }
    });
  }

  function onReject() {
    if (!rejectOpen) return;
    setError(null);
    setBatchSummary(null);
    startTransition(async () => {
      try {
        await rejectLead({ leadId: rejectOpen.id, reason: rejectReason });
        setRejectOpen(null);
        setRejectReason('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not reject');
      }
    });
  }

  function onBulkApprove() {
    setError(null);
    setBatchSummary(null);
    const ids = [...selected];
    if (ids.length === 0) return;
    // Multi-rep modes go through the per-lead-assignment endpoint;
    // single-rep mode keeps the original homogenous endpoint so
    // existing call patterns + audit grouping stay intact.
    startTransition(async () => {
      try {
        if (assignMode === 'one') {
          const result = await bulkApproveLeads({
            leadIds: ids,
            assignedRepId: bulkAssignToRepId || null,
          });
          const repName =
            (bulkAssignToRepId && reps.find((r) => r.id === bulkAssignToRepId)?.name) ?? null;
          const head = `Approved ${result.approved} of ${ids.length}`;
          const tail = repName ? ` — assigned to ${repName}` : '';
          const errSuffix = result.errors.length ? ` · ${result.errors.length} failed` : '';
          setBatchSummary(`${head}${tail}.${errSuffix}`);
        } else {
          const assignments = computeAssignments();
          const result = await bulkApproveLeadsAssigned({ assignments });
          const head = `Approved ${result.approved} of ${ids.length}`;
          const summary = distributionPreview ? ` — ${distributionPreview}` : '';
          const errSuffix = result.errors.length ? ` · ${result.errors.length} failed` : '';
          setBatchSummary(`${head}${summary}.${errSuffix}`);
        }
        setBulkAssignToRepId('');
        setSplitRepIds(new Set());
        setAssignMode('one');
        clearSelection();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Bulk approve failed');
      }
    });
  }

  function onBulkReject() {
    setError(null);
    setBatchSummary(null);
    const ids = [...selected];
    if (ids.length === 0) return;
    startTransition(async () => {
      try {
        const result = await bulkRejectLeads({ leadIds: ids, reason: bulkRejectReason });
        const errSuffix = result.errors.length ? ` · ${result.errors.length} failed` : '';
        setBatchSummary(`Rejected ${result.rejected} of ${ids.length}.${errSuffix}`);
        setBulkRejectOpen(false);
        setBulkRejectReason('');
        clearSelection();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Bulk reject failed');
      }
    });
  }

  return (
    <>
      {/* Status tabs */}
      <div className="mt-5 flex items-center gap-2">
        {['PENDING', 'APPROVED', 'REJECTED'].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onFilterStatus(s)}
            className={
              'rounded-md px-3 py-1 text-xs font-medium transition ' +
              (activeStatus === s
                ? 'bg-blue-600 text-white'
                : 'border border-gray-200 text-gray-700 hover:bg-gray-50')
            }
          >
            {s.charAt(0) + s.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="min-w-[200px] flex-1">
          <span className="block text-[10.5px] font-semibold uppercase tracking-label text-gray-500">
            Search
          </span>
          <div className="relative mt-0.5">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Company, city, ZIP…"
              className="w-full rounded-md border border-gray-200 bg-white py-1.5 pl-7 pr-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
        </label>

        {partnerTypes.length > 1 && (
          <label>
            <span className="block text-[10.5px] font-semibold uppercase tracking-label text-gray-500">
              Type
            </span>
            <select
              value={partnerTypeFilter}
              onChange={(e) => setPartnerTypeFilter(e.target.value)}
              className="mt-0.5 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm"
            >
              <option value="">All types</option>
              {partnerTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        )}

        {sources.length > 1 && (
          <label>
            <span className="block text-[10.5px] font-semibold uppercase tracking-label text-gray-500">
              Source
            </span>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="mt-0.5 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm"
            >
              <option value="">All sources</option>
              {sources.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        )}

        <label>
          <span className="block text-[10.5px] font-semibold uppercase tracking-label text-gray-500">
            Sort
          </span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="mt-0.5 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="company">Company A → Z</option>
          </select>
        </label>
      </div>

      <div className="mt-2 text-[11px] text-gray-500">
        Showing {filteredLeads.length} of {leads.length} {activeStatus.toLowerCase()} leads
        {(query || partnerTypeFilter || sourceFilter) && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setPartnerTypeFilter('');
              setSourceFilter('');
            }}
            className="ml-2 text-primary hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {error && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}
      {batchSummary && (
        <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          {batchSummary}
        </div>
      )}

      {/* Bulk action bar — sticky so it stays visible while scrolling.
          Two rows: header (count + reject/approve) and assignment
          controls (mode tabs + rep picker + live preview). */}
      {selected.size > 0 && activeStatus === 'PENDING' && (
        <div className="sticky top-[52px] z-20 mt-3 space-y-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 shadow-sm">
          {/* Top row — counts + actions */}
          <div className="flex flex-wrap items-center gap-2">
            <Users className="h-4 w-4 text-blue-700" />
            <span className="text-sm font-semibold text-blue-900">{selected.size} selected</span>
            <span className="text-blue-300">·</span>
            <button
              type="button"
              onClick={clearSelection}
              className="text-xs text-blue-700 hover:underline"
            >
              Clear
            </button>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setBulkRejectOpen(true)}
                disabled={isPending}
              >
                <X className="h-3.5 w-3.5" /> Reject {selected.size}
              </Button>
              <Button
                size="sm"
                onClick={onBulkApprove}
                loading={isPending}
                disabled={isPending || (assignMode !== 'one' && splitRepIds.size === 0)}
              >
                <Check className="h-3.5 w-3.5" /> Approve {selected.size}
              </Button>
            </div>
          </div>

          {/* Second row — assignment mode + rep picker */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-blue-200 pt-2 text-xs">
            <span className="font-semibold text-blue-900">Assign:</span>
            <div className="flex rounded-md border border-blue-200 bg-white p-0.5">
              {(
                [
                  { id: 'one', label: 'One rep' },
                  { id: 'even', label: 'Split evenly' },
                  { id: 'area', label: 'By area' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setAssignMode(m.id)}
                  className={`rounded px-2 py-0.5 transition ${
                    assignMode === m.id
                      ? 'bg-blue-600 text-white'
                      : 'text-blue-900 hover:bg-blue-50'
                  }`}
                  disabled={isPending}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {assignMode === 'one' && (
              <select
                value={bulkAssignToRepId}
                onChange={(e) => setBulkAssignToRepId(e.target.value)}
                className="rounded-md border border-blue-200 bg-white px-2 py-1"
                disabled={isPending}
              >
                <option value="">Leave unassigned</option>
                {reps.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            )}

            {assignMode !== 'one' && (
              <>
                <span className="text-blue-700">Reps:</span>
                <div className="flex flex-wrap gap-1">
                  {reps.map((r) => {
                    const on = splitRepIds.has(r.id);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => toggleSplitRep(r.id)}
                        disabled={isPending}
                        className={`rounded-full border px-2 py-0.5 transition ${
                          on
                            ? 'border-blue-600 bg-blue-600 text-white'
                            : 'border-blue-200 bg-white text-blue-900 hover:border-blue-400'
                        }`}
                      >
                        {r.name}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {assignMode === 'area' && (
              <>
                <span className="text-blue-700">Group by:</span>
                <select
                  value={areaGroupBy}
                  onChange={(e) => setAreaGroupBy(e.target.value as 'zip' | 'city')}
                  className="rounded-md border border-blue-200 bg-white px-2 py-1"
                  disabled={isPending}
                >
                  <option value="zip">ZIP code</option>
                  <option value="city">City</option>
                </select>
              </>
            )}

            {distributionPreview && (
              <span className="ml-auto rounded-md bg-white px-2 py-1 font-mono text-[11px] text-blue-900">
                {distributionPreview}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="mt-3 overflow-hidden rounded-lg border border-card-border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-[11px] uppercase tracking-label text-gray-500">
            <tr>
              <th className="w-9 px-2 py-2 text-left">
                {activeStatus === 'PENDING' && visiblePendingIds.length > 0 && (
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleSelectAllVisible}
                    aria-label="Select all visible"
                    className="h-3.5 w-3.5 cursor-pointer rounded border-gray-300 text-primary focus:ring-primary"
                  />
                )}
              </th>
              <th className="px-3 py-2 text-left">Company</th>
              <th className="px-3 py-2 text-left">Source</th>
              <th className="px-3 py-2 text-left">Market</th>
              <th className="px-3 py-2 text-left">Address</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredLeads.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-xs text-gray-500">
                  No leads match the current filters.
                </td>
              </tr>
            ) : (
              filteredLeads.map((l) => {
                const n = l.normalized;
                const addr = [n.address, n.city, n.state, n.zip].filter(Boolean).join(', ');
                const isPendingRow = l.status === 'PENDING';
                const isSelected = selected.has(l.id);
                return (
                  <tr
                    key={l.id}
                    className={`transition-colors ${isSelected ? 'bg-blue-50' : 'hover:bg-blue-50/30'}`}
                  >
                    <td className="px-2 py-2">
                      {isPendingRow && (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(l.id)}
                          aria-label={`Select ${n.companyName ?? 'lead'}`}
                          className="h-3.5 w-3.5 cursor-pointer rounded border-gray-300 text-primary focus:ring-primary"
                        />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-semibold text-gray-900">{n.companyName ?? '—'}</div>
                      {n.partnerType && (
                        <div className="text-[11px] text-gray-500">{n.partnerType}</div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Pill tone="soft" color="blue">
                        {l.sourceLabel}
                      </Pill>
                      <div className="mt-0.5 text-[10px] text-gray-400">{l.jobName}</div>
                    </td>
                    <td className="px-3 py-2 text-gray-700">{l.marketName}</td>
                    <td className="px-3 py-2 text-xs text-gray-600">
                      {addr || <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      <Pill tone="soft" color={l.statusColor}>
                        {l.status}
                      </Pill>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setInspectOpen(l)}
                          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                          aria-label="Inspect raw payload"
                        >
                          <Info className="h-4 w-4" />
                        </button>
                        {isPendingRow && (
                          <>
                            <Button size="sm" variant="secondary" onClick={() => setRejectOpen(l)}>
                              <X className="h-3.5 w-3.5" /> Reject
                            </Button>
                            <Button size="sm" onClick={() => onApprove(l)} loading={isPending}>
                              <Check className="h-3.5 w-3.5" /> Approve
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Single-row reject drawer */}
      <DrawerModal
        open={!!rejectOpen}
        onClose={() => {
          setRejectOpen(null);
          setRejectReason('');
        }}
        title={
          rejectOpen ? `Reject — ${rejectOpen.normalized.companyName ?? 'lead'}` : 'Reject lead'
        }
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setRejectOpen(null);
                setRejectReason('');
              }}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={onReject} loading={isPending}>
              Reject
            </Button>
          </>
        }
      >
        <label className="block">
          <span className="text-[11px] font-medium text-gray-600">Reason (shown in audit log)</span>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={4}
            placeholder="e.g. out of market, residential only, duplicate of PR-1234…"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </label>
      </DrawerModal>

      {/* Bulk reject drawer */}
      <DrawerModal
        open={bulkRejectOpen}
        onClose={() => {
          setBulkRejectOpen(false);
          setBulkRejectReason('');
        }}
        title={`Reject ${selected.size} lead${selected.size === 1 ? '' : 's'}`}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setBulkRejectOpen(false);
                setBulkRejectReason('');
              }}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={onBulkReject} loading={isPending}>
              Reject {selected.size}
            </Button>
          </>
        }
      >
        <p className="text-xs text-gray-600">
          Same reason will be applied to all {selected.size} selected leads. They&apos;ll show up as{' '}
          <strong>REJECTED</strong> in the audit log so you can review later.
        </p>
        <label className="mt-3 block">
          <span className="text-[11px] font-medium text-gray-600">Reason</span>
          <textarea
            value={bulkRejectReason}
            onChange={(e) => setBulkRejectReason(e.target.value)}
            rows={4}
            placeholder="e.g. wrong market, residential, low rating, duplicate import"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </label>
      </DrawerModal>

      {/* Inspect drawer */}
      <DrawerModal
        open={!!inspectOpen}
        onClose={() => setInspectOpen(null)}
        title={
          inspectOpen ? `Inspect — ${inspectOpen.normalized.companyName ?? 'lead'}` : 'Inspect'
        }
        width="560px"
        footer={
          <Button variant="secondary" onClick={() => setInspectOpen(null)}>
            Close
          </Button>
        }
      >
        {inspectOpen && (
          <div className="space-y-3">
            {inspectOpen.status === 'PENDING' && reps.length > 0 && (
              <label className="block rounded-lg bg-blue-50 p-3">
                <span className="text-[11px] font-medium text-blue-900">
                  Assign on approval (optional)
                </span>
                <select
                  value={assignToRepId}
                  onChange={(e) => setAssignToRepId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-blue-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="">— Leave unassigned —</option>
                  {reps.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div>
              <div className="mb-1 text-[11px] font-medium uppercase tracking-label text-gray-500">
                Normalized
              </div>
              <pre className="max-h-60 overflow-auto rounded-md bg-gray-50 p-3 text-[11px] text-gray-800">
                {JSON.stringify(inspectOpen.normalized, null, 2)}
              </pre>
            </div>
            <div>
              <div className="mb-1 text-[11px] font-medium uppercase tracking-label text-gray-500">
                Scrape job
              </div>
              <div className="text-xs text-gray-700">
                {inspectOpen.jobName} · {inspectOpen.sourceLabel}
                <br />
                Lead created {new Date(inspectOpen.createdAt).toLocaleString()}
              </div>
            </div>
            {inspectOpen.status !== 'PENDING' && (
              <div className="text-[11px] text-gray-500">
                This lead was already reviewed. Check the{' '}
                <Link
                  href="/admin/audit-log?entity=ScrapedLead"
                  className="text-primary hover:underline"
                >
                  audit log
                </Link>{' '}
                for context.
              </div>
            )}
          </div>
        )}
      </DrawerModal>
    </>
  );
}
