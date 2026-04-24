/**
 * MW-6: mail-merge token resolution.
 *
 * Replaces tokens like {{firstName}}, {{partner.companyName}}, or
 * {{event.date}} in template slot values at render time. We expose a
 * tiny pure helper so it can be called from:
 *   - the renderer just before passing slots into the template
 *   - the MW-5 export pipeline when bulk-personalizing
 *   - any future EV-10 event-to-design flow
 *
 * Unknown tokens are left in place rather than blanked out — better to
 * see `{{firstName}}` and notice the missing context than to have a
 * silent empty string in a printed flyer.
 */

export interface MergeContext {
  recipient?: {
    firstName?: string;
    lastName?: string;
    fullName?: string;
    title?: string;
    email?: string;
    phone?: string;
  } | null;
  partner?: {
    companyName?: string;
    primaryContactName?: string;
    industry?: string;
  } | null;
  event?: {
    name?: string;
    date?: string;
    venue?: string;
    time?: string;
  } | null;
  brand?: {
    companyName?: string;
    tagline?: string;
  } | null;
}

const TOKEN_RX = /\{\{\s*([a-zA-Z][a-zA-Z0-9_.]*)\s*\}\}/g;

export function mergeTokens(text: string, ctx: MergeContext): string {
  if (!text || !text.includes('{{')) return text;
  return text.replace(TOKEN_RX, (whole, path: string) => {
    const value = lookup(ctx, path);
    return value == null || value === '' ? whole : String(value);
  });
}

export function mergeSlotsText(
  slots: Record<string, string>,
  ctx: MergeContext,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(slots)) {
    out[k] = typeof v === 'string' ? mergeTokens(v, ctx) : v;
  }
  return out;
}

/**
 * Tokens with no namespace fall back to recipient (`{{firstName}}` →
 * `recipient.firstName`) since that's the most common case; otherwise
 * we walk the dotted path.
 */
function lookup(ctx: MergeContext, path: string): unknown {
  const parts = path.split('.');
  if (parts.length === 1) {
    const k = parts[0]!;
    const r = ctx.recipient as Record<string, unknown> | undefined;
    if (r && k in r) return r[k];
    const b = ctx.brand as Record<string, unknown> | undefined;
    if (b && k in b) return b[k];
    return undefined;
  }
  const head = parts[0]!;
  const rest = parts.slice(1);
  const root: unknown =
    head === 'partner'
      ? ctx.partner
      : head === 'event'
        ? ctx.event
        : head === 'brand'
          ? ctx.brand
          : head === 'recipient'
            ? ctx.recipient
            : undefined;
  let cur: unknown = root;
  for (const seg of rest) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

/** Surface the list of available tokens for the editor's autocomplete. */
export const AVAILABLE_TOKENS: Array<{ token: string; description: string }> = [
  { token: '{{firstName}}', description: "Recipient's first name" },
  { token: '{{lastName}}', description: "Recipient's last name" },
  { token: '{{fullName}}', description: "Recipient's full name" },
  { token: '{{title}}', description: "Recipient's title" },
  { token: '{{partner.companyName}}', description: 'Partner company name' },
  { token: '{{partner.industry}}', description: 'Partner industry' },
  { token: '{{event.name}}', description: 'Event name' },
  { token: '{{event.date}}', description: 'Event date' },
  { token: '{{event.venue}}', description: 'Event venue' },
  { token: '{{event.time}}', description: 'Event time' },
  { token: '{{brand.companyName}}', description: 'Your company name' },
  { token: '{{brand.tagline}}', description: 'Your tagline' },
];
