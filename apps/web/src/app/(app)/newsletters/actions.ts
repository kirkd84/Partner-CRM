'use server';

/**
 * Newsletter blast — compose + send to all eligible partners.
 *
 * Compliance baked in:
 *   - Per-recipient skip if Partner.emailUnsubscribedAt is set OR no
 *     primary contact email exists OR partner.archivedAt is set.
 *   - CAN-SPAM footer with the tenant's physical address + a one-click
 *     unsubscribe link auto-appended to every send.
 *   - Activity row logged on every successful send so the partner
 *     timeline shows the touch.
 *
 * Out of scope for v1 (call out in UI):
 *   - Rich text/HTML editor (plain text now; we wrap in <pre>-style
 *     paragraphs in HTML).
 *   - Scheduled send for future date.
 *   - Open/click tracking via Resend webhooks.
 */

import { revalidatePath } from 'next/cache';
import { prisma } from '@partnerradar/db';
import { sendEmail } from '@partnerradar/integrations';
import { auth } from '@/auth';
import { activeTenantId } from '@/lib/tenant/context';
import { unsubscribeUrl } from '@/lib/messaging/unsubscribe-token';

export interface AudienceFilter {
  partnerTypes?: string[];
  stages?: string[];
  groupIds?: string[];
  /** false (default) = exclude customer-only partners */
  includeCustomers?: boolean;
  /** false (default) = exclude INACTIVE-stage partners */
  includeInactive?: boolean;
}

async function assertManagerPlus() {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');
  const ok =
    session.user.role === 'MANAGER' ||
    session.user.role === 'ADMIN' ||
    session.user.role === 'SUPER_ADMIN';
  if (!ok) throw new Error('FORBIDDEN: manager+');
  return session;
}

/**
 * Build the Prisma `where` for the audience filter. Used by both the
 * preview-count query and the actual send loop so they always agree.
 */
function buildAudienceWhere(filter: AudienceFilter, marketIds: string[] | null) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {
    archivedAt: null,
    emailUnsubscribedAt: null,
  };
  if (marketIds && marketIds.length > 0) {
    where.marketId = { in: marketIds };
  }
  if (filter.partnerTypes && filter.partnerTypes.length > 0) {
    where.partnerType = { in: filter.partnerTypes };
  }
  if (filter.stages && filter.stages.length > 0) {
    where.stage = { in: filter.stages };
  } else if (!filter.includeInactive) {
    // Default: skip INACTIVE if the rep didn't pick stages explicitly.
    where.stage = { not: 'INACTIVE' };
  }
  if (!filter.includeCustomers) {
    where.customerOnly = false;
  }
  if (filter.groupIds && filter.groupIds.length > 0) {
    where.networkingGroupMemberships = {
      some: {
        groupId: { in: filter.groupIds },
        leftAt: null,
      },
    };
  }
  return where;
}

export async function previewAudience(input: {
  filter: AudienceFilter;
  marketId?: string | null;
}): Promise<{ count: number; sample: Array<{ id: string; companyName: string; email: string }> }> {
  const session = await assertManagerPlus();
  const tenantId = await activeTenantId(session);
  // Manager scope: their markets only. Admin: tenant-scoped (or all
  // when not super-admin acting-as).
  let marketIds: string[] | null;
  if (input.marketId) {
    marketIds = [input.marketId];
  } else if (session.user.role === 'ADMIN' || session.user.role === 'SUPER_ADMIN') {
    if (tenantId) {
      const ms = await prisma.market.findMany({
        where: { tenantId },
        select: { id: true },
      });
      marketIds = ms.map((m) => m.id);
    } else {
      marketIds = null; // super-admin no-act-as: every market
    }
  } else {
    marketIds = session.user.markets ?? [];
  }

  const where = buildAudienceWhere(input.filter, marketIds);

  const partners = await prisma.partner.findMany({
    where,
    select: {
      id: true,
      companyName: true,
      contacts: {
        where: { isPrimary: true },
        select: { emails: true },
        take: 1,
      },
    },
    take: 5000,
  });

  // Pull the primary email out of the JSON shape, filter to those who
  // actually have one.
  const withEmail = partners
    .map((p) => {
      const e = (
        p.contacts[0]?.emails as Array<{ address?: string; primary?: boolean }> | undefined
      )?.find((x) => x?.address)?.address;
      return e ? { id: p.id, companyName: p.companyName, email: e } : null;
    })
    .filter(Boolean) as Array<{ id: string; companyName: string; email: string }>;

  return {
    count: withEmail.length,
    sample: withEmail.slice(0, 5),
  };
}

export interface CreateNewsletterInput {
  subject: string;
  bodyText: string;
  filter: AudienceFilter;
  marketId?: string | null;
}

export async function createNewsletterDraft(input: CreateNewsletterInput): Promise<{ id: string }> {
  const session = await assertManagerPlus();
  if (!input.subject.trim()) throw new Error('Subject is required');
  if (!input.bodyText.trim()) throw new Error('Body is required');
  const tenantId = await activeTenantId(session);

  const newsletter = await prisma.newsletter.create({
    data: {
      tenantId: tenantId ?? null,
      marketId: input.marketId ?? null,
      subject: input.subject.trim(),
      bodyText: input.bodyText,
      audienceFilter: input.filter as unknown as object,
      createdBy: session.user.id,
    },
    select: { id: true },
  });

  revalidatePath('/newsletters');
  return { id: newsletter.id };
}

export async function updateNewsletterDraft(
  id: string,
  input: Partial<CreateNewsletterInput>,
): Promise<{ ok: true }> {
  const session = await assertManagerPlus();
  const existing = await prisma.newsletter.findUnique({
    where: { id },
    select: { status: true, createdBy: true },
  });
  if (!existing) throw new Error('NOT_FOUND');
  if (existing.status !== 'DRAFT') throw new Error('Only drafts can be edited');
  if (existing.createdBy !== session.user.id && session.user.role === 'MANAGER') {
    throw new Error('FORBIDDEN: not your draft');
  }

  await prisma.newsletter.update({
    where: { id },
    data: {
      ...(input.subject !== undefined && { subject: input.subject.trim() }),
      ...(input.bodyText !== undefined && { bodyText: input.bodyText }),
      ...(input.filter !== undefined && {
        audienceFilter: input.filter as unknown as object,
      }),
      ...(input.marketId !== undefined && { marketId: input.marketId ?? null }),
    },
  });

  revalidatePath('/newsletters');
  revalidatePath(`/newsletters/${id}`);
  return { ok: true };
}

export async function deleteNewsletterDraft(id: string): Promise<{ ok: true }> {
  const session = await assertManagerPlus();
  const existing = await prisma.newsletter.findUnique({
    where: { id },
    select: { status: true, createdBy: true },
  });
  if (!existing) throw new Error('NOT_FOUND');
  if (existing.status !== 'DRAFT') throw new Error('Only drafts can be deleted');
  if (existing.createdBy !== session.user.id && session.user.role === 'MANAGER') {
    throw new Error('FORBIDDEN: not your draft');
  }
  await prisma.newsletter.delete({ where: { id } });
  revalidatePath('/newsletters');
  return { ok: true };
}

/**
 * Send a test email to the rep's own address. Doesn't update the
 * newsletter row — purely a dry-run check.
 */
export async function sendNewsletterTest(
  input: CreateNewsletterInput,
): Promise<{ ok: boolean; detail?: string }> {
  const session = await assertManagerPlus();
  if (!session.user.email) throw new Error('No email on your user account');
  const tenantId = await activeTenantId(session);
  const tenant = tenantId
    ? await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true, address: true, fromAddress: true },
      })
    : null;

  const html = renderNewsletterHtml({
    bodyText: input.bodyText,
    tenantName: tenant?.name ?? 'Partner Portal',
    tenantAddress: tenant?.address ?? null,
    unsubscribe: '[unsubscribe link will appear here in real sends]',
    isTest: true,
  });

  const res = await sendEmail({
    to: session.user.email,
    subject: `[TEST] ${input.subject}`,
    html,
    text: input.bodyText,
    fromEmail: tenant?.fromAddress || undefined,
    tag: 'newsletter-test',
  });

  return {
    ok: res.ok,
    detail: res.ok ? `Sent to ${session.user.email}` : (res.error ?? res.skipped ?? 'failed'),
  };
}

/**
 * Send the newsletter to every eligible recipient. Sequential through
 * the loop so we never blow Resend's rate limits, and so a per-record
 * failure never tanks the rest of the batch.
 *
 * Updates the Newsletter row with running totals; on completion flips
 * status to SENT (or FAILED if every send blew up).
 */
export async function sendNewsletter(id: string): Promise<{
  recipientCount: number;
  sentCount: number;
  blockedCount: number;
  errorCount: number;
}> {
  const session = await assertManagerPlus();
  const newsletter = await prisma.newsletter.findUnique({
    where: { id },
    select: {
      id: true,
      tenantId: true,
      marketId: true,
      subject: true,
      bodyText: true,
      audienceFilter: true,
      status: true,
      createdBy: true,
    },
  });
  if (!newsletter) throw new Error('NOT_FOUND');
  if (newsletter.status === 'SENT') throw new Error('Already sent');
  if (newsletter.status === 'SENDING') throw new Error('Already in flight');

  const filter = (newsletter.audienceFilter ?? {}) as AudienceFilter;
  let marketIds: string[] | null;
  if (newsletter.marketId) {
    marketIds = [newsletter.marketId];
  } else if (newsletter.tenantId) {
    const ms = await prisma.market.findMany({
      where: { tenantId: newsletter.tenantId },
      select: { id: true },
    });
    marketIds = ms.map((m) => m.id);
  } else {
    marketIds = session.user.markets ?? [];
  }

  const where = buildAudienceWhere(filter, marketIds);

  const tenant = newsletter.tenantId
    ? await prisma.tenant.findUnique({
        where: { id: newsletter.tenantId },
        select: { name: true, address: true, fromAddress: true },
      })
    : null;

  const partners = await prisma.partner.findMany({
    where,
    select: {
      id: true,
      companyName: true,
      contacts: {
        where: { isPrimary: true },
        select: { id: true, emails: true },
        take: 1,
      },
    },
  });

  // Mark SENDING up front + record recipient count so the UI can
  // reflect the in-flight state. If the process dies mid-batch, the
  // row stays SENDING and a manager can investigate.
  await prisma.newsletter.update({
    where: { id },
    data: {
      status: 'SENDING',
      recipientCount: partners.length,
      sentAt: new Date(),
    },
  });

  let sentCount = 0;
  let blockedCount = 0;
  let errorCount = 0;
  const errorSamples: Array<{ partnerId: string; email: string; error: string }> = [];

  for (const p of partners) {
    const contact = p.contacts[0];
    const email = (
      contact?.emails as Array<{ address?: string; primary?: boolean }> | undefined
    )?.find((x) => x?.address)?.address;
    if (!email || !contact?.id) {
      blockedCount++;
      continue;
    }
    let unsubResolved = '';
    try {
      unsubResolved = unsubscribeUrl(contact.id, email);
    } catch {
      unsubResolved = '';
    }
    const html = renderNewsletterHtml({
      bodyText: newsletter.bodyText,
      tenantName: tenant?.name ?? 'Partner Portal',
      tenantAddress: tenant?.address ?? null,
      unsubscribe: unsubResolved,
      isTest: false,
    });
    try {
      const res = await sendEmail({
        to: email,
        subject: newsletter.subject,
        html,
        text: newsletter.bodyText,
        fromEmail: tenant?.fromAddress || undefined,
        tag: `newsletter-${id}`,
        headers: unsubResolved
          ? {
              'List-Unsubscribe': `<${unsubResolved}>`,
              'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            }
          : undefined,
      });
      if (res.ok) {
        sentCount++;
        // Log the touch on the partner timeline. Failure of the
        // logging is non-fatal — the email already went.
        await prisma.activity
          .create({
            data: {
              partnerId: p.id,
              userId: newsletter.createdBy,
              type: 'EMAIL_OUT',
              body: `Newsletter: "${newsletter.subject}"`,
              metadata: { newsletterId: id },
            },
          })
          .catch(() => {});
      } else if (res.skipped) {
        blockedCount++;
      } else {
        errorCount++;
        if (errorSamples.length < 20) {
          errorSamples.push({
            partnerId: p.id,
            email,
            error: res.error ?? 'unknown',
          });
        }
      }
    } catch (err) {
      errorCount++;
      if (errorSamples.length < 20) {
        errorSamples.push({
          partnerId: p.id,
          email,
          error: err instanceof Error ? err.message : 'unknown',
        });
      }
    }
  }

  const finalStatus = sentCount > 0 ? 'SENT' : errorCount > 0 ? 'FAILED' : 'SENT';
  await prisma.newsletter.update({
    where: { id },
    data: {
      status: finalStatus,
      sentCount,
      blockedCount,
      errorCount,
      errorSamples: errorSamples.length > 0 ? (errorSamples as unknown as object) : null,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      entityType: 'Newsletter',
      entityId: id,
      action: 'SEND',
      diff: {
        recipientCount: partners.length,
        sentCount,
        blockedCount,
        errorCount,
      },
    },
  });

  revalidatePath('/newsletters');
  revalidatePath(`/newsletters/${id}`);
  return {
    recipientCount: partners.length,
    sentCount,
    blockedCount,
    errorCount,
  };
}

/**
 * Wrap the plain-text body into a minimal HTML email with paragraphs
 * and a CAN-SPAM-compliant footer (physical address + unsubscribe).
 *
 * We deliberately keep the markup boring — clean white background,
 * system fonts, no remote tracking pixels in v1.
 */
function renderNewsletterHtml(input: {
  bodyText: string;
  tenantName: string;
  tenantAddress: string | null;
  unsubscribe: string;
  isTest: boolean;
}): string {
  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const paragraphs = input.bodyText
    .split(/\n\n+/)
    .map((para) => {
      // Single newlines inside a paragraph become <br> so the rep's
      // line breaks survive. Empty paras get dropped.
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

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escape(input.tenantName)}</title></head>
<body style="margin:0;padding:24px;background:#f5f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827;line-height:1.55;">
<table role="presentation" cellspacing="0" cellpadding="0" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;"><tr><td style="padding:28px 32px;">
${paragraphs}
<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
<div style="font-size:11px;color:#6b7280;line-height:1.6;">${footer}</div>
</td></tr></table>
</body></html>`;
}
