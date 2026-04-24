'use client';

/**
 * EV-10: Marketing card on event detail. Three primary actions —
 * generate an Invite flyer, an IG announcement, or a post-event
 * thank-you — each one creates an MwDesign tagged with this event,
 * then redirects to the design detail page where the host can edit
 * and approve.
 *
 * If the workspace has no active brand we surface that instead of
 * silently failing on the action call.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Sparkles,
  Loader2,
  ImageIcon,
  Square,
  Mail,
  HeartHandshake,
  ExternalLink,
} from 'lucide-react';
import { createDesignFromEvent } from '../../studio/designs/actions';

interface ExistingDesign {
  id: string;
  name: string;
  contentType: string;
  status: string;
  updatedAt: string;
  variant: string;
  width: number;
  height: number;
}

interface Props {
  eventId: string;
  hasActiveBrand: boolean;
  existingDesigns: ExistingDesign[];
}

const PRESETS = [
  {
    key: 'invite-flyer' as const,
    label: 'Invite flyer',
    blurb: 'Letter-size, ready to print or email',
    contentType: 'FLYER' as const,
    purpose: 'invite' as const,
    Icon: ImageIcon,
  },
  {
    key: 'ig-announce' as const,
    label: 'Social teaser',
    blurb: '1080×1080 announcement',
    contentType: 'SOCIAL_POST' as const,
    purpose: 'announce' as const,
    Icon: Square,
  },
  {
    key: 'email-header' as const,
    label: 'Email header',
    blurb: 'Banner for the invite email',
    contentType: 'EMAIL_HEADER' as const,
    purpose: 'invite' as const,
    Icon: Mail,
  },
  {
    key: 'thank-you' as const,
    label: 'Thank-you',
    blurb: 'Post-event social card',
    contentType: 'SOCIAL_POST' as const,
    purpose: 'thank-you' as const,
    Icon: HeartHandshake,
  },
];

export function EventMarketingCard({ eventId, hasActiveBrand, existingDesigns }: Props) {
  const router = useRouter();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function onCreate(preset: (typeof PRESETS)[number]) {
    if (!hasActiveBrand) {
      setError('Approve a brand in /studio/brands first.');
      return;
    }
    setError(null);
    setBusyKey(preset.key);
    startTransition(async () => {
      try {
        const { id } = await createDesignFromEvent(eventId, {
          contentType: preset.contentType,
          purpose: preset.purpose,
        });
        router.push(`/studio/designs/${id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not create design');
        setBusyKey(null);
      }
    });
  }

  return (
    <div className="rounded-xl border border-card-border bg-white">
      <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <div className="text-[11px] font-semibold uppercase tracking-label text-gray-500">
          Marketing
        </div>
        <Link
          href="/studio"
          className="ml-auto inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-primary"
        >
          Open Studio <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4">
        {PRESETS.map((p) => {
          const busy = busyKey === p.key;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => onCreate(p)}
              disabled={busy || !hasActiveBrand}
              className="group flex flex-col items-start gap-1 rounded-lg border border-gray-200 bg-white px-3 py-3 text-left transition hover:border-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              <div className="flex items-center gap-1.5">
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : (
                  <p.Icon className="h-4 w-4 text-gray-500 group-hover:text-primary" />
                )}
                <span className="text-sm font-semibold text-gray-900">{p.label}</span>
              </div>
              <span className="text-[11px] text-gray-500">{p.blurb}</span>
            </button>
          );
        })}
      </div>

      {!hasActiveBrand && (
        <div className="mx-3 mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
          No active brand for this market.{' '}
          <Link href="/studio/brands" className="font-semibold underline">
            Approve one
          </Link>{' '}
          and Studio will use it for every event design.
        </div>
      )}
      {error && (
        <div className="mx-3 mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">
          {error}
        </div>
      )}

      {existingDesigns.length > 0 && (
        <div className="border-t border-gray-100 px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-label text-gray-500">
            Designs for this event
          </div>
          <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {existingDesigns.map((d) => {
              const aspect = `${d.width} / ${d.height}`;
              return (
                <li key={d.id}>
                  <Link
                    href={`/studio/designs/${d.id}`}
                    className="group flex flex-col overflow-hidden rounded-md border border-gray-200 bg-white transition hover:shadow-sm"
                  >
                    <div className="relative bg-gray-100" style={{ aspectRatio: aspect }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/studio/designs/${d.id}/png?variant=${d.variant}`}
                        alt={d.name}
                        loading="lazy"
                        className="h-full w-full object-contain transition group-hover:scale-[1.02]"
                      />
                    </div>
                    <div className="px-2 py-1.5">
                      <div className="truncate text-[11px] font-semibold text-gray-900">
                        {d.name}
                      </div>
                      <div className="truncate text-[10px] text-gray-500">
                        {d.contentType.replace(/_/g, ' ').toLowerCase()} · {d.status.toLowerCase()}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
