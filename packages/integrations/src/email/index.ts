/**
 * Resend email client — thin fetch wrapper around the REST API so we
 * don't need to add the `resend` npm dep and another supply-chain
 * surface. Resend's docs live at https://resend.com/docs.
 *
 * Graceful degradation:
 *   • If RESEND_API_KEY is missing, `sendEmail` logs a dry-run and
 *     returns { ok: false, skipped: 'no-api-key' }. Callers should
 *     check the returned flag but never throw — a dropped email
 *     notification must never block an approval action.
 *
 *   • If the HTTP request fails (timeout, 4xx, 5xx), `sendEmail`
 *     returns { ok: false, error } and logs the error without
 *     throwing. Inngest/retry stacks above can decide whether to
 *     surface that to an admin.
 */

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
  /** Plain-text alternative. Auto-derived from HTML if omitted. */
  text?: string;
  /** Optional Reply-To header. Defaults to FROM. */
  replyTo?: string;
  /** Friendly name for the sender. Falls back to RESEND_FROM_NAME env. */
  fromName?: string;
  /** Sender address. Falls back to RESEND_FROM_EMAIL env. */
  fromEmail?: string;
  /** Tag for Resend analytics — e.g. "expense-pending-approver". */
  tag?: string;
}

export interface SendEmailResult {
  ok: boolean;
  id?: string;
  error?: string;
  skipped?: 'no-api-key' | 'no-from-email' | 'invalid-to';
}

export function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && (process.env.RESEND_FROM_EMAIL || ''));
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.info(
      `[email] RESEND_API_KEY missing — dry-run to=${JSON.stringify(input.to)} subject="${input.subject}"`,
    );
    return { ok: false, skipped: 'no-api-key' };
  }

  const fromEmail = input.fromEmail ?? process.env.RESEND_FROM_EMAIL;
  const fromName = input.fromName ?? process.env.RESEND_FROM_NAME ?? 'Partner Portal';
  if (!fromEmail) {
    console.warn('[email] RESEND_FROM_EMAIL missing — skipping send');
    return { ok: false, skipped: 'no-from-email' };
  }

  const to = Array.isArray(input.to) ? input.to : [input.to];
  const validTo = to.filter((addr) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr));
  if (validTo.length === 0) {
    console.warn('[email] no valid recipients in', to);
    return { ok: false, skipped: 'invalid-to' };
  }

  const body: Record<string, unknown> = {
    from: `${fromName} <${fromEmail}>`,
    to: validTo,
    subject: input.subject,
    html: input.html,
  };
  if (input.text) body.text = input.text;
  if (input.replyTo) body.reply_to = input.replyTo;
  if (input.tag) body.tags = [{ name: 'category', value: input.tag }];

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn('[email] resend error', res.status, text.slice(0, 300));
      return { ok: false, error: `resend ${res.status}: ${text.slice(0, 200)}` };
    }
    const data = (await res.json()) as { id?: string };
    return { ok: true, id: data.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[email] send failed', msg);
    return { ok: false, error: msg };
  }
}

/** Tiny HTML helper — matches the tone in the rest of the app. */
export function renderEmailLayout(args: {
  title: string;
  preheader?: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaHref?: string;
  footerHtml?: string;
}): string {
  const ctaBlock =
    args.ctaLabel && args.ctaHref
      ? `<p style="margin:24px 0 0;"><a href="${args.ctaHref}" style="background:#2563eb;color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;display:inline-block;">${escapeHtml(args.ctaLabel)}</a></p>`
      : '';
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${escapeHtml(args.title)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827;">
    ${args.preheader ? `<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(args.preheader)}</span>` : ''}
    <div style="max-width:560px;margin:32px auto;padding:24px;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;">
      <h1 style="margin:0 0 12px;font-size:18px;font-weight:600;color:#111827;">${escapeHtml(args.title)}</h1>
      <div style="font-size:14px;line-height:1.55;color:#374151;">${args.bodyHtml}</div>
      ${ctaBlock}
    </div>
    <div style="max-width:560px;margin:0 auto 32px;padding:0 24px;font-size:11px;color:#9ca3af;line-height:1.55;">
      ${args.footerHtml ?? 'Partner Portal · Sent automatically — replies are monitored.'}
    </div>
  </body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
