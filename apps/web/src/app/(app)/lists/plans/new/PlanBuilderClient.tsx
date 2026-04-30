'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@partnerradar/ui';
import { createPlan } from '../actions';

interface Market {
  id: string;
  name: string;
  address: string;
  defaultCenter: { lat: number; lng: number } | null;
}

const COUNTS = [10, 20, 30, 50];

export function PlanBuilderClient({ markets }: { markets: Market[] }) {
  const router = useRouter();
  const [, start] = useTransition();
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const [marketId, setMarketId] = useState(markets[0]?.id ?? '');
  const market = markets.find((m) => m.id === marketId);
  const [label, setLabel] = useState('');
  const [firstDay, setFirstDay] = useState(todayStr);
  const [startAddress, setStartAddress] = useState(market?.address ?? '');
  const [pickerCount, setPickerCount] = useState(20);
  const [minutesPerStop, setMinutesPerStop] = useState(15);
  const [startHour, setStartHour] = useState(9);
  const [endHour, setEndHour] = useState(17);
  const [lunchEnabled, setLunchEnabled] = useState(true);
  const [lunchHour, setLunchHour] = useState(12);
  const [endMode, setEndMode] = useState<'END_AT_HOME' | 'LAST_STOP'>('END_AT_HOME');
  const [maxDays, setMaxDays] = useState(5);
  const [foldInAppointments, setFoldInAppointments] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    if (!market) {
      setError('Pick a market first');
      return;
    }
    if (!startAddress.trim()) {
      setError('Enter a starting address');
      return;
    }
    if (!market.defaultCenter) {
      setError('Market has no default center yet — admin needs to set it.');
      return;
    }
    start(async () => {
      try {
        const r = await createPlan({
          marketId: market.id,
          label,
          startAddress: startAddress.trim(),
          startLat: market.defaultCenter!.lat,
          startLng: market.defaultCenter!.lng,
          endMode,
          minutesPerStop,
          startTimeMin: startHour * 60,
          endTimeMin: endHour * 60,
          lunchStartMin: lunchEnabled ? lunchHour * 60 : null,
          lunchDurationMin: lunchEnabled ? 60 : null,
          picker: { kind: 'closest', count: pickerCount },
          firstDay,
          maxDays,
          foldInAppointments,
        });
        router.push(`/lists/plans/${r.id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Plan failed');
      }
    });
  }

  return (
    <div className="mt-5 grid gap-4 lg:grid-cols-2">
      <Card title="Where + when">
        <div className="space-y-3">
          <div>
            <label className="block text-[11px] font-medium text-gray-700">Market</label>
            <select
              value={marketId}
              onChange={(e) => {
                setMarketId(e.target.value);
                const m = markets.find((x) => x.id === e.target.value);
                if (m?.address) setStartAddress(m.address);
              }}
              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            >
              {markets.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-700">Plan label</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Westside loop"
              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-700">First day</label>
            <input
              type="date"
              value={firstDay}
              onChange={(e) => setFirstDay(e.target.value)}
              className="mt-1 w-40 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-700">Start address</label>
            <input
              value={startAddress}
              onChange={(e) => setStartAddress(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
            <p className="mt-1 text-[10.5px] text-gray-500">
              Routing uses the market&apos;s map center as the starting lat/lng — refine in a future
              commit when we wire address geocoding.
            </p>
          </div>
        </div>
      </Card>

      <Card title="How many partners">
        <div className="space-y-3">
          <div>
            <label className="block text-[11px] font-medium text-gray-700">
              Closest partners to start
            </label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {COUNTS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPickerCount(n)}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    pickerCount === n
                      ? 'bg-primary text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {n}
                </button>
              ))}
              <input
                type="number"
                value={pickerCount}
                onChange={(e) => setPickerCount(Math.max(1, parseInt(e.target.value, 10) || 0))}
                className="w-20 rounded-md border border-gray-300 px-2 py-1 text-xs"
              />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-700">Minutes per stop</label>
            <input
              type="number"
              min={5}
              value={minutesPerStop}
              onChange={(e) => setMinutesPerStop(parseInt(e.target.value, 10) || 15)}
              className="mt-1 w-20 rounded-md border border-gray-300 px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-700">Max days</label>
            <input
              type="number"
              min={1}
              max={14}
              value={maxDays}
              onChange={(e) => setMaxDays(parseInt(e.target.value, 10) || 5)}
              className="mt-1 w-20 rounded-md border border-gray-300 px-2 py-1 text-sm"
            />
          </div>
        </div>
      </Card>

      <Card title="Working hours">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <label className="block w-24 text-[11px] font-medium text-gray-700">Start</label>
            <input
              type="number"
              min={5}
              max={12}
              value={startHour}
              onChange={(e) => setStartHour(parseInt(e.target.value, 10) || 9)}
              className="w-16 rounded-md border border-gray-300 px-2 py-1 text-sm"
            />
            <span className="text-xs text-gray-500">:00</span>
          </div>
          <div className="flex items-center gap-3">
            <label className="block w-24 text-[11px] font-medium text-gray-700">End</label>
            <input
              type="number"
              min={12}
              max={22}
              value={endHour}
              onChange={(e) => setEndHour(parseInt(e.target.value, 10) || 17)}
              className="w-16 rounded-md border border-gray-300 px-2 py-1 text-sm"
            />
            <span className="text-xs text-gray-500">:00</span>
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={lunchEnabled}
              onChange={(e) => setLunchEnabled(e.target.checked)}
            />
            Lunch break ({lunchHour}:00 – {lunchHour + 1}:00)
          </label>
          {lunchEnabled && (
            <input
              type="number"
              min={11}
              max={14}
              value={lunchHour}
              onChange={(e) => setLunchHour(parseInt(e.target.value, 10) || 12)}
              className="w-16 rounded-md border border-gray-300 px-2 py-1 text-sm"
            />
          )}
        </div>
      </Card>

      <Card title="Routing options">
        <div className="space-y-3">
          <div>
            <label className="block text-[11px] font-medium text-gray-700">End each day at</label>
            <select
              value={endMode}
              onChange={(e) => setEndMode(e.target.value as 'END_AT_HOME' | 'LAST_STOP')}
              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            >
              <option value="END_AT_HOME">Drive back to start</option>
              <option value="LAST_STOP">Wherever the last stop is</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={foldInAppointments}
              onChange={(e) => setFoldInAppointments(e.target.checked)}
            />
            Fold in already-scheduled appointments
          </label>
          <p className="text-[10.5px] text-gray-500">
            Reads your calendar for the planning window and slots existing appointments at their
            fixed times. Stops route around them.
          </p>
        </div>
      </Card>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 lg:col-span-2">
          {error}
        </div>
      )}
      <div className="flex justify-end gap-2 lg:col-span-2">
        <button
          type="button"
          onClick={submit}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover"
        >
          Build plan
        </button>
      </div>
    </div>
  );
}
