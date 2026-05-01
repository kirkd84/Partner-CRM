'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Pill, cn, DrawerModal } from '@partnerradar/ui';
import { STAGE_COLORS, STAGE_LABELS, ORDERED_STAGES, type PartnerStage } from '@partnerradar/types';
import { ChevronDown, Sparkles, Hammer, MoreHorizontal } from 'lucide-react';
import { BalloonCelebration } from '@/components/BalloonCelebration';
import {
  changeStage,
  changeStageToInactive,
  convertToCustomer,
  activatePartner,
  addComment,
  type CustomerConvertMode,
} from './actions';

interface Props {
  partnerId: string;
  currentStage: PartnerStage;
  canActivate: boolean;
  canEdit: boolean;
  /** True when the partner has already been flagged as a customer */
  isCustomer?: boolean;
}

/**
 * Top-right action strip on the partner detail page — stage dropdown +
 * Activate button. Activate is the balloon moment (SPEC §3.17).
 */
export function PartnerActionBar({
  partnerId,
  currentStage,
  canActivate,
  canEdit,
  isCustomer = false,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [stageMenuOpen, setStageMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [activating, setActivating] = useState(false);
  const [boomOn, setBoomOn] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const isActivated = currentStage === 'ACTIVATED';

  // Inactive-with-reason modal state. Required field — manager hits
  // 'Inactive' from the stage dropdown and we hold them up for a
  // reason (out of market / not responsive / went competitor / etc.)
  // so /reports → Funnel can show why deals die.
  const [inactiveOpen, setInactiveOpen] = useState(false);
  const [inactiveReason, setInactiveReason] = useState('');
  const [inactiveNote, setInactiveNote] = useState('');

  // Customer-conversion modal state. Two modes captured below.
  const [customerOpen, setCustomerOpen] = useState(false);
  const [customerMode, setCustomerMode] = useState<CustomerConvertMode>('partner_and_customer');
  const [customerReason, setCustomerReason] = useState('');
  const [customerNote, setCustomerNote] = useState('');

  async function onPickStage(next: PartnerStage) {
    setStageMenuOpen(false);
    if (next === currentStage) return;
    if (next === 'INACTIVE') {
      // Don't change yet — collect reason first.
      setInactiveReason('');
      setInactiveNote('');
      setInactiveOpen(true);
      return;
    }
    startTransition(async () => {
      await changeStage(partnerId, next);
      router.refresh();
    });
  }

  function onConfirmInactive() {
    if (!inactiveReason.trim()) {
      setToast('A reason is required when marking a partner Inactive.');
      window.setTimeout(() => setToast(null), 3000);
      return;
    }
    startTransition(async () => {
      try {
        await changeStageToInactive(
          partnerId,
          inactiveReason.trim(),
          inactiveNote.trim() || undefined,
        );
        setInactiveOpen(false);
        router.refresh();
      } catch (err) {
        setToast(err instanceof Error ? err.message : 'Could not mark inactive');
      }
    });
  }

  function onConfirmCustomerConvert() {
    if (customerMode === 'customer_only' && !customerReason.trim()) {
      setToast('Pick a reason for archiving as customer-only.');
      window.setTimeout(() => setToast(null), 3000);
      return;
    }
    startTransition(async () => {
      try {
        await convertToCustomer(partnerId, {
          mode: customerMode,
          dormantReason: customerReason.trim() || undefined,
          note: customerNote.trim() || undefined,
        });
        setCustomerOpen(false);
        const msg =
          customerMode === 'partner_and_customer'
            ? 'Marked as a customer — partner record kept.'
            : 'Converted to customer-only — partner archived.';
        setToast(msg);
        window.setTimeout(() => setToast(null), 4000);
        router.refresh();
      } catch (err) {
        setToast(err instanceof Error ? err.message : 'Conversion failed');
      }
    });
  }

  async function onActivate() {
    if (!canActivate || isActivated || activating) return;
    setActivating(true);
    try {
      const result = await activatePartner(partnerId);
      if (!result.alreadyActivated) {
        setBoomOn(true);
        setToast('Partner activated & synced to Storm Cloud 🎉');
        // Haptic-ish feedback on mobile browsers that support it
        if ('vibrate' in navigator) navigator.vibrate?.([30, 40, 60]);
      } else {
        setToast('Already activated — no-op.');
      }
      router.refresh();
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Activation failed');
    } finally {
      setActivating(false);
      window.setTimeout(() => setToast(null), 4500);
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        {/* Stage dropdown */}
        <div className="relative">
          <button
            type="button"
            disabled={!canEdit || isPending}
            onClick={() => setStageMenuOpen((v) => !v)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border border-card-border bg-white px-3 py-1.5 text-[13px] font-medium text-gray-900 hover:bg-gray-50',
              !canEdit && 'cursor-not-allowed opacity-60',
            )}
            aria-haspopup="menu"
            aria-expanded={stageMenuOpen}
          >
            <Pill color={STAGE_COLORS[currentStage]} tone="soft">
              {STAGE_LABELS[currentStage]}
            </Pill>
            <ChevronDown className="h-3.5 w-3.5 opacity-70" />
          </button>
          {stageMenuOpen && canEdit && (
            <div
              className="absolute right-0 top-full z-20 mt-1 w-56 rounded-md border border-gray-200 bg-white shadow-lg"
              role="menu"
            >
              {ORDERED_STAGES.map((stage) => (
                <button
                  key={stage}
                  type="button"
                  onClick={() => onPickStage(stage)}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-gray-50',
                    stage === currentStage && 'bg-gray-50',
                  )}
                  role="menuitem"
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: STAGE_COLORS[stage] }}
                  />
                  <span className="text-gray-900">{STAGE_LABELS[stage]}</span>
                  {stage === currentStage && (
                    <span className="ml-auto text-[10.5px] uppercase tracking-label text-gray-400">
                      current
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Activate button — manager+ only, disabled when already activated */}
        {canActivate && (
          <Button
            type="button"
            onClick={onActivate}
            disabled={isActivated || activating}
            loading={activating}
            className={cn(isActivated && 'cursor-not-allowed opacity-60')}
          >
            <Sparkles className="h-4 w-4" />
            {isActivated ? 'Activated' : 'Activate Partner'}
          </Button>
        )}

        {/* More menu — customer conversion lives here. Manager+ only;
            same gate as Activate since it's a record-state change. */}
        {canEdit && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-card-border bg-white text-gray-600 hover:bg-gray-50"
              aria-label="More partner actions"
              aria-haspopup="menu"
              aria-expanded={moreOpen}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {moreOpen && (
              <div
                className="absolute right-0 top-full z-20 mt-1 w-64 rounded-md border border-gray-200 bg-white shadow-lg"
                role="menu"
                onMouseLeave={() => setMoreOpen(false)}
              >
                <button
                  type="button"
                  onClick={() => {
                    setMoreOpen(false);
                    setCustomerMode('partner_and_customer');
                    setCustomerReason('');
                    setCustomerNote('');
                    setCustomerOpen(true);
                  }}
                  className="flex w-full items-start gap-2 px-3 py-2 text-left text-[13px] hover:bg-gray-50"
                >
                  <Hammer className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-600" />
                  <span>
                    <span className="block font-medium text-gray-900">
                      {isCustomer ? 'Update customer status' : 'Convert to customer'}
                    </span>
                    <span className="block text-[10.5px] text-gray-500">
                      We&apos;re roofing them — keep as partner, or move to customer-only.
                    </span>
                  </span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Inactive-with-reason modal */}
      <DrawerModal
        open={inactiveOpen}
        onClose={() => setInactiveOpen(false)}
        title="Mark partner Inactive"
        footer={
          <>
            <Button variant="secondary" onClick={() => setInactiveOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={onConfirmInactive} loading={isPending}>
              Mark Inactive
            </Button>
          </>
        }
      >
        <p className="text-xs text-gray-600">
          A reason is required so the funnel report can show why deals die. This shows up in the
          audit log.
        </p>
        <label className="mt-3 block">
          <span className="text-[11px] font-medium text-gray-600">
            Reason <span className="text-red-500">*</span>
          </span>
          <select
            value={inactiveReason}
            onChange={(e) => setInactiveReason(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">— Pick a reason —</option>
            <option value="Not responsive">Not responsive</option>
            <option value="Out of market">Out of market</option>
            <option value="Wrong fit / wrong industry">Wrong fit / wrong industry</option>
            <option value="Went with competitor">Went with competitor</option>
            <option value="Lost contact / left company">Lost contact / left company</option>
            <option value="Not interested">Not interested</option>
            <option value="Duplicate of another partner">Duplicate of another partner</option>
            <option value="Other">Other</option>
          </select>
        </label>
        <label className="mt-3 block">
          <span className="text-[11px] font-medium text-gray-600">Optional note</span>
          <textarea
            value={inactiveNote}
            onChange={(e) => setInactiveNote(e.target.value)}
            rows={3}
            placeholder="Any context that's useful next time we re-encounter this partner…"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
      </DrawerModal>

      {/* Customer-conversion modal */}
      <DrawerModal
        open={customerOpen}
        onClose={() => setCustomerOpen(false)}
        title={isCustomer ? 'Update customer status' : 'Convert to customer'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCustomerOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={onConfirmCustomerConvert} loading={isPending}>
              {customerMode === 'partner_and_customer' ? 'Save' : 'Convert + archive'}
            </Button>
          </>
        }
      >
        <p className="text-xs text-gray-600">
          A partner can also be a customer — sometimes we roof a referral partner&apos;s house, or a
          partner becomes just a customer over time. Pick the path that fits.
        </p>
        <div className="mt-3 space-y-2">
          <label
            className={cn(
              'block cursor-pointer rounded-lg border p-3 transition',
              customerMode === 'partner_and_customer'
                ? 'border-primary bg-blue-50/40'
                : 'border-gray-200 hover:border-gray-300',
            )}
          >
            <input
              type="radio"
              name="customer-mode"
              checked={customerMode === 'partner_and_customer'}
              onChange={() => setCustomerMode('partner_and_customer')}
              className="hidden"
            />
            <div className="text-sm font-semibold text-gray-900">Customer + still partnering</div>
            <div className="mt-0.5 text-[11px] text-gray-600">
              We&apos;re roofing for them AND they refer us business. Stays in PartnerRadar; we also
              queue them for Storm so the project lands on their pipeline.
            </div>
          </label>
          <label
            className={cn(
              'block cursor-pointer rounded-lg border p-3 transition',
              customerMode === 'customer_only'
                ? 'border-primary bg-blue-50/40'
                : 'border-gray-200 hover:border-gray-300',
            )}
          >
            <input
              type="radio"
              name="customer-mode"
              checked={customerMode === 'customer_only'}
              onChange={() => setCustomerMode('customer_only')}
              className="hidden"
            />
            <div className="text-sm font-semibold text-gray-900">
              Customer only — archive partner record
            </div>
            <div className="mt-0.5 text-[11px] text-gray-600">
              They aren&apos;t actively referring anymore — only a customer. Stage moves to
              Inactive, partner is archived from active pipeline. Storm push runs the same way.
            </div>
          </label>
        </div>
        {customerMode === 'customer_only' && (
          <label className="mt-3 block">
            <span className="text-[11px] font-medium text-gray-600">
              Why archive? <span className="text-red-500">*</span>
            </span>
            <select
              value={customerReason}
              onChange={(e) => setCustomerReason(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">— Pick a reason —</option>
              <option value="No longer in industry">No longer in industry</option>
              <option value="Stopped referring">Stopped referring</option>
              <option value="Switched roles">Switched roles</option>
              <option value="Just a customer now">Just a customer now</option>
              <option value="Other">Other</option>
            </select>
          </label>
        )}
        <label className="mt-3 block">
          <span className="text-[11px] font-medium text-gray-600">Note (optional)</span>
          <textarea
            value={customerNote}
            onChange={(e) => setCustomerNote(e.target.value)}
            rows={3}
            placeholder="Project address, scope, anything Storm needs to know…"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        {!process.env.NEXT_PUBLIC_STORM_CONFIGURED && (
          <p className="mt-2 text-[11px] text-amber-700">
            Storm push will be queued; it activates automatically once
            <code className="mx-1 rounded bg-amber-50 px-1">STORM_CLOUD_API_KEY</code> is set on
            Railway.
          </p>
        )}
      </DrawerModal>

      <BalloonCelebration show={boomOn} onDone={() => setBoomOn(false)} />

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 rounded-md bg-gray-900 px-4 py-2.5 text-sm text-white shadow-lg"
        >
          {toast}
        </div>
      )}
    </>
  );
}

/**
 * Inline comment composer for the Activity tab. Phase 7 will expand this
 * with @mentions and attachment support; today it's a text box + submit.
 */
export function CommentComposer({
  partnerId,
  canComment,
}: {
  partnerId: string;
  canComment: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    const body = value;
    setValue('');
    startTransition(async () => {
      await addComment(partnerId, body);
      router.refresh();
    });
  }

  if (!canComment) return null;

  return (
    <form onSubmit={onSubmit} className="mt-3 rounded-md border border-card-border bg-white p-3">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Add a comment…"
        rows={2}
        className="w-full resize-none border-0 p-0 text-sm focus:outline-none focus:ring-0"
      />
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[11px] text-gray-400">
          {value.trim() ? `${value.trim().length} / 5000` : ''}
        </span>
        <Button type="submit" disabled={!value.trim() || isPending} loading={isPending} size="sm">
          Post comment
        </Button>
      </div>
    </form>
  );
}
