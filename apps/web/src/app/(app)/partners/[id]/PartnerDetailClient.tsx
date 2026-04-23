'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Pill, cn } from '@partnerradar/ui';
import { STAGE_COLORS, STAGE_LABELS, ORDERED_STAGES, type PartnerStage } from '@partnerradar/types';
import { ChevronDown, Sparkles, Loader2 } from 'lucide-react';
import { BalloonCelebration } from '@/components/BalloonCelebration';
import { changeStage, activatePartner, addComment } from './actions';

interface Props {
  partnerId: string;
  currentStage: PartnerStage;
  canActivate: boolean;
  canEdit: boolean;
}

/**
 * Top-right action strip on the partner detail page — stage dropdown +
 * Activate button. Activate is the balloon moment (SPEC §3.17).
 */
export function PartnerActionBar({ partnerId, currentStage, canActivate, canEdit }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [stageMenuOpen, setStageMenuOpen] = useState(false);
  const [activating, setActivating] = useState(false);
  const [boomOn, setBoomOn] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const isActivated = currentStage === 'ACTIVATED';

  async function onPickStage(next: PartnerStage) {
    setStageMenuOpen(false);
    if (next === currentStage) return;
    startTransition(async () => {
      await changeStage(partnerId, next);
      router.refresh();
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
      </div>

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
        placeholder="Add a comment… @mentions arrive in Phase 7"
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
