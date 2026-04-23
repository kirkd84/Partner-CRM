'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TR, TD, DrawerModal, Button } from '@partnerradar/ui';
import { X } from 'lucide-react';

export interface AuditRowData {
  id: string;
  createdAt: string;
  userId: string | null;
  userName: string;
  entityType: string;
  entityId: string;
  action: string;
  diff: unknown; // Prisma.JsonValue
}

/** Filter bar above the table — user / entity / action / date range. */
export function AuditFilters({
  users,
  entityTypes,
  actions,
}: {
  users: { id: string; name: string }[];
  entityTypes: string[];
  actions: string[];
}) {
  const router = useRouter();
  const sp = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(sp?.toString() ?? '');
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`/admin/audit-log${params.toString() ? `?${params}` : ''}`);
  }
  function clearAll() {
    router.push('/admin/audit-log');
  }
  const hasAnyFilter = ['user', 'entity', 'action', 'from', 'to'].some((k) => sp?.get(k));

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-card-border bg-gray-50 px-6 py-3 text-xs">
      <Select
        label="User"
        value={sp?.get('user') ?? ''}
        onChange={(v) => setParam('user', v)}
        options={[
          { value: '', label: 'All users' },
          ...users.map((u) => ({ value: u.id, label: u.name })),
        ]}
      />
      <Select
        label="Entity"
        value={sp?.get('entity') ?? ''}
        onChange={(v) => setParam('entity', v)}
        options={[
          { value: '', label: 'All entities' },
          ...entityTypes.map((e) => ({ value: e, label: e })),
        ]}
      />
      <Select
        label="Action"
        value={sp?.get('action') ?? ''}
        onChange={(v) => setParam('action', v)}
        options={[
          { value: '', label: 'All actions' },
          ...actions.map((a) => ({ value: a, label: a })),
        ]}
      />
      <DateInput label="From" value={sp?.get('from') ?? ''} onChange={(v) => setParam('from', v)} />
      <DateInput label="To" value={sp?.get('to') ?? ''} onChange={(v) => setParam('to', v)} />
      {hasAnyFilter && (
        <button
          type="button"
          onClick={clearAll}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-gray-500 hover:bg-gray-200"
        >
          <X className="h-3 w-3" /> Clear
        </button>
      )}
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="font-medium text-gray-600">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-gray-300 bg-white px-2 py-1 focus:border-primary focus:ring-1 focus:ring-primary"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function DateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="font-medium text-gray-600">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-gray-300 bg-white px-2 py-1 focus:border-primary focus:ring-1 focus:ring-primary"
      />
    </label>
  );
}

/** One row in the audit table — click to open the diff drawer. */
export function AuditRow({ row }: { row: AuditRowData }) {
  const [open, setOpen] = useState(false);
  const hasDiff = row.diff !== null && row.diff !== undefined;

  return (
    <>
      <TR>
        <TD>
          <span className="font-mono text-xs text-gray-600">
            {new Date(row.createdAt).toLocaleString()}
          </span>
        </TD>
        <TD>
          <span className="text-gray-900">{row.userName}</span>
        </TD>
        <TD>
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-700">
            {row.entityType}
          </span>
        </TD>
        <TD>
          <ActionBadge action={row.action} />
        </TD>
        <TD>
          <span className="font-mono text-[11px] text-gray-500">{row.entityId.slice(-8)}</span>
        </TD>
        <TD className="text-right">
          <button
            type="button"
            onClick={() => setOpen(true)}
            disabled={!hasDiff}
            className="rounded-md px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-gray-300"
          >
            View diff
          </button>
        </TD>
      </TR>

      <DrawerModal
        open={open}
        onClose={() => setOpen(false)}
        title={`${row.action} · ${row.entityType}`}
        footer={<Button onClick={() => setOpen(false)}>Close</Button>}
      >
        <div className="space-y-3 text-sm">
          <Meta label="When" value={new Date(row.createdAt).toLocaleString()} />
          <Meta label="User" value={row.userName} />
          <Meta label="Entity" value={row.entityType} />
          <Meta label="Target ID" value={row.entityId} mono />
          <Meta label="Action" value={row.action} />
          <div>
            <div className="mb-1 text-[10.5px] font-medium uppercase tracking-label text-gray-500">
              Diff
            </div>
            <pre className="max-h-[40vh] overflow-auto rounded-md border border-card-border bg-gray-50 p-3 font-mono text-[11px] leading-relaxed text-gray-800">
              {JSON.stringify(row.diff, null, 2)}
            </pre>
          </div>
        </div>
      </DrawerModal>
    </>
  );
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-20 shrink-0 text-[10.5px] font-medium uppercase tracking-label text-gray-500">
        {label}
      </span>
      <span className={mono ? 'font-mono text-xs text-gray-700' : 'text-gray-900'}>{value}</span>
    </div>
  );
}

function ActionBadge({ action }: { action: string }) {
  const color =
    action.includes('delete') || action === 'deactivate'
      ? 'bg-red-50 text-red-700'
      : action === 'create' ||
          action === 'invite' ||
          action === 'activate' ||
          action === 'reactivate'
        ? 'bg-green-50 text-green-700'
        : action.includes('change') || action === 'update'
          ? 'bg-amber-50 text-amber-700'
          : 'bg-gray-100 text-gray-700';
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${color}`}>{action}</span>;
}
