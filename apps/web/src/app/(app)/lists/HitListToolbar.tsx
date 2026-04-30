'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Button, DrawerModal } from '@partnerradar/ui';
import { Plus, MapPinned } from 'lucide-react';
import type { RouteStartMode } from '@partnerradar/types';
import { createHitList } from './actions';

interface Market {
  id: string;
  name: string;
  address: string | null;
}

const START_MODE_LABELS: Record<RouteStartMode, string> = {
  HOME: 'Home address',
  OFFICE: 'Office address',
  LAST_STOP: 'Last completed stop',
  CUSTOM: 'Custom address',
};

export function HitListToolbar({ markets }: { markets: Market[] }) {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayStr);
  const [marketId, setMarketId] = useState(markets[0]?.id ?? '');
  const [startMode, setStartMode] = useState<RouteStartMode>('OFFICE');
  const [startAddress, setStartAddress] = useState(markets[0]?.address ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!date || !marketId) return;
    startTransition(async () => {
      try {
        await createHitList({ date, marketId, startAddress, startMode });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Could not create hit list';
        if (msg.includes('NEXT_REDIRECT')) return;
        if (msg.includes('Unique constraint') || msg.toLowerCase().includes('unique')) {
          setError('You already have a hit list for that date. Open it from the list below.');
        } else {
          setError(msg);
        }
      }
    });
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Link
          href="/lists/plans/new"
          className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
        >
          <MapPinned className="h-4 w-4" /> Plan multi-day route
        </Link>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> New hit list
        </Button>
      </div>

      <DrawerModal
        open={open}
        onClose={() => setOpen(false)}
        title="New hit list"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={onSubmit} loading={isPending} disabled={!date || !marketId}>
              Create hit list
            </Button>
          </>
        }
      >
        <form onSubmit={onSubmit} className="space-y-3">
          <FormField label="Date" required>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </FormField>
          <FormField label="Market" required>
            <select
              value={marketId}
              onChange={(e) => {
                setMarketId(e.target.value);
                const m = markets.find((x) => x.id === e.target.value);
                if (m?.address) setStartAddress(m.address);
              }}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
            >
              {markets.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Start from">
            <select
              value={startMode}
              onChange={(e) => setStartMode(e.target.value as RouteStartMode)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
            >
              {(Object.keys(START_MODE_LABELS) as RouteStartMode[]).map((m) => (
                <option key={m} value={m}>
                  {START_MODE_LABELS[m]}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Start address">
            <input
              type="text"
              value={startAddress}
              onChange={(e) => setStartAddress(e.target.value)}
              placeholder={
                startMode === 'OFFICE' ? 'Defaults to market address' : 'Street, city, state'
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </FormField>
          <p className="text-[11px] text-gray-500">
            You can add partner stops on the list detail page. Drag to reorder, check off as you
            visit.
          </p>
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

function FormField({
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
