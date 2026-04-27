'use client';

/**
 * Global error boundary — catches errors that happen INSIDE the root
 * layout (i.e. so bad even error.tsx couldn't render). Must include
 * its own <html> + <body> because the root layout has thrown.
 *
 * This is the page Kirk sees when something is genuinely broken in
 * production. Keep it inline-styled — if Tailwind didn't load there's
 * a good chance the underlying error is a CSS / build problem and
 * we'd compound it by relying on Tailwind classes.
 */

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[global-error.tsx]', error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          background: '#f5f6f8',
          color: '#111827',
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
        }}
      >
        <div style={{ maxWidth: 480, textAlign: 'center' }}>
          <div style={{ fontSize: 56, marginBottom: 8 }}>⚠️</div>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 8px' }}>Something went wrong</h1>
          <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 16px' }}>
            The app hit a fatal error and couldn&apos;t recover. Try again, or refresh the page.
          </p>
          {error.digest && (
            <p
              style={{
                display: 'inline-block',
                fontSize: 12,
                fontFamily: 'ui-monospace, monospace',
                background: '#f3f4f6',
                padding: '4px 8px',
                borderRadius: 4,
                marginBottom: 16,
              }}
            >
              ref: {error.digest}
            </p>
          )}
          <div>
            <button
              type="button"
              onClick={reset}
              style={{
                background: '#2563eb',
                color: 'white',
                border: 'none',
                padding: '8px 14px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                marginRight: 8,
              }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{
                background: 'white',
                color: '#374151',
                border: '1px solid #d1d5db',
                padding: '8px 14px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 500,
                textDecoration: 'none',
                display: 'inline-block',
              }}
            >
              Home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
