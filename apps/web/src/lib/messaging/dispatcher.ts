/**
 * Central send dispatcher for automated messages.
 *
 * Every autopilot surface — cadence steps, AI auto-drafts, bulk
 * follow-ups — should call `dispatchAutomatedSend` rather than
 * calling Resend/Twilio directly. The dispatcher handles:
 *   1. Consent + quiet-hours check (lib/messaging/consent.ts)
 *   2. Template lookup + {{token}} substitution
 *   3. The actual send (Resend for email, Twilio for SMS)
 *   4. Activity logging (EMAIL_OUT / SMS_OUT) + audit diff
 *   5. Returning a structured outcome so schedulers can record it on
 *      CadenceExecution.outcome.
 *
 * Key invariant: a "blocked" outcome is NOT an error. The caller logs
 * it as a normal outcome and moves on. Only thrown errors indicate a
 * bug — they propagate up to Inngest which retries automatically.
 */

import { prisma, Prisma } from '@partnerradar/db';
import { sendEmail } from '@partnerradar/integrations';
import { isAIConfigured, personalizeBody, type ToneProfile } from '@partnerradar/ai';
import { checkSendAllowed, type Channel } from './consent';
import { substitute, type TemplateContext } from '@/app/(app)/admin/templates/substitute';
import { tenant } from '@partnerradar/config';
import { unsubscribeUrl } from './unsubscribe-token';

export type DispatchOutcome =
  | 'sent'
  | 'blocked_consent'
  | 'blocked_quiet_hours'
  | 'blocked_no_address'
  | 'blocked_archived'
  | 'blocked_rate_limit'
  | 'failed';

export interface DispatchArgs {
  partnerId: string;
  repUserId: string; // the rep on whose behalf we're sending
  templateId: string;
  channel: Channel;
  /**
   * If true, we do NOT actually send — just return "blocked_consent"
   * etc. or simulate "sent". Useful when cadences want to pre-flight
   * validation without hitting the wire.
   */
  dryRun?: boolean;
}

export interface DispatchResult {
  outcome: DispatchOutcome;
  detail?: string;
  messageId?: string;
  contactId?: string;
  sentTo?: string;
}

const SMS_MAX_LEN = 1200; // safety cap; carriers fragment over this.

/** Send an email or SMS on a rep's behalf, with every compliance guard. */
export async function dispatchAutomatedSend(args: DispatchArgs): Promise<DispatchResult> {
  // 1. Consent + quiet hours
  const allowed = await checkSendAllowed(args.partnerId, args.channel);
  if (!allowed.allowed) {
    return {
      outcome: mapBlockedReason(allowed.reason),
      detail: allowed.reason,
    };
  }

  // 2. Template + substitution context
  const [template, partner, rep] = await Promise.all([
    prisma.messageTemplate
      .findUnique({
        where: { id: args.templateId },
        select: { id: true, kind: true, name: true, subject: true, body: true, active: true },
      })
      .catch(() => null),
    prisma.partner.findUnique({
      where: { id: args.partnerId },
      select: {
        id: true,
        companyName: true,
        city: true,
        state: true,
        partnerType: true,
      },
    }),
    prisma.user.findUnique({
      where: { id: args.repUserId },
      select: { id: true, name: true, email: true, aiToneProfile: true },
    }),
  ]);

  if (!template) {
    return { outcome: 'failed', detail: 'template_not_found' };
  }
  if (!template.active) {
    return { outcome: 'failed', detail: 'template_archived' };
  }
  if (!partner) {
    return { outcome: 'failed', detail: 'partner_not_found' };
  }
  if (!rep) {
    return { outcome: 'failed', detail: 'rep_not_found' };
  }

  // Template kind MUST match channel — otherwise we'd SMS an email body.
  if (
    (args.channel === 'email' && template.kind !== 'EMAIL') ||
    (args.channel === 'sms' && template.kind !== 'SMS')
  ) {
    return {
      outcome: 'failed',
      detail: `template_kind_mismatch: template is ${template.kind}, channel is ${args.channel}`,
    };
  }

  const t = tenant();
  const [firstName, ...rest] = allowed.contactName.split(/\s+/);
  const ctx: TemplateContext = {
    partner: {
      companyName: partner.companyName,
      city: partner.city,
      state: partner.state,
    },
    contact: {
      firstName: firstName ?? allowed.contactName,
      lastName: rest.join(' ') || undefined,
    },
    rep: {
      name: rep.name,
      firstName: rep.name.split(/\s+/)[0] ?? rep.name,
      email: rep.email,
    },
    tenant: {
      companyName: t.brandName,
      phone: t.mainPhone,
      supportEmail: t.replyToAddress,
    },
  };

  const subjectOut = substitute(template.subject ?? '', ctx);
  const bodyOut = substitute(template.body ?? '', ctx);

  // Any unknown tokens = template bug. Do NOT send a message with
  // literal {{foo}} in it — that's embarrassing.
  const unknown = [...new Set([...subjectOut.unknown, ...bodyOut.unknown])];
  if (unknown.length > 0) {
    return {
      outcome: 'failed',
      detail: `unknown_tokens: ${unknown.join(', ')}`,
    };
  }

  if (args.channel === 'sms' && bodyOut.output.length > SMS_MAX_LEN) {
    return { outcome: 'failed', detail: 'sms_body_too_long' };
  }

  // 2b. AI personalization — when ANTHROPIC_API_KEY is set, run the
  // template body through Haiku so the send reads like the rep typed
  // it for this specific contact. Soft-fails: if the API errors or the
  // env var isn't there, we send the substituted template as-is.
  let finalSubject = subjectOut.output;
  let finalBody = bodyOut.output;
  let aiPersonalized = false;
  let aiModel: string | undefined;
  if (isAIConfigured() && process.env.AI_FOLLOWUP_PERSONALIZE !== 'off') {
    try {
      const recentActivity = await loadRecentActivitySummary(args.partnerId);
      const personalized = await personalizeBody({
        channel: args.channel,
        baseSubject: subjectOut.output || undefined,
        baseBody: bodyOut.output,
        partner: {
          companyName: partner.companyName,
          city: partner.city,
          state: partner.state,
          partnerType: partner.partnerType ?? undefined,
        },
        contact: {
          firstName: ctx.contact.firstName,
          lastName: ctx.contact.lastName,
        },
        rep: { name: rep.name, firstName: ctx.rep.firstName },
        tone:
          rep.aiToneProfile && typeof rep.aiToneProfile === 'object'
            ? (rep.aiToneProfile as ToneProfile)
            : null,
        recentActivity,
      });
      finalSubject = personalized.subject || subjectOut.output;
      finalBody = personalized.body || bodyOut.output;
      aiPersonalized = true;
      aiModel = personalized.model;
      // Re-check SMS length on the AI version — Haiku occasionally
      // overshoots even with the prompt cap. Fall back if so.
      if (args.channel === 'sms' && finalBody.length > SMS_MAX_LEN) {
        console.warn('[ai-followup] AI body exceeded SMS cap; falling back to template');
        finalBody = bodyOut.output;
        aiPersonalized = false;
        aiModel = undefined;
      }
    } catch (err) {
      // Common cases: rate limit, transient 5xx, schema parse fail.
      // Send the template-as-is rather than skip the send entirely.
      console.warn('[ai-followup] personalization failed, sending template as-is', err);
    }
  }

  if (args.dryRun) {
    return {
      outcome: 'sent',
      contactId: allowed.contactId,
      sentTo: allowed.address,
      detail: aiPersonalized ? `dry_run:ai(${aiModel ?? '?'})` : 'dry_run',
    };
  }

  // 3. Actual send
  let messageId: string | undefined;
  if (args.channel === 'email') {
    const unsubUrl = unsubscribeUrl(allowed.contactId, allowed.address);
    const textBody = `${finalBody}\n\n---\n${t.legalName}\n${t.physicalAddress}\n\nTo stop these messages, click: ${unsubUrl}`;
    const res = await sendEmail({
      to: allowed.address,
      subject: finalSubject || `A message from ${t.brandName}`,
      html: toEmailHtml(finalBody, rep.name, {
        legalName: t.legalName,
        physicalAddress: t.physicalAddress,
        unsubscribeUrl: unsubUrl,
      }),
      text: textBody,
      fromName: rep.name,
      replyTo: rep.email ?? undefined,
      tag: `cadence-${template.id}`,
      headers: {
        // RFC 2369 — enable Gmail/Apple Mail native unsubscribe.
        'List-Unsubscribe': `<${unsubUrl}>, <mailto:${t.replyToAddress}?subject=unsubscribe>`,
        // RFC 8058 — POST-based one-click (Gmail needs this too).
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });
    if (!res.ok) {
      return {
        outcome: res.skipped === 'no-api-key' ? 'failed' : 'failed',
        detail: res.error ?? res.skipped ?? 'email_failed',
      };
    }
    messageId = res.id;
  } else {
    // SMS — Twilio wire-up is Phase 8. For now, log the intent so
    // cadences can be tested end-to-end and we return "failed" with a
    // clear reason. Swap to a real twilioClient.send(...) call when
    // TWILIO_AUTH_TOKEN is set.
    if (!process.env.TWILIO_AUTH_TOKEN) {
      console.info(
        '[sms] TWILIO_AUTH_TOKEN missing — dry-run SMS to',
        allowed.address,
        bodyOut.output.slice(0, 80),
      );
      return {
        outcome: 'failed',
        detail: 'twilio_not_configured',
        contactId: allowed.contactId,
      };
    }
    // TODO(phase8): real Twilio client.
    return { outcome: 'failed', detail: 'twilio_wire_up_pending' };
  }

  // 4. Activity log — shows up in the partner detail feed so reps see
  // what their AI Follow-Up did. Body is the final (possibly AI-
  // personalized) text, with metadata flagging whether AI rewrote it.
  try {
    await prisma.activity.create({
      data: {
        partnerId: args.partnerId,
        userId: args.repUserId,
        type: args.channel === 'email' ? 'EMAIL_OUT' : 'SMS_OUT',
        body: truncate(finalBody, 500),
        metadata: {
          templateId: template.id,
          templateName: template.name,
          messageId: messageId ?? null,
          sentTo: allowed.address,
          automated: true,
          aiPersonalized,
          aiModel: aiModel ?? null,
        } as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    // We've already sent the message. Log the activity failure but
    // don't flip the outcome to failed — the send DID happen.
    console.warn('[dispatch] activity log failed', err);
  }

  return {
    outcome: 'sent',
    messageId,
    contactId: allowed.contactId,
    sentTo: allowed.address,
  };
}

/**
 * Minimal plain-text → HTML conversion plus CAN-SPAM footer.
 *
 * CAN-SPAM §7.5 requires every commercial email to include:
 *   1. A physical postal address.
 *   2. A clear, functional opt-out mechanism.
 *
 * Both are rendered at the bottom of the HTML + baked into the text
 * body higher in the stack.
 */
function toEmailHtml(
  body: string,
  repName: string,
  compliance: { legalName: string; physicalAddress: string; unsubscribeUrl: string },
): string {
  const paras = body.split(/\n{2,}/).map((p) => escapeHtml(p).replace(/\n/g, '<br>'));
  const wrapped = paras.map((p) => `<p style="margin:0 0 12px;">${p}</p>`).join('');
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.55;color:#111827;">
    ${wrapped}
    <p style="margin:24px 0 0;color:#6b7280;font-size:12px;">— ${escapeHtml(repName)}</p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 12px;">
    <p style="margin:0 0 6px;color:#9ca3af;font-size:11px;line-height:1.55;">
      ${escapeHtml(compliance.legalName)} · ${escapeHtml(compliance.physicalAddress)}
    </p>
    <p style="margin:0;color:#9ca3af;font-size:11px;line-height:1.55;">
      Prefer not to hear from us? <a href="${compliance.unsubscribeUrl}" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a>.
    </p>
  </div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

/**
 * Pull the last few activities for a partner so the AI personalizer
 * can ground its rewrite in real history. Failures fall back to []
 * so a DB hiccup never blocks a send.
 */
async function loadRecentActivitySummary(partnerId: string): Promise<string[]> {
  try {
    const recent = await prisma.activity.findMany({
      where: { partnerId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { type: true, body: true, createdAt: true },
    });
    return recent.map((a) => {
      const when = a.createdAt.toISOString().slice(0, 10);
      const snippet = (a.body ?? '').slice(0, 90).replace(/\s+/g, ' ').trim();
      return `${when} · ${a.type}${snippet ? ` — ${snippet}` : ''}`;
    });
  } catch {
    return [];
  }
}

function mapBlockedReason(r: string): DispatchOutcome {
  switch (r) {
    case 'partner_archived':
      return 'blocked_archived';
    case 'quiet_hours':
      return 'blocked_quiet_hours';
    case 'no_consent_contact':
      return 'blocked_consent';
    case 'no_address':
      return 'blocked_no_address';
    default:
      return 'failed';
  }
}
