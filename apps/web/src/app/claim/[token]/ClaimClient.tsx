'use client';

/**
 * Claim page client — renders the "Claim it" button and every miss
 * state. Keeps the surface tiny on purpose: mobile-first, one primary
 * tap target, no chrome.
 *
 * We let the server action do all the heavy lifting; this component
 * only tracks in-flight state and the post-click outcome so we can
 * switch the view without a full reload.
 */

import { useState, useTransition } from 'react';
import { claim, optIn } from './actions';

type ViewState =
  | { kind: 'open' }
  | { kind: 'already-won' }
  | { kind: 'already-lost' }
  | { kind: 'claimed-by-other' }
  | { kind: 'expired' }
  | { kind: 'canceled' };

interface Props {
  token: string;
  state: ViewState;
  ticketName: string;
  eventName: string;
  eventStartsAt: string;
  eventTimezone: string;
  venueName: string | null;
  venueAddress: string | null;
  offerExpiresAt: string;
  firstName: string;
  wantsFutureOffers: boolean;
  tenant: { brandName: string; legalName: string; physicalAddress: string };
}

export function ClaimClient(props: Props) {
  const [view, setView] = useState<ViewState>(props.state);
  const [pending, startTransition] = useTransition();
  const [optedIn, setOptedIn] = useState(props.wantsFutureOffers);
  const [err, setErr] = useState<string | null>(null);

  const eventDate = formatWhen(new Date(props.eventStartsAt), props.eventTimezone);
  const offerExpires = formatWhen(new Date(props.offerExpiresAt), props.eventTimezone);

  function doClaim() {
    setErr(null);
    startTransition(async () => {
      const res = await claim(props.token);
      if (res.ok) {
        setView({ kind: 'already-won' });
      } else {
        // Translate each reason into a concrete view state.
        if (res.reason === 'already_claimed') setView({ kind: 'claimed-by-other' });
        else if (res.reason === 'expired') setView({ kind: 'expired' });
        else if (res.reason === 'canceled') setView({ kind: 'canceled' });
        else if (res.reason === 'no_capacity') setView({ kind: 'claimed-by-other' });
        else setErr('Something went wrong. Please try again.');
      }
    });
  }

  function doOptIn() {
    startTransition(async () => {
      const res = await optIn(props.token);
      if (res.ok) setOptedIn(true);
    });
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <EventHeader
        eventName={props.eventName}
        eventDate={eventDate}
        venueName={props.venueName}
        venueAddress={props.venueAddress}
      />

      {view.kind === 'open' && (
        <>
          <p className="mt-4 text-gray-900">
            Hi {props.firstName} — a <strong>{props.ticketName}</strong> just opened up. First to
            claim wins.
          </p>
          <p className="mt-1 text-sm text-gray-500">Offer expires {offerExpires}.</p>
          <button
            type="button"
            onClick={doClaim}
            disabled={pending}
            className="mt-5 w-full rounded-full bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-60"
          >
            {pending ? 'Claiming…' : `Claim the ${props.ticketName}`}
          </button>
          {err ? <p className="mt-3 text-sm text-red-600">{err}</p> : null}
        </>
      )}

      {view.kind === 'already-won' && (
        <div className="mt-4 rounded-lg bg-emerald-50 p-4 text-emerald-900">
          <p className="text-base font-semibold">It's yours! 🎉</p>
          <p className="mt-1 text-sm">
            {props.ticketName} is locked to your confirmation for {props.eventName}. Check your
            email for an updated invite.
          </p>
        </div>
      )}

      {(view.kind === 'claimed-by-other' || view.kind === 'already-lost') && (
        <MissBlock
          heading="Someone else grabbed it first."
          body={`The ${props.ticketName} for ${props.eventName} just got claimed by another invitee. Thanks for jumping on it — next time we'll get you there faster.`}
          optedIn={optedIn}
          onOptIn={doOptIn}
          pending={pending}
        />
      )}

      {view.kind === 'expired' && (
        <MissBlock
          heading="This offer expired."
          body={`The offer window closed before anyone claimed the ${props.ticketName}. The organizer may reassign it manually.`}
          optedIn={optedIn}
          onOptIn={doOptIn}
          pending={pending}
        />
      )}

      {view.kind === 'canceled' && (
        <div className="mt-4 rounded-lg bg-gray-50 p-4 text-gray-700">
          <p className="text-base font-semibold">Offer canceled.</p>
          <p className="mt-1 text-sm">
            The organizer canceled this offer. If you have questions, reply to the original invite
            email.
          </p>
        </div>
      )}

      <footer className="mt-6 border-t border-gray-100 pt-4 text-[11px] text-gray-500">
        {props.tenant.legalName} · {props.tenant.physicalAddress}
      </footer>
    </div>
  );
}

function EventHeader(props: {
  eventName: string;
  eventDate: string;
  venueName: string | null;
  venueAddress: string | null;
}) {
  return (
    <>
      <h2 className="text-xl font-semibold text-gray-900">{props.eventName}</h2>
      <p className="mt-1 text-sm text-gray-600">{props.eventDate}</p>
      {props.venueName ? (
        <p className="mt-1 text-sm text-gray-600">
          {props.venueName}
          {props.venueAddress ? (
            <>
              <br />
              <span className="text-gray-500">{props.venueAddress}</span>
            </>
          ) : null}
        </p>
      ) : null}
    </>
  );
}

function MissBlock(props: {
  heading: string;
  body: string;
  optedIn: boolean;
  onOptIn: () => void;
  pending: boolean;
}) {
  return (
    <div className="mt-4 rounded-lg bg-amber-50 p-4">
      <p className="text-base font-semibold text-amber-900">{props.heading}</p>
      <p className="mt-1 text-sm text-amber-900/80">{props.body}</p>
      <div className="mt-4 border-t border-amber-200 pt-3">
        {props.optedIn ? (
          <p className="text-sm font-medium text-amber-900">
            You're on the list for future offers. We'll reach out next time.
          </p>
        ) : (
          <button
            type="button"
            onClick={props.onOptIn}
            disabled={props.pending}
            className="rounded-full border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-900 transition hover:bg-amber-50 disabled:opacity-60"
          >
            {props.pending ? 'Saving…' : 'Add me to future offers'}
          </button>
        )}
      </div>
    </div>
  );
}

function formatWhen(d: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}
