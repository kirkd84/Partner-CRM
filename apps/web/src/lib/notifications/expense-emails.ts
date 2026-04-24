/**
 * Expense notification emails.
 *
 * Three triggers:
 *   • Submitted — pending → email the pool of approvers so the expense
 *     isn't sitting in a queue nobody's watching.
 *   • Approved — email the submitter so they know it cleared.
 *   • Rejected — email the submitter with the rejection reason so they
 *     can re-submit with context.
 *
 * Every function here is fire-and-forget. A failure to send an email
 * must NEVER block the underlying approval action — worst case, the
 * rep sees the status change in the UI without the ping in their inbox.
 *
 * We keep this module server-only (plain ts, no 'use server' marker
 * because it's not a server action entry point — it's a helper called
 * from server actions).
 */

import { prisma } from '@partnerradar/db';
import { sendEmail, renderEmailLayout } from '@partnerradar/integrations';
import { tenant } from '@partnerradar/config';

/** Base URL for links in emails. Prefer the public Railway URL; fall back in dev. */
function appBaseUrl(): string {
  return (
    process.env.APP_BASE_URL ||
    process.env.NEXTAUTH_URL ||
    'https://partner-crm-production.up.railway.app'
  );
}

/**
 * Standard compliance footer for internal transactional emails.
 * Not strictly required for transactional messages under CAN-SPAM, but
 * every production mail stack ships a footer — it signals to spam
 * filters that the sender is legitimate and keeps auditors happy.
 */
function transactionalFooter(): string {
  const t = tenant();
  return `${escapeHtml(t.legalName)} · ${escapeHtml(t.physicalAddress)}<br>Sent automatically by Partner Portal — replies are monitored.`;
}

function formatMoney(n: number): string {
  return `$${n.toFixed(2)}`;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Submitted — notify the approver pool (managers + admins in the
 * submitter's markets). Quiet no-op if there are no approvers or Resend
 * isn't configured.
 */
export async function notifyExpensePending(expenseId: string): Promise<void> {
  try {
    const expense = await prisma.expense.findUnique({
      where: { id: expenseId },
      select: {
        id: true,
        amount: true,
        description: true,
        category: true,
        occurredOn: true,
        partnerId: true,
        user: {
          select: { id: true, name: true, email: true, markets: { select: { marketId: true } } },
        },
        partner: { select: { companyName: true, marketId: true } },
      },
    });
    if (!expense) return;

    const submitterMarkets = expense.user.markets.map((m) => m.marketId);
    const marketIds = [...new Set([...submitterMarkets, expense.partner.marketId])];

    // Approvers = admins (tenant-wide) + managers whose markets overlap
    // with the submitter's. De-dupe by id.
    const [admins, managers] = await Promise.all([
      prisma.user.findMany({
        where: { role: 'ADMIN', active: true, email: { not: '' } },
        select: { id: true, email: true, name: true },
      }),
      marketIds.length === 0
        ? Promise.resolve([])
        : prisma.user.findMany({
            where: {
              role: 'MANAGER',
              active: true,
              email: { not: '' },
              markets: { some: { marketId: { in: marketIds } } },
            },
            select: { id: true, email: true, name: true },
          }),
    ]);

    const recipientsById = new Map<string, { email: string; name: string }>();
    for (const u of [...admins, ...managers]) {
      if (u.email) recipientsById.set(u.id, { email: u.email, name: u.name });
    }
    const recipients = [...recipientsById.values()];
    if (recipients.length === 0) {
      console.info('[email] no approvers to notify for expense', expenseId);
      return;
    }

    const amount = Number(expense.amount);
    const subject = `Approve ${formatMoney(amount)} · ${expense.partner.companyName}`;
    const body = `
      <p><strong>${escapeHtml(expense.user.name)}</strong> submitted an expense needing approval.</p>
      <table style="border-collapse:collapse;margin:12px 0 4px;">
        <tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:12px;">Amount</td><td style="padding:4px 0;font-weight:600;">${formatMoney(amount)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:12px;">Category</td><td style="padding:4px 0;">${escapeHtml(expense.category)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:12px;">Partner</td><td style="padding:4px 0;">${escapeHtml(expense.partner.companyName)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:12px;">Occurred</td><td style="padding:4px 0;">${formatDate(expense.occurredOn)}</td></tr>
      </table>
      <p style="margin-top:12px;color:#374151;"><em>${escapeHtml(expense.description)}</em></p>
    `;
    const html = renderEmailLayout({
      title: 'Expense awaiting your approval',
      preheader: `${expense.user.name} · ${formatMoney(amount)} · ${expense.partner.companyName}`,
      bodyHtml: body,
      ctaLabel: 'Review in Partner Portal',
      ctaHref: `${appBaseUrl()}/admin/expenses?status=PENDING`,
      footerHtml: transactionalFooter(),
    });

    await sendEmail({
      to: recipients.map((r) => r.email),
      subject,
      html,
      tag: 'expense-pending-approver',
      replyTo: expense.user.email,
    });
  } catch (err) {
    console.warn('[email] notifyExpensePending failed', err);
  }
}

/** Approved — tell the submitter. */
export async function notifyExpenseApproved(
  expenseId: string,
  approverName: string,
): Promise<void> {
  try {
    const expense = await prisma.expense.findUnique({
      where: { id: expenseId },
      select: {
        id: true,
        amount: true,
        description: true,
        category: true,
        user: { select: { email: true, name: true } },
        partner: { select: { id: true, companyName: true } },
      },
    });
    if (!expense?.user.email) return;
    const amount = Number(expense.amount);
    const html = renderEmailLayout({
      title: `Approved · ${formatMoney(amount)}`,
      preheader: `Your ${expense.category.toLowerCase()} expense for ${expense.partner.companyName} was approved.`,
      bodyHtml: `
        <p>Good news — your expense cleared.</p>
        <table style="border-collapse:collapse;margin:12px 0;">
          <tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:12px;">Amount</td><td style="padding:4px 0;font-weight:600;">${formatMoney(amount)}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:12px;">Partner</td><td style="padding:4px 0;">${escapeHtml(expense.partner.companyName)}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:12px;">Approved by</td><td style="padding:4px 0;">${escapeHtml(approverName)}</td></tr>
        </table>
      `,
      ctaLabel: 'Open in Partner Portal',
      ctaHref: `${appBaseUrl()}/partners/${expense.partner.id}`,
      footerHtml: transactionalFooter(),
    });
    await sendEmail({
      to: expense.user.email,
      subject: `Approved · ${formatMoney(amount)} · ${expense.partner.companyName}`,
      html,
      tag: 'expense-approved-submitter',
    });
  } catch (err) {
    console.warn('[email] notifyExpenseApproved failed', err);
  }
}

/** Rejected — tell the submitter, include the reason. */
export async function notifyExpenseRejected(
  expenseId: string,
  approverName: string,
  reason: string,
): Promise<void> {
  try {
    const expense = await prisma.expense.findUnique({
      where: { id: expenseId },
      select: {
        id: true,
        amount: true,
        description: true,
        user: { select: { email: true, name: true } },
        partner: { select: { id: true, companyName: true } },
      },
    });
    if (!expense?.user.email) return;
    const amount = Number(expense.amount);
    const html = renderEmailLayout({
      title: `Not approved · ${formatMoney(amount)}`,
      preheader: `Your expense for ${expense.partner.companyName} was not approved.`,
      bodyHtml: `
        <p>Your expense for <strong>${escapeHtml(expense.partner.companyName)}</strong> wasn't approved.</p>
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:12px;margin:12px 0;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#991b1b;font-weight:600;">Reason from ${escapeHtml(approverName)}</div>
          <div style="color:#7f1d1d;margin-top:4px;">${escapeHtml(reason)}</div>
        </div>
        <p style="color:#6b7280;">You can resubmit with updated context or reply to this email to discuss.</p>
      `,
      ctaLabel: 'Open in Partner Portal',
      ctaHref: `${appBaseUrl()}/partners/${expense.partner.id}`,
      footerHtml: transactionalFooter(),
    });
    await sendEmail({
      to: expense.user.email,
      subject: `Not approved · ${formatMoney(amount)} · ${expense.partner.companyName}`,
      html,
      tag: 'expense-rejected-submitter',
    });
  } catch (err) {
    console.warn('[email] notifyExpenseRejected failed', err);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
