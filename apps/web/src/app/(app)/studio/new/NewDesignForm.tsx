'use client';

/**
 * Mobile-first composer: pills at top, huge prompt textarea in the
 * middle, sticky Generate button at the bottom. Prompt suggestions
 * sit below the input as chips the user can tap to auto-fill.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Sparkles, Image as ImageIcon, Square, User } from 'lucide-react';
import { createDesign } from '../designs/actions';

type ContentType = 'FLYER' | 'SOCIAL_POST' | 'BUSINESS_CARD';

const CONTENT_TYPES: Array<{
  key: ContentType;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: 'FLYER', label: 'Flyer', hint: 'One-pager, print-ready', icon: ImageIcon },
  { key: 'SOCIAL_POST', label: 'Social', hint: '1080×1080 square post', icon: Square },
  { key: 'BUSINESS_CARD', label: 'Card', hint: '3.5×2″ card, 300 DPI', icon: User },
];

const SUGGESTIONS: Record<ContentType, string[]> = {
  FLYER: [
    'Flyer for realtors showing our same-day roof inspection service',
    "Supporting Your Client's Property — for property managers",
    'Storm damage flyer with before / after photos',
    'Recent projects showcase grid for prospects',
    'Customer testimonial flyer featuring a five-star review',
  ],
  SOCIAL_POST: [
    'Monday motivation quote from our owner about integrity',
    'Announce a fall roof-check special, 20% off through October',
    'Event teaser for our suite night at Coors Field on April 24',
    'Behind the scenes — meet our project supervisors',
    'Before / after square showing a hail-damage repair',
  ],
  BUSINESS_CARD: [
    'Business card for Sarah Jenkins, Senior Claims Specialist',
    'Referral-partner card for Mike Torres, VP Partnerships',
    'Simple card for new hire, Kris Doyle',
  ],
};

export function NewDesignForm({
  workspaceId,
  hasActiveBrand,
  initialContentType,
}: {
  workspaceId: string;
  hasActiveBrand: boolean;
  initialContentType: ContentType;
}) {
  const router = useRouter();
  const [contentType, setContentType] = useState<ContentType>(initialContentType);
  const [prompt, setPrompt] = useState('');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onGenerate(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!hasActiveBrand) {
      setError(
        'No active brand — ask an admin to approve one in /studio/brands before generating.',
      );
      return;
    }
    if (!prompt.trim()) {
      setError("Type what you want and I'll take it from there.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await createDesign({
          workspaceId,
          prompt,
          contentType,
        });
        router.push(`/studio/designs/${result.id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not create design');
      }
    });
  }

  return (
    <form onSubmit={onGenerate} className="flex min-h-[calc(100vh-56px)] flex-col">
      <section className="flex flex-col gap-4 p-4 sm:gap-5 sm:p-6">
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-label text-gray-500">
            What are we making?
          </label>
          <div
            role="radiogroup"
            className="mt-2 flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible"
          >
            {CONTENT_TYPES.map((t) => {
              const active = t.key === contentType;
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setContentType(t.key)}
                  className={`flex min-w-[120px] shrink-0 flex-col items-start gap-1 rounded-xl border px-3 py-3 text-left transition sm:min-w-[140px] ${
                    active
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className={`h-4 w-4 ${active ? 'text-primary' : 'text-gray-400'}`} />
                    <span className="text-sm font-semibold text-gray-900">{t.label}</span>
                  </div>
                  <span className="text-[11px] text-gray-500">{t.hint}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label
            htmlFor="prompt"
            className="text-[11px] font-semibold uppercase tracking-label text-gray-500"
          >
            Describe it like you're talking to a teammate
          </label>
          <textarea
            id="prompt"
            autoFocus
            rows={5}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              contentType === 'FLYER'
                ? 'Flyer for realtors showing our same-day roof inspection service with emphasis on hassle-free closings'
                : contentType === 'SOCIAL_POST'
                  ? 'Instagram post celebrating our latest five-star review from a happy homeowner'
                  : 'Business card for Sarah Jenkins, Senior Claims Specialist'
            }
            className="mt-2 w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-3 text-base leading-relaxed text-gray-900 placeholder:text-gray-400 focus:border-primary focus:ring-1 focus:ring-primary sm:text-sm"
          />
        </div>

        <div>
          <div className="text-[11px] font-semibold uppercase tracking-label text-gray-500">
            Ideas to riff on
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {SUGGESTIONS[contentType].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setPrompt(s)}
                className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 transition hover:border-primary hover:text-primary"
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {!hasActiveBrand && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            This workspace has no <strong>active brand</strong> yet. Studio needs one to know how
            the design should look.{' '}
            <a href="/studio/brands" className="font-semibold underline">
              Open Brands
            </a>
            .
          </div>
        )}

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}
      </section>

      {/* Sticky action bar — thumb-reachable on phones. */}
      <div className="mt-auto flex items-center gap-3 border-t border-card-border bg-white px-4 py-3 sm:px-6">
        <span className="hidden text-[11px] text-gray-500 sm:block">
          Generation is free while we&apos;re in preview.
        </span>
        <button
          type="submit"
          disabled={isPending || !prompt.trim()}
          className="ml-auto inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Generate
            </>
          )}
        </button>
      </div>
    </form>
  );
}
