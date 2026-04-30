'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createDrip } from '../actions';

const TRIGGERS: Array<{
  value: 'MANUAL' | 'ON_PARTNER_ACTIVATED' | 'ON_TAG_ADDED';
  label: string;
  hint: string;
}> = [
  {
    value: 'MANUAL',
    label: 'Manual enrollment',
    hint: 'Click "Enroll matching partners" on the drip after adding steps.',
  },
  {
    value: 'ON_PARTNER_ACTIVATED',
    label: 'On partner activation',
    hint: 'Auto-enroll any partner the moment they hit ACTIVATED.',
  },
  {
    value: 'ON_TAG_ADDED',
    label: 'On tag added',
    hint: 'Auto-enroll when a specific PartnerTag is added.',
  },
];

const STAGES = [
  'NEW_LEAD',
  'RESEARCHED',
  'INITIAL_CONTACT',
  'MEETING_SCHEDULED',
  'IN_CONVERSATION',
  'PROPOSAL_SENT',
  'ACTIVATED',
  'INACTIVE',
];

export function NewDripClient() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [trigger, setTrigger] = useState<'MANUAL' | 'ON_PARTNER_ACTIVATED' | 'ON_TAG_ADDED'>(
    'MANUAL',
  );
  const [selectedStages, setSelectedStages] = useState<string[]>(['ACTIVATED']);
  const [tagName, setTagName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  function toggleStage(stage: string) {
    setSelectedStages((prev) =>
      prev.includes(stage) ? prev.filter((s) => s !== stage) : [...prev, stage],
    );
  }

  function submit() {
    setError(null);
    start(async () => {
      try {
        const r = await createDrip({
          name,
          description,
          audienceFilter: { stages: selectedStages },
          triggerType: trigger,
          triggerConfig: trigger === 'ON_TAG_ADDED' ? { tag: tagName } : undefined,
        });
        router.push(`/newsletters/drips/${r.id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create');
      }
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-[11px] font-medium text-gray-700">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. New partner welcome series"
          className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
        />
      </div>
      <div>
        <label className="block text-[11px] font-medium text-gray-700">Description</label>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Internal note — what this drip is for"
          className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
        />
      </div>
      <div>
        <label className="block text-[11px] font-medium text-gray-700">Trigger</label>
        <div className="mt-1 space-y-1">
          {TRIGGERS.map((t) => (
            <label
              key={t.value}
              className="flex cursor-pointer items-start gap-2 rounded-md border border-gray-200 p-2 text-sm hover:bg-gray-50"
            >
              <input
                type="radio"
                name="trigger"
                checked={trigger === t.value}
                onChange={() => setTrigger(t.value)}
                className="mt-0.5"
              />
              <span>
                <span className="block font-medium">{t.label}</span>
                <span className="block text-[11px] text-gray-500">{t.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </div>
      {trigger === 'ON_TAG_ADDED' && (
        <div>
          <label className="block text-[11px] font-medium text-gray-700">Tag name</label>
          <input
            value={tagName}
            onChange={(e) => setTagName(e.target.value)}
            placeholder="e.g. high-priority"
            className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          />
        </div>
      )}
      <div>
        <label className="block text-[11px] font-medium text-gray-700">Audience — stages</label>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {STAGES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => toggleStage(s)}
              className={`rounded-full px-2.5 py-0.5 text-[11px] transition ${
                selectedStages.includes(s)
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {s.replace(/_/g, ' ').toLowerCase()}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[10.5px] text-gray-500">
          Leave empty to target every stage except INACTIVE.
        </p>
      </div>
      {error && (
        <div className="rounded-md bg-red-50 px-2 py-1.5 text-[11px] text-red-700">{error}</div>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={submit}
          disabled={!name.trim()}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          Create drip
        </button>
      </div>
    </div>
  );
}
