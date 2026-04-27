'use client';

/**
 * Error boundary for routes — catches anything that throws inside the
 * page tree but above the next/error fallback. Must be a client
 * component per Next 15 (it owns the "Try again" reset closure).
 *
 * Logs to the console rather than to a dedicated error service: when
 * Sentry is wired (no DSN today), swap the console.error for
 * Sentry.captureException(error). Until then, Railway logs hold the
 * stack trace.
 */

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Always log; Railway captures stdout. Hook into Sentry / Logflare
    // here once a logging vendor is wired.
    console.error('[error.tsx]', error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-canvas px-6 text-center">
      <div className="mx-auto flex max-w-md flex-col items-center gap-4">
        <AlertTriangle className="h-10 w-10 text-amber-500" />
        <h1 className="text-2xl font-semibold text-gray-900">Something went wrong</h1>
        <p className="text-sm text-gray-500">
          The page hit an error and couldn&apos;t finish loading. We&apos;ve logged it. Try again,
          or head home if it keeps happening.
        </p>
        {error.digest && (
          <p className="rounded-md bg-gray-100 px-2 py-1 font-mono text-[11px] text-gray-600">
            ref: {error.digest}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-primary/90"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Try again
          </button>
          <a
            href="/radar"
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:border-primary hover:text-primary"
          >
            <Home className="h-3.5 w-3.5" /> Home
          </a>
        </div>
      </div>
    </main>
  );
}
