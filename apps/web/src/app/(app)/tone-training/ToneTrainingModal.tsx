'use client';

/**
 * First-login tone training modal.
 *
 * Mounts on every app page via the layout. Hides itself when the rep's
 * status is IN_PROGRESS (they dismissed it), CALIBRATED, or
 * REP_APPROVED — so only truly fresh accounts see it pop up.
 *
 * We collect 3–10 samples of real messages the rep has sent to
 * partners. The sample rows are radical: one textarea per slot, with
 * quick add/remove. We cap at 10 — more doesn't noticeably improve
 * the extracted profile and just burns tokens.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, DrawerModal } from '@partnerradar/ui';
import { Sparkles, Plus, Trash2, Mail, MessageSquare, CheckCircle2 } from 'lucide-react';
import {
  saveSamplesAndExtractTone,
  approveExtractedTone,
  dismissToneTraining,
  type ToneSampleInput,
} from './actions';

type Channel = ToneSampleInput['channel'];

type Sample = { text: string; channel: Channel };

const MAX_SAMPLES = 10;
const MIN_SAMPLES = 3;

export function ToneTrainingModal({
  repName,
  aiConfigured,
}: {
  repName: string;
  aiConfigured: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [samples, setSamples] = useState<Sample[]>([
    { text: '', channel: 'email' },
    { text: '', channel: 'email' },
    { text: '', channel: 'email' },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [profileSummary, setProfileSummary] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isApproving, startApprove] = useTransition();

  const validSamples = samples.filter((s) => s.text.trim().length >= 20);
  const canSubmit = validSamples.length >= MIN_SAMPLES;

  function updateSample(idx: number, patch: Partial<Sample>) {
    const next = [...samples];
    next[idx] = { ...next[idx]!, ...patch };
    setSamples(next);
  }

  function addSlot() {
    if (samples.length >= MAX_SAMPLES) return;
    setSamples([...samples, { text: '', channel: 'email' }]);
  }

  function removeSlot(idx: number) {
    const next = [...samples];
    next.splice(idx, 1);
    setSamples(next.length === 0 ? [{ text: '', channel: 'email' }] : next);
  }

  function onExtract() {
    setError(null);
    setProfileSummary(null);
    setSkipped(null);
    startTransition(async () => {
      try {
        const filtered = samples.filter((s) => s.text.trim().length >= 20);
        const r = await saveSamplesAndExtractTone(filtered);
        if (!r.ok) {
          setError(r.error ?? 'Extraction failed');
          return;
        }
        if (r.skipped === 'ai-not-configured') {
          setSkipped(r.profileSummary ?? 'Samples saved.');
          return;
        }
        setProfileSummary(r.profileSummary ?? 'Tone extracted.');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed');
      }
    });
  }

  function onApprove() {
    startApprove(async () => {
      try {
        await approveExtractedTone();
        setOpen(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed');
      }
    });
  }

  function onDismiss() {
    startTransition(async () => {
      try {
        await dismissToneTraining();
        setOpen(false);
        router.refresh();
      } catch {
        setOpen(false);
      }
    });
  }

  return (
    <DrawerModal
      open={open}
      onClose={onDismiss}
      title="Teach Partner Portal your voice"
      width="640px"
      footer={
        profileSummary ? (
          <>
            <Button variant="secondary" onClick={onDismiss}>
              Later
            </Button>
            <Button onClick={onApprove} loading={isApproving}>
              <CheckCircle2 className="h-4 w-4" /> Looks right — use this voice
            </Button>
          </>
        ) : skipped ? (
          <>
            <Button onClick={onDismiss}>Done for now</Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onDismiss}>
              Skip for now
            </Button>
            <Button onClick={onExtract} disabled={!canSubmit} loading={isPending}>
              <Sparkles className="h-4 w-4" /> Extract my tone
            </Button>
          </>
        )
      }
    >
      <div className="space-y-4">
        {!profileSummary && !skipped && (
          <>
            <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-900">
              <p className="font-medium">Hi {repName.split(/\s+/)[0] ?? repName} —</p>
              <p className="mt-1">
                Paste a few real messages you've sent to partners lately (emails or texts). The more
                real-sounding the better. We'll spot your phrases and sign-offs so drafts sound like{' '}
                <strong>you</strong>, not a template. Minimum {MIN_SAMPLES}, maximum {MAX_SAMPLES}.
              </p>
              {!aiConfigured && (
                <p className="mt-2 text-amber-700">
                  Anthropic key isn't set yet — we'll still stash your samples and extract the
                  profile the moment the key lands.
                </p>
              )}
            </div>

            <div className="space-y-2">
              {samples.map((s, idx) => {
                const len = s.text.trim().length;
                const valid = len >= 20;
                return (
                  <div key={idx} className="rounded-md border border-card-border bg-white p-2">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => updateSample(idx, { channel: 'email' })}
                          className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition ${
                            s.channel === 'email'
                              ? 'bg-primary/10 text-primary'
                              : 'text-gray-500 hover:bg-gray-100'
                          }`}
                        >
                          <Mail className="h-3 w-3" /> Email
                        </button>
                        <button
                          type="button"
                          onClick={() => updateSample(idx, { channel: 'sms' })}
                          className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition ${
                            s.channel === 'sms'
                              ? 'bg-primary/10 text-primary'
                              : 'text-gray-500 hover:bg-gray-100'
                          }`}
                        >
                          <MessageSquare className="h-3 w-3" /> SMS
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-mono text-[11px] ${
                            valid ? 'text-gray-500' : 'text-amber-600'
                          }`}
                        >
                          {len} chars{valid ? '' : ' (need 20+)'}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeSlot(idx)}
                          title="Remove this sample"
                          className="rounded p-1 text-gray-400 transition hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                    <textarea
                      value={s.text}
                      onChange={(e) => updateSample(idx, { text: e.target.value })}
                      rows={3}
                      placeholder={
                        s.channel === 'email'
                          ? `Example:\nHi Sarah,\n\nGreat meeting yesterday — I'll pull the Oklahoma shingle numbers together and send them your way tomorrow.\n\n— Kirk`
                          : `Example:\nHey Sarah, just sent you the quote for the hail claim. Text me back if anything looks off — Kirk`
                      }
                      className="w-full resize-y rounded-md border border-gray-200 px-2 py-1.5 font-mono text-xs focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                  </div>
                );
              })}

              {samples.length < MAX_SAMPLES && (
                <button
                  type="button"
                  onClick={addSlot}
                  className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-gray-300 bg-gray-50 py-1.5 text-xs text-gray-500 transition hover:border-primary hover:text-primary"
                >
                  <Plus className="h-3 w-3" /> Add another sample ({samples.length}/{MAX_SAMPLES})
                </button>
              )}
            </div>

            <p className="text-[11px] text-gray-500">
              {validSamples.length}/{MIN_SAMPLES} valid samples so far. Samples are stored privately
              and only used to shape your drafts.
            </p>

            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}
          </>
        )}

        {profileSummary && (
          <div className="space-y-3">
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-label text-emerald-700">
                <Sparkles className="h-3.5 w-3.5" /> Here's what we heard
              </div>
              <div className="font-medium">{profileSummary}</div>
            </div>
            <p className="text-xs text-gray-600">
              If that sounds like you, confirm and we'll steer drafts on it. Otherwise, dismiss and
              re-run from Settings with different samples.
            </p>
          </div>
        )}

        {skipped && !profileSummary && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-label text-amber-700">
              <Sparkles className="h-3.5 w-3.5" /> Saved for later
            </div>
            <div>{skipped}</div>
          </div>
        )}
      </div>
    </DrawerModal>
  );
}
