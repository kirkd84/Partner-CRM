'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Pill, DrawerModal } from '@partnerradar/ui';
import { Check, X, Info } from 'lucide-react';
import { approveLead, rejectLead } from './actions';

interface Lead {
  id: string;
  createdAt: string;
  status: string;
  source: string;
  jobName: string;
  marketName: string;
  normalized: Record<string, any>;
  sourceLabel: string;
  statusColor: string;
}

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
  const [rejectOpen, setRejectOpen] = useState<Lead | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [inspectOpen, setInspectOpen] = useState<Lead | null>(null);
  const [assignToRepId, setAssignToRepId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  function onFilterStatus(next: string) {
    const p = new URLSearchParams(sp?.toString() ?? '');
    if (next === 'PENDING') p.delete('status');
    else p.set('status', next);
    router.push(`/admin/scraped-leads${p.toString() ? `?${p.toString()}` : ''}`);
  }

  function onApprove(lead: Lead) {
    setError(null);
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

  return (
    <>
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

      {error && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      <div className="mt-3 overflow-hidden rounded-lg border border-card-border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-[11px] uppercase tracking-label text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">Company</th>
              <th className="px-3 py-2 text-left">Source</th>
              <th className="px-3 py-2 text-left">Market</th>
              <th className="px-3 py-2 text-left">Address</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {leads.map((l) => {
              const n = l.normalized;
              const addr = [n.address, n.city, n.state, n.zip].filter(Boolean).join(', ');
              return (
                <tr key={l.id} className="hover:bg-blue-50/30">
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
                    <Pill tone="soft" color={l.statusColor as any}>
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
                      {l.status === 'PENDING' && (
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
            })}
          </tbody>
        </table>
      </div>

      {/* Reject drawer */}
      <DrawerModal
        open={!!rejectOpen}
        onClose={() => {
          setRejectOpen(null);
          setRejectReason('');
        }}
        title={rejectOpen ? `Reject — ${rejectOpen.normalized.companyName ?? 'lead'}` : 'Reject lead'}
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

      {/* Inspect drawer — shows normalized + raw payload for debugging scrapers */}
      <DrawerModal
        open={!!inspectOpen}
        onClose={() => setInspectOpen(null)}
        title={inspectOpen ? `Inspect — ${inspectOpen.normalized.companyName ?? 'lead'}` : 'Inspect'}
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
                <Link href="/admin/audit-log?entity=ScrapedLead" className="text-primary hover:underline">
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
