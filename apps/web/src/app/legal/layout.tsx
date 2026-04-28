/**
 * Legal pages share a stripped-down chrome — no nav, no auth, just the
 * doc on a clean canvas. Public so RSVP / cadence email recipients can
 * click the footer links without logging in.
 */

import Link from 'next/link';
import { tenant } from '@partnerradar/config';

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  const t = tenant();
  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-card-border bg-white px-4 py-4 sm:px-6">
        <Link href="/" className="text-sm font-semibold text-gray-900">
          {t.brandName}
        </Link>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">{children}</main>
      <footer className="mx-auto max-w-3xl px-4 pb-12 text-[11px] text-gray-500 sm:px-6">
        <div className="flex flex-wrap gap-3">
          <Link href="/legal/terms" className="hover:text-primary">
            Terms
          </Link>
          <Link href="/legal/privacy" className="hover:text-primary">
            Privacy
          </Link>
          <span>·</span>
          <span>{t.legalName}</span>
          <span>·</span>
          <span>{t.physicalAddress}</span>
        </div>
      </footer>
    </div>
  );
}
