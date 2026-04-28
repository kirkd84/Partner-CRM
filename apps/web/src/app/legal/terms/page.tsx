/**
 * /legal/terms — public Terms of Service stub.
 *
 * THIS IS A PLACEHOLDER. Replace the body before launch with content
 * from a lawyer or a generator (termly.io, iubenda, getterms.io).
 * Roof Tech's existing site terms may be reusable with edits.
 */

import { tenant } from '@partnerradar/config';
import { AlertTriangle } from 'lucide-react';

export const metadata = { title: 'Terms of Service' };

export default function TermsPage() {
  const t = tenant();
  const lastUpdated = '2026-04-25';
  return (
    <article className="prose prose-sm max-w-none text-gray-800">
      <PreLaunchBanner />
      <h1 className="text-2xl font-semibold text-gray-900">Terms of Service</h1>
      <p className="text-xs text-gray-500">Last updated: {lastUpdated}</p>

      <section>
        <h2 className="mt-6 text-lg font-semibold text-gray-900">1. Acceptance</h2>
        <p>
          By accessing {t.brandName} (the &ldquo;Service&rdquo;), provided by {t.legalName}{' '}
          (&ldquo;we&rdquo;, &ldquo;us&rdquo;), you agree to these Terms. If you do not agree, do
          not use the Service.
        </p>

        <h2 className="mt-6 text-lg font-semibold text-gray-900">2. Eligibility &amp; accounts</h2>
        <p>
          You must be at least 18 and authorized to act on behalf of any organization for which you
          create an account. You are responsible for the security of your credentials and for all
          activity under your account. Notify us immediately at {t.replyToAddress} if you suspect
          unauthorized use.
        </p>

        <h2 className="mt-6 text-lg font-semibold text-gray-900">3. Acceptable use</h2>
        <p>
          You agree not to (a) violate any law, (b) misuse partner contact information, (c) send
          unsolicited bulk communications, (d) reverse-engineer or interfere with the Service, or
          (e) use the Service to harass any person or business.
        </p>

        <h2 className="mt-6 text-lg font-semibold text-gray-900">4. Your content</h2>
        <p>
          You retain ownership of partner records, marketing content, and other data you submit
          (&ldquo;Your Content&rdquo;). You grant us a license to host and process Your Content
          solely to provide the Service. We do not sell Your Content.
        </p>

        <h2 className="mt-6 text-lg font-semibold text-gray-900">
          5. Communications &amp; consent
        </h2>
        <p>
          You represent that you have a lawful basis (consent or legitimate-interest equivalent)
          before sending any commercial email or SMS through the Service. You will honor opt-out
          requests within the timeframes required by CAN-SPAM and TCPA. The Service provides
          unsubscribe mechanisms; you agree to keep them functional.
        </p>

        <h2 className="mt-6 text-lg font-semibold text-gray-900">6. Fees</h2>
        <p>[Pricing terms — fill in once a commercial model is set.]</p>

        <h2 className="mt-6 text-lg font-semibold text-gray-900">7. Service availability</h2>
        <p>
          We strive for high availability but do not guarantee uninterrupted access. We may modify
          or discontinue features with reasonable notice.
        </p>

        <h2 className="mt-6 text-lg font-semibold text-gray-900">8. Termination</h2>
        <p>
          You may stop using the Service at any time. We may suspend or terminate accounts for
          violation of these Terms. On termination you may export Your Content for 30 days; after
          that we may delete it.
        </p>

        <h2 className="mt-6 text-lg font-semibold text-gray-900">9. Disclaimers</h2>
        <p className="uppercase">
          The Service is provided &ldquo;as is&rdquo; without warranties of any kind, express or
          implied, including merchantability, fitness for a particular purpose, and
          non-infringement.
        </p>

        <h2 className="mt-6 text-lg font-semibold text-gray-900">10. Limitation of liability</h2>
        <p className="uppercase">
          To the fullest extent permitted by law, our aggregate liability arising out of or relating
          to the Service shall not exceed the fees paid by you in the 12 months preceding the claim,
          or USD $100, whichever is greater. We are not liable for indirect, incidental, special,
          consequential, or punitive damages.
        </p>

        <h2 className="mt-6 text-lg font-semibold text-gray-900">11. Governing law</h2>
        <p>
          These Terms are governed by the laws of the State of Colorado, without regard to conflicts
          of law. Disputes shall be resolved in the state or federal courts located in Jefferson
          County, Colorado.
        </p>

        <h2 className="mt-6 text-lg font-semibold text-gray-900">12. Changes</h2>
        <p>
          We may update these Terms; material changes will be communicated by email or in-product
          notice. Continued use after changes take effect constitutes acceptance.
        </p>

        <h2 className="mt-6 text-lg font-semibold text-gray-900">13. Contact</h2>
        <p>
          {t.legalName} · {t.physicalAddress} · {t.replyToAddress}
        </p>
      </section>
    </article>
  );
}

function PreLaunchBanner() {
  return (
    <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900">
      <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
      <div className="text-xs">
        <div className="font-semibold">Placeholder content — REPLACE BEFORE LAUNCH.</div>
        <div className="mt-0.5 text-amber-800">
          This stub gives you the standard ToS skeleton + the {`{`}brand{`}`} placeholders pulled
          from <code>tenant.ts</code>. A lawyer or a generator (termly.io, iubenda) should replace
          the body before any real partner data lands in the system.
        </div>
      </div>
    </div>
  );
}
