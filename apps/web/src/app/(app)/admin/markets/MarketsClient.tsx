'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, DrawerModal } from '@partnerradar/ui';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { createMarket, updateMarket, deleteMarket } from './actions';

interface MarketForm {
  id?: string;
  name: string;
  timezone: string;
  centerLat: number;
  centerLng: number;
  scrapeRadius: number;
  physicalAddress: string;
}

const DEFAULT_FORM: MarketForm = {
  name: '',
  timezone: 'America/Denver',
  centerLat: 39.7392,
  centerLng: -104.9903,
  scrapeRadius: 25,
  physicalAddress: '',
};

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
];

export function MarketsToolbar() {
  return <MarketDrawerButton triggerStyle="primary" />;
}

function MarketDrawerButton({
  initial,
  triggerStyle = 'primary',
}: {
  initial?: MarketForm;
  triggerStyle?: 'primary' | 'ghost';
} = {}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<MarketForm>(initial ?? DEFAULT_FORM);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isEdit = Boolean(form.id);

  function onOpen() {
    setForm(initial ?? DEFAULT_FORM);
    setError(null);
    setOpen(true);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) return;
    startTransition(async () => {
      try {
        if (isEdit && form.id) {
          await updateMarket(form.id, {
            name: form.name,
            timezone: form.timezone,
            centerLat: form.centerLat,
            centerLng: form.centerLng,
            scrapeRadius: form.scrapeRadius,
            physicalAddress: form.physicalAddress,
          });
        } else {
          await createMarket({
            name: form.name,
            timezone: form.timezone,
            centerLat: form.centerLat,
            centerLng: form.centerLng,
            scrapeRadius: form.scrapeRadius,
            physicalAddress: form.physicalAddress,
          });
        }
        setOpen(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed');
      }
    });
  }

  return (
    <>
      {triggerStyle === 'ghost' ? (
        <button
          type="button"
          onClick={onOpen}
          className="rounded p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-900"
          aria-label="Edit market"
          title="Edit market"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      ) : (
        <Button onClick={onOpen}>
          {isEdit ? (
            <>
              <Pencil className="h-4 w-4" /> Edit
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" /> New market
            </>
          )}
        </Button>
      )}

      <DrawerModal
        open={open}
        onClose={() => setOpen(false)}
        title={isEdit ? `Edit ${initial?.name ?? 'market'}` : 'New market'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={onSubmit} loading={isPending} disabled={!form.name.trim()}>
              {isEdit ? 'Save' : 'Create market'}
            </Button>
          </>
        }
      >
        <form onSubmit={onSubmit} className="space-y-3">
          <Field label="Name" required>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              autoFocus
              required
              placeholder="Denver"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </Field>
          <Field label="Timezone">
            <select
              value={form.timezone}
              onChange={(e) => setForm({ ...form, timezone: e.target.value })}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Center latitude" required>
              <input
                type="number"
                step="0.0001"
                value={form.centerLat}
                onChange={(e) => setForm({ ...form, centerLat: parseFloat(e.target.value) })}
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </Field>
            <Field label="Center longitude" required>
              <input
                type="number"
                step="0.0001"
                value={form.centerLng}
                onChange={(e) => setForm({ ...form, centerLng: parseFloat(e.target.value) })}
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </Field>
          </div>
          <Field label="Scrape radius (mi)">
            <input
              type="number"
              min={1}
              max={250}
              value={form.scrapeRadius}
              onChange={(e) =>
                setForm({ ...form, scrapeRadius: parseInt(e.target.value, 10) || 25 })
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </Field>
          <Field label="Physical address (for CAN-SPAM footer)">
            <input
              type="text"
              value={form.physicalAddress}
              onChange={(e) => setForm({ ...form, physicalAddress: e.target.value })}
              placeholder="4500 Kipling St, Wheat Ridge, CO 80033"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </Field>
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}
        </form>
      </DrawerModal>
    </>
  );
}

export function MarketRowActions({
  market,
  canDelete,
}: {
  market: MarketForm & { id: string };
  canDelete: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onDelete() {
    if (!confirm(`Delete ${market.name}? This cannot be undone.`)) return;
    startTransition(async () => {
      try {
        await deleteMarket(market.id);
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Delete failed');
      }
    });
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <MarketDrawerButton initial={market} triggerStyle="ghost" />
      <button
        type="button"
        onClick={onDelete}
        disabled={!canDelete || isPending}
        title={canDelete ? 'Delete market' : 'Reassign partners / users first'}
        className="rounded p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="Delete market"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-gray-600">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
