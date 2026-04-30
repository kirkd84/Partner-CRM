'use client';

/**
 * Birthday + business-anniversary capture card on the partner detail.
 *
 * The touchpoints scanner (lib/touchpoints/scan.ts) watches
 * Contact.birth* and Partner.businessAnniversaryOn — without inputs
 * for them in the UI, the feature has no way to populate. This card
 * gives the rep / manager a dedicated spot to fill in those dates
 * for an existing partner.
 *
 * Edits save individually so a half-completed form doesn't lose
 * progress; the optimistic local state mirrors what's on disk after
 * each save.
 */

import { useState, useTransition } from 'react';
import { Card } from '@partnerradar/ui';
import { Cake, Briefcase, Save } from 'lucide-react';
import { setContactBirthday, setBusinessAnniversary } from './actions';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface ContactInput {
  id: string;
  name: string;
  birthMonth: number | null;
  birthDay: number | null;
}

interface Props {
  partnerId: string;
  businessAnniversaryOn: string | null;
  contacts: ContactInput[];
  canEdit: boolean;
}

export function TouchpointFieldsCard({
  partnerId,
  businessAnniversaryOn,
  contacts: initialContacts,
  canEdit,
}: Props) {
  const [annivISO, setAnnivISO] = useState(
    businessAnniversaryOn ? businessAnniversaryOn.slice(0, 10) : '',
  );
  const [contacts, setContacts] = useState(initialContacts);
  const [, start] = useTransition();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);

  function flashSaved(key: string) {
    setSavedKey(key);
    setTimeout(() => setSavedKey((k) => (k === key ? null : k)), 1500);
  }

  function saveAnniv() {
    setSavingId('anniv');
    start(async () => {
      try {
        await setBusinessAnniversary(partnerId, annivISO || null);
        flashSaved('anniv');
      } finally {
        setSavingId(null);
      }
    });
  }

  function saveBirthday(c: ContactInput) {
    setSavingId(c.id);
    start(async () => {
      try {
        await setContactBirthday(partnerId, c.id, c.birthMonth, c.birthDay);
        flashSaved(c.id);
      } finally {
        setSavingId(null);
      }
    });
  }

  function updateContact(id: string, patch: Partial<ContactInput>) {
    setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Cake className="h-4 w-4 text-pink-500" />
          Touchpoints
        </span>
      }
    >
      <div className="space-y-3">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-label text-gray-500">
            <Briefcase className="h-3 w-3" />
            Business anniversary
          </div>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="date"
              value={annivISO}
              onChange={(e) => setAnnivISO(e.target.value)}
              disabled={!canEdit}
              className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-primary focus:ring-1 focus:ring-primary"
            />
            {canEdit && (
              <button
                type="button"
                onClick={saveAnniv}
                disabled={savingId === 'anniv'}
                className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[10.5px] font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
              >
                {savedKey === 'anniv' ? '✓' : <Save className="h-3 w-3" />}
                Save
              </button>
            )}
          </div>
          <p className="mt-1 text-[10.5px] text-gray-500">
            Year is recorded so we can wish them &ldquo;X years in business&rdquo; each anniversary;
            only month + day appear in the rendered congrats message.
          </p>
        </div>

        <div className="border-t border-gray-100 pt-3">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-label text-gray-500">
            <Cake className="h-3 w-3" />
            Contact birthdays
          </div>
          {contacts.length === 0 ? (
            <p className="mt-2 text-xs text-gray-500">Add a contact first to capture birthdays.</p>
          ) : (
            <ul className="mt-1 space-y-2">
              {contacts.map((c) => (
                <li key={c.id} className="flex items-center gap-2">
                  <span className="w-32 truncate text-xs text-gray-700">{c.name}</span>
                  <select
                    value={c.birthMonth ?? ''}
                    onChange={(e) =>
                      updateContact(c.id, {
                        birthMonth: e.target.value ? parseInt(e.target.value, 10) : null,
                      })
                    }
                    disabled={!canEdit}
                    className="rounded border border-gray-300 bg-white px-1.5 py-0.5 text-[11px]"
                  >
                    <option value="">—</option>
                    {MONTHS.map((m, i) => (
                      <option key={m} value={i + 1}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={c.birthDay ?? ''}
                    onChange={(e) =>
                      updateContact(c.id, {
                        birthDay: e.target.value ? parseInt(e.target.value, 10) : null,
                      })
                    }
                    disabled={!canEdit}
                    placeholder="day"
                    className="w-14 rounded border border-gray-300 px-1.5 py-0.5 text-[11px]"
                  />
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => saveBirthday(c)}
                      disabled={savingId === c.id}
                      className="ml-auto inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-1.5 py-0.5 text-[10.5px] font-medium text-gray-600 hover:border-primary hover:text-primary disabled:opacity-60"
                    >
                      {savedKey === c.id ? '✓ Saved' : 'Save'}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[10.5px] text-gray-500">
            Year is intentionally omitted for privacy.
          </p>
        </div>
      </div>
    </Card>
  );
}
