/**
 * Newsletter render + tracking helpers.
 *
 * Pulled out of actions.ts so the cron path, the test-send path, and
 * the eventual drip-newsletter pipeline can all render identically and
 * share the click/open tracking instrumentation.
 *
 * Tracking model:
 *   - Every recipient gets a NewsletterRecipient row before send.
 *   - All http(s) links in the body get rewritten to
 *     /api/click/[recipientId]?u=<encoded original url>. The handler
 *     stamps firstClickedAt and 302s to the original.
 *   - A 1×1 transparent gif at /api/pixel/[recipientId].gif is appended
 *     just before the unsubscribe footer. Loading it stamps openedAt.
 *   - Resend's webhook (/api/webhooks/resend) backfills delivered /
 *     bounced events keyed on the resend message id.
 *
 * Why both pixel + webhook? The webhook is more reliable but isn't
 * configured by default; the pixel works as a baseline. Click tracking
 * via link rewrite is independent of both — it works as long as the
 * recipient clicks an actual link. We dedupe on firstClickedAt so a
 * 5-click recipient still counts as 1 in the clickCount aggregate.
 */

const APP_URL_FALLBACK = 'https://partner-crm-production.up.railway.app';

export function appBaseUrl(): string {
  // NEXT_PUBLIC_APP_URL is the canonical setting; INNGEST_SERVE_ORIGIN
  // is what we wired earlier for Google OAuth redirects. Either works.
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.INNGEST_SERVE_ORIGIN ??
    APP_URL_FALLBACK
  ).replace(/\/+$/, '');
}

/**
 * Tiny markdown → safe HTML renderer.
 *
 * Handles only the constructs the compose toolbar exposes (**bold**,
 * *italic*, [link](url), # ## ### headings, dash/asterisk lists,
 * paragraph breaks). Everything else is escaped — reps cannot smuggle
 * <script> tags into the email payload.
 *
 * When a recipientId is supplied, all http(s) links are rewritten to
 * the click-tracker so the handler can stamp firstClickedAt.
 */
export function markdownToHtml(src: string, recipientId: string | null = null): string {
  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const wrapLink = (rawUrl: string): string => {
    if (!recipientId) return rawUrl;
    return `${appBaseUrl()}/api/click/${recipientId}?u=${encodeURIComponent(rawUrl)}`;
  };
  const inline = (s: string) =>
    escape(s)
      // [text](url) — only allow http(s) URLs to keep mailto smuggling
      // and javascript: out.
      .replace(
        /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
        (_m, text: string, url: string) =>
          `<a href="${wrapLink(url)}" style="color:#3b82f6;text-decoration:underline;">${text}</a>`,
      )
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|\s)\*([^*]+)\*(?=\s|$)/g, '$1<em>$2</em>');

  const blocks = src.split(/\n{2,}/);
  const out: string[] = [];
  for (const raw of blocks) {
    const block = raw.trim();
    if (!block) continue;
    if (block.startsWith('### ')) {
      out.push(
        `<h3 style="font-size:15px;font-weight:600;margin:16px 0 8px;">${inline(block.slice(4))}</h3>`,
      );
    } else if (block.startsWith('## ')) {
      out.push(
        `<h2 style="font-size:17px;font-weight:600;margin:18px 0 8px;">${inline(block.slice(3))}</h2>`,
      );
    } else if (block.startsWith('# ')) {
      out.push(
        `<h1 style="font-size:20px;font-weight:700;margin:20px 0 8px;">${inline(block.slice(2))}</h1>`,
      );
    } else if (/^[-*]\s/.test(block)) {
      const items = block
        .split('\n')
        .map((line) => line.replace(/^[-*]\s+/, '').trim())
        .filter(Boolean)
        .map((line) => `<li style="margin:0 0 4px;">${inline(line)}</li>`)
        .join('');
      out.push(`<ul style="margin:0 0 16px;padding-left:20px;">${items}</ul>`);
    } else {
      out.push(`<p style="margin:0 0 16px;">${inline(block).replace(/\n/g, '<br>')}</p>`);
    }
  }
  return out.join('');
}

/**
 * Wrap the body into a minimal HTML email with paragraphs, tracking
 * pixel, and a CAN-SPAM-compliant footer (physical address +
 * unsubscribe link).
 *
 * recipientId enables open + click tracking. Pass null for test sends
 * (no NewsletterRecipient row exists for those) to skip both.
 */
export function renderNewsletterHtml(input: {
  bodyText: string;
  tenantName: string;
  tenantAddress: string | null;
  unsubscribe: string;
  isTest: boolean;
  renderAsMarkdown?: boolean;
  recipientId?: string | null;
}): string {
  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const recipientId = input.recipientId ?? null;
  const paragraphs = input.renderAsMarkdown
    ? markdownToHtml(input.bodyText, recipientId)
    : input.bodyText
        .split(/\n\n+/)
        .map((para) => {
          const html = escape(para.trim()).replace(/\n/g, '<br>');
          return html ? `<p style="margin: 0 0 16px;">${html}</p>` : '';
        })
        .filter(Boolean)
        .join('');
  const footerLines: string[] = [];
  footerLines.push(`<strong>${escape(input.tenantName)}</strong>`);
  if (input.tenantAddress) footerLines.push(escape(input.tenantAddress));
  if (input.unsubscribe && !input.isTest) {
    footerLines.push(
      `<a href="${escape(input.unsubscribe)}" style="color:#3b82f6;">Unsubscribe</a> from these newsletters.`,
    );
  } else if (input.isTest) {
    footerLines.push('<em>This is a test send — unsubscribe link skipped.</em>');
  }
  const footer = footerLines.join('<br>');
  // 1×1 transparent gif at /api/pixel/[id].gif. Tucked at the very end
  // of the body so it loads after the user has actually rendered the
  // mail (most clients fetch images top-to-bottom). The pixel route
  // returns even when no recipient exists, so a stray render with a
  // null id wouldn't 404 — but we just skip including it entirely.
  const pixel =
    !input.isTest && recipientId
      ? `<img src="${appBaseUrl()}/api/pixel/${recipientId}.gif" width="1" height="1" alt="" style="border:0;display:block;height:1px;width:1px;">`
      : '';

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escape(input.tenantName)}</title></head>
<body style="margin:0;padding:24px;background:#f5f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827;line-height:1.55;">
<table role="presentation" cellspacing="0" cellpadding="0" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;"><tr><td style="padding:28px 32px;">
${paragraphs}
<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
<div style="font-size:11px;color:#6b7280;line-height:1.6;">${footer}</div>
${pixel}
</td></tr></table>
</body></html>`;
}
