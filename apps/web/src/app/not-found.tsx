/**
 * Custom 404 — branded, points the user back to where they came from.
 *
 * Next 15 file-based: any unmatched route inside the app falls through
 * to this. Stays a server component (no useState / useEffect) so it
 * renders fast and is cacheable.
 */

import Link from 'next/link';
import { ArrowLeft, Home } from 'lucide-react';
import { tenant } from '@partnerradar/config';

export default function NotFound() {
  const t = tenant();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-canvas px-6 text-center">
      <div className="mx-auto flex max-w-md flex-col items-center gap-4">
        <div className="text-7xl font-bold tracking-tight text-primary/70">404</div>
        <h1 className="text-2xl font-semibold text-gray-900">Page not found</h1>
        <p className="text-sm text-gray-500">
          The link is broken or the page moved. Head back to {t.brandName} home and try again.
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          <Link
            href="/radar"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-primary/90"
          >
            <Home className="h-3.5 w-3.5" /> Home
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:border-primary hover:text-primary"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
