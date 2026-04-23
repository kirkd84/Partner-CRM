'use client';
import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, DrawerModal } from '@partnerradar/ui';
import { Plus, Search } from 'lucide-react';
import { PARTNER_TYPE_LABELS, type PartnerType } from '@partnerradar/types';
import { createPartner } from './actions';

interface Market {
  id: string;
  name: string;
}
interface Rep {
  id: string;
  name: string;
}

/**
 * Top-right toolbar on /partners — search box + "+ New" drawer.
 * Server actions handle creation; REPs are auto-assigned to themselves.
 */
export function PartnersToolbar({
  markets,
  reps,
  canAssign,
}: {
  markets: Market[];
  reps: Rep[];
  canAssign: boolean; // manager+ may assign to someone else
}) {
  const router = useRouter();
  const sp = useSearchParams();

  // Drawer form state
  const [open, setOpen] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [partnerType, setPartnerType] = useState<PartnerType>('REALTOR');
  const [marketId, setMarketId] = useState(markets[0]?.id ?? '');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [stateCode, setStateCode] = useState('');
  const [zip, setZip] = useState('');
  const [website, setWebsite] = useState('');
  const [assignedRepId, setAssignedRepId] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSearch(value: string) {
    const params = new URLSearchParams(sp?.toString() ?? '');
    if (value) params.set('q', value);
    else params.delete('q');
    router.push(`/partners${params.toString() ? `?${params.toString()}` : ''}`);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!companyName.trim() || !marketId) return;
    startTransition(async () => {
      try {
        await createPartner({
          companyName,
          partnerType,
          marketId,
          address,
          city,
          state: stateCode,
          zip,
          website,
          notes,
          assignedRepId: canAssign && assignedRepId ? assignedRepId : undefined,
        });
        // createPartner redirects to the new partner's detail page
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Could not create partner';
        if (!msg.includes('NEXT_REDIRECT')) setError(msg);
      }
    });
  }

  return (
    <>
      <div className="relative">
        <Search className="absolute left-2.5 top-2 h-4 w-4 text-gray-400" />
        <input
          type="search"
          placeholder="Search partners…"
          defaultValue={sp?.get('q') ?? ''}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSearch((e.target as HTMLInputElement).value);
          }}
          className="w-60 rounded-md border border-gray-300 py-1.5 pl-8 pr-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
        />
      </div>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> New
      </Button>

      <DrawerModal
        open={open}
        onClose={() => setOpen(false)}
        title="New referral partner"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={onSubmit}
              loading={isPending}
              disabled={!companyName.trim() || !marketId}
            >
              Create partner
            </Button>
          </>
        }
      >
        <form onSubmit={onSubmit} className="space-y-3">
          <FormField label="Company name" required>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              autoFocus
              required
              placeholder="ABC Property Management"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Type" required>
              <select
                value={partnerType}
                onChange={(e) => setPartnerType(e.target.value as PartnerType)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
              >
                {(Object.keys(PARTNER_TYPE_LABELS) as PartnerType[]).map((t) => (
                  <option key={t} value={t}>
                    {PARTNER_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Market" required>
              <select
                value={marketId}
                onChange={(e) => setMarketId(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
              >
                {markets.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
          <FormField label="Street address">
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="123 Main St"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </FormField>
          <div className="grid grid-cols-[1fr_80px_100px] gap-3">
            <FormField label="City">
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </FormField>
            <FormField label="State">
              <input
                type="text"
                value={stateCode}
                onChange={(e) => setStateCode(e.target.value.toUpperCase())}
                maxLength={2}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm uppercase focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </FormField>
            <FormField label="ZIP">
              <input
                type="text"
                value={zip}
                onChange={(e) => setZip(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </FormField>
          </div>
          <FormField label="Website">
            <input
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </FormField>
          {canAssign && (
            <FormField label="Assign to">
              <select
                value={assignedRepId}
                onChange={(e) => setAssignedRepId(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
              >
                <option value="">— Unassigned —</option>
                {reps.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </FormField>
          )}
          <FormField label="Notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="How did we hear about them? Openers, referrers, etc."
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </FormField>
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
