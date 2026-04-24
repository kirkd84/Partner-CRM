/**
 * Template variable substitution.
 *
 * Templates use {{snake_case}} placeholders. This module is the single
 * source of truth for:
 *   • which variables exist
 *   • how they resolve from a Partner / Contact / Rep context
 *   • safe fallbacks when a variable can't be resolved
 *
 * Keep the list SHORT and concrete — every variable we expose has to be
 * reliably fillable or the resulting messages read badly.
 */

export interface TemplateContext {
  partner?: { companyName?: string | null; city?: string | null; state?: string | null };
  contact?: { firstName?: string | null; lastName?: string | null };
  rep?: { name?: string | null; firstName?: string | null; email?: string | null };
  tenant?: { companyName?: string; phone?: string; supportEmail?: string };
}

export type TemplateVariable = {
  token: string; // e.g. "partner_name"
  label: string; // e.g. "Partner company name"
  sample: string; // example value shown in the editor preview
  resolve: (ctx: TemplateContext) => string | undefined;
};

export const TEMPLATE_VARIABLES: readonly TemplateVariable[] = [
  {
    token: 'partner_name',
    label: 'Partner company name',
    sample: 'Acme Insurance',
    resolve: (c) => c.partner?.companyName ?? undefined,
  },
  {
    token: 'partner_city',
    label: 'Partner city',
    sample: 'Tulsa',
    resolve: (c) => c.partner?.city ?? undefined,
  },
  {
    token: 'partner_state',
    label: 'Partner state',
    sample: 'OK',
    resolve: (c) => c.partner?.state ?? undefined,
  },
  {
    token: 'contact_first_name',
    label: 'Contact first name',
    sample: 'Sarah',
    resolve: (c) => c.contact?.firstName ?? undefined,
  },
  {
    token: 'contact_last_name',
    label: 'Contact last name',
    sample: 'Thompson',
    resolve: (c) => c.contact?.lastName ?? undefined,
  },
  {
    token: 'contact_name',
    label: 'Contact full name',
    sample: 'Sarah Thompson',
    resolve: (c) => {
      const f = c.contact?.firstName?.trim();
      const l = c.contact?.lastName?.trim();
      if (!f && !l) return undefined;
      return [f, l].filter(Boolean).join(' ');
    },
  },
  {
    token: 'rep_name',
    label: 'Rep full name',
    sample: 'Kirk McCoy',
    resolve: (c) => c.rep?.name ?? undefined,
  },
  {
    token: 'rep_first_name',
    label: 'Rep first name',
    sample: 'Kirk',
    resolve: (c) => c.rep?.firstName ?? c.rep?.name?.split(/\s+/)[0],
  },
  {
    token: 'rep_email',
    label: 'Rep email',
    sample: 'kirk@rooftech.com',
    resolve: (c) => c.rep?.email ?? undefined,
  },
  {
    token: 'company_name',
    label: 'Your company',
    sample: 'Roof Technologies',
    resolve: (c) => c.tenant?.companyName,
  },
  {
    token: 'company_phone',
    label: 'Your company phone',
    sample: '(918) 555-1234',
    resolve: (c) => c.tenant?.phone,
  },
  {
    token: 'support_email',
    label: 'Support email',
    sample: 'support@rooftech.com',
    resolve: (c) => c.tenant?.supportEmail,
  },
] as const;

const KNOWN_TOKENS = new Set(TEMPLATE_VARIABLES.map((v) => v.token));

export interface SubstituteResult {
  /** Template with all resolvable tokens replaced. */
  output: string;
  /** Tokens that matched a known variable but had no value in context. */
  missing: string[];
  /** Tokens we don't recognise (likely typos or deprecated variables). */
  unknown: string[];
}

/**
 * Swap {{token}} placeholders for real values. Tolerant of whitespace:
 * `{{ partner_name }}` works the same as `{{partner_name}}`.
 *
 * Missing variables are replaced with an empty string (plus tracked in
 * `missing`). Unknown variables are left verbatim so they show up in
 * the preview and flag the typo to the author.
 */
export function substitute(template: string, ctx: TemplateContext): SubstituteResult {
  const missing = new Set<string>();
  const unknown = new Set<string>();
  const output = template.replace(/{{\s*([a-z0-9_]+)\s*}}/gi, (match, rawToken: string) => {
    const token = rawToken.toLowerCase();
    if (!KNOWN_TOKENS.has(token)) {
      unknown.add(token);
      return match;
    }
    const variable = TEMPLATE_VARIABLES.find((v) => v.token === token);
    const value = variable?.resolve(ctx);
    if (value === undefined || value === null || value === '') {
      missing.add(token);
      return '';
    }
    return value;
  });
  return {
    output,
    missing: [...missing],
    unknown: [...unknown],
  };
}

/** Build a sample context for the live preview in the template editor. */
export function sampleContext(): TemplateContext {
  const ctx: TemplateContext = {
    partner: { companyName: 'Acme Insurance', city: 'Tulsa', state: 'OK' },
    contact: { firstName: 'Sarah', lastName: 'Thompson' },
    rep: { name: 'Kirk McCoy', firstName: 'Kirk', email: 'kirk@rooftech.com' },
    tenant: {
      companyName: 'Roof Technologies',
      phone: '(918) 555-1234',
      supportEmail: 'support@rooftech.com',
    },
  };
  return ctx;
}
