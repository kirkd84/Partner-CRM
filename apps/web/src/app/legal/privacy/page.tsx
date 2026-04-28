/**
 * /legal/privacy — public Privacy Policy stub.
 *
 * THIS IS A PLACEHOLDER. Replace the body before launch with content
 * from a lawyer or a generator. Roof Tech's existing site privacy
 * policy probably needs minor edits to cover the partner data this
 * service holds.
 */

import { tenant } from '@partnerradar/config';
import { AlertTriangle } from 'lucide-react';

export const metadata = { title: 'Privacy Policy' };

export default function PrivacyPage() {
  const t = tenant();
  const lastUpdated = '2026-04-25';
  return (
    <article className="prose prose-sm max-w-none text-gray-800">
      <PreLaunchBanner />
      <h1 className="text-2xl font-semibold text-gray-900">Privacy Policy</h1>
      <p className="text-xs text-gray-500">Last updated: {lastUpdated}</p>

      <section>
        <h2 className="mt-6 text-lg font-semibold text-gray-900">1. Who we are</h2>
        <p>
          {t.legalName} (&ldquo;we&rdquo;) operates {t.brandName} to help our team and authorized
          users manage relationships with referral partners.
        </p>

        <h2 className="mt-6 text-lg font-semibold text-gray-900">2. Information we collect</h2>
        <ul className="list-disc pl-5">
          <li>
            <strong>Account information.</strong> Name, work email, role, market assignment.
          </li>
          <li>
            <strong>Partner information.</strong> Business name, business address, phone, website,
            and primary contact name + work email + work phone — collected from public licensing
            registries, business directories, and information you provide.
          </li>
          <li>
            <strong>Usage data.</strong> Pages visited, actions taken, audit log entries — for
            security, support, and analytics.
          </li>
          <li>
            <strong>Communications.</strong> Notes, calls, emails, and SMS you send to or about
            partners through the Service.
          </li>
        </ul>
        <p>
          We do not knowingly collect personal information from children. We do not collect
          regulated PII (HIPAA, PCI) through this Service.
        </p>

        <h2 className="mt-6 text-lg font-semibold text-gray-900">3. How we use information</h2>
        <ul className="list-disc pl-5">
          <li>Provide and improve the Service.</li>
          <li>Authenticate and authorize users.</li>
          <li>Send commercial communications you initiate to partners.</li>
          <li>Audit, secure, and detect abuse of the Service.</li>
          <li>Comply with legal obligations.</li>
        </ul>

        <h2 className="mt-6 text-lg font-semibold text-gray-900">4. Sharing</h2>
        <p>
          We share information with: (a) service providers we use to operate the Service (hosting,
          email/SMS delivery, error monitoring); (b) Storm Cloud, when an activated partner
          relationship requires it; (c) law enforcement when legally required. We do not sell
          personal information.
        </p>

        <h2 className="mt-6 text-lg font-semibold text-gray-900">
          5. Email &amp; SMS communications
        </h2>
        <p>
          When you (a user) send commercial communications through the Service, you must comply with
          applicable laws (CAN-SPAM, TCPA). We provide unsubscribe links in marketing email and
          STOP-keyword handling for SMS. Recipients can opt out at any time.
        </p>

        <h2 className="mt-6 text-lg font-semibold text-gray-900">6. Cookies &amp; tracking</h2>
        <p>
          We use strictly-necessary cookies for authentication and session management. We do not use
          third-party advertising cookies.
        </p>

        <h2 className="mt-6 text-lg font-semibold text-gray-900">7. Security</h2>
        <p>
          See our <a href="/SECURITY.md">security model</a> for technical detail. Passwords are
          bcrypt-hashed; sessions use HttpOnly cookies; transport is HTTPS-only with HSTS; access to
          partner records is role-gated and audit-logged.
        </p>

        <h2 className="mt-6 text-lg font-semibold text-gray-900">8. Retention</h2>
        <p>
          We keep partner records for as long as the user account that created them remains active,
          plus 30 days after account closure for export. Audit log entries are retained for
          [duration — set policy].
        </p>

        <h2 className="mt-6 text-lg font-semibold text-gray-900">9. Your choices</h2>
        <ul className="list-disc pl-5">
          <li>
            <strong>Access &amp; correction.</strong> Contact us at {t.replyToAddress}.
          </li>
          <li>
            <strong>Email opt-out.</strong> Click the unsubscribe link in any marketing email.
          </li>
          <li>
            <strong>SMS opt-out.</strong> Reply STOP to any message.
          </li>
          <li>
            <strong>Account deletion.</strong> Request via {t.replyToAddress}.
          </li>
        </ul>

        <h2 className="mt-6 text-lg font-semibold text-gray-900">10. State-specific rights</h2>
        <p>
          California, Colorado, Connecticut, Utah, Virginia, and Texas residents have additional
          rights under their state privacy laws (e.g. CCPA/CPRA, ColoradoPA, VCDPA). To exercise
          these rights, contact {t.replyToAddress} with proof of identity.
        </p>

        <h2 className="mt-6 text-lg font-semibold text-gray-900">11. Changes</h2>
        <p>
          We may update this Policy; material changes will be communicated by email or in-product
          notice.
        </p>

        <h2 className="mt-6 text-lg font-semibold text-gray-900">12. Contact</h2>
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
          This stub covers the standard sections a privacy policy needs for a B2B CRM that holds
          partner contact info. A lawyer or a generator (termly.io, iubenda) should replace the body
          before any real partner data lands.
        </div>
      </div>
    </div>
  );
}
