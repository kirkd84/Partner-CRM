'use server';

import { revalidatePath } from 'next/cache';
import { prisma, Prisma } from '@partnerradar/db';
import type { PartnerStage } from '@partnerradar/types';
import { stormClient } from '@partnerradar/integrations';
import { auth } from '@/auth';

/**
 * Server actions for the partner detail page.
 * All actions enforce the SPEC §5 permissions model before mutating.
 */

async function assertCanEdit(partnerId: string) {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');
  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: {
      marketId: true,
      assignedRepId: true,
      archivedAt: true,
      stage: true,
      companyName: true,
      publicId: true,
      address: true,
      city: true,
      state: true,
      zip: true,
      partnerType: true,
    },
  });
  if (!partner) throw new Error('NOT_FOUND');
  if (partner.archivedAt) throw new Error('ARCHIVED');

  const inMarket = session.user.markets.includes(partner.marketId);
  const isManagerPlus = session.user.role === 'MANAGER' || session.user.role === 'ADMIN';
  const isOwner = partner.assignedRepId === session.user.id;

  if (!inMarket) throw new Error('FORBIDDEN');
  if (!isManagerPlus && !isOwner) throw new Error('FORBIDDEN');

  return { session, partner, isManagerPlus };
}

export async function changeStage(partnerId: string, stage: PartnerStage, note?: string) {
  const { session, partner: prev } = await assertCanEdit(partnerId);
  const fromStage = prev.stage;

  await prisma.$transaction([
    prisma.partner.update({
      where: { id: partnerId },
      data: { stage, stageChangedAt: new Date() },
    }),
    prisma.activity.create({
      data: {
        partnerId,
        userId: session.user.id,
        type: 'STAGE_CHANGE',
        body: note ?? `Moved stage to ${stage.replace(/_/g, ' ').toLowerCase()}.`,
        // Include fromStage + toStage so /reports funnel can compute
        // conversion, and Inngest subscribers have full context.
        metadata: { stage, fromStage, toStage: stage },
      },
    }),
    prisma.auditLog.create({
      data: {
        userId: session.user.id,
        entityType: 'partner',
        entityId: partnerId,
        action: 'stage_change',
        diff: { from: fromStage, to: stage },
      },
    }),
  ]);
  revalidatePath(`/partners/${partnerId}`);
  revalidatePath('/radar');
  revalidatePath('/partners');

  // Fire-and-forget: enroll this partner in any cadences that trigger
  // on the new stage. Failure to enqueue the event is non-fatal — the
  // partner just doesn't get automated follow-ups this time.
  try {
    const { inngest } = await import('@/lib/inngest-client');
    await inngest.send({
      name: 'partner-portal/partner.stage-changed',
      data: { partnerId, fromStage, newStage: stage },
    });
  } catch (err) {
    console.warn('[stage-change] failed to enqueue cadence enrollment', err);
  }
}

// ─── Contacts ────────────────────────────────────────────────────────

export async function createContact(
  partnerId: string,
  input: {
    name: string;
    title?: string;
    email?: string;
    phone?: string;
    isPrimary?: boolean;
  },
) {
  const { session } = await assertCanEdit(partnerId);
  if (!input.name.trim()) throw new Error('Name required');

  const phones = input.phone ? [{ number: input.phone, label: 'work', primary: true }] : [];
  const emails = input.email ? [{ address: input.email, label: 'work', primary: true }] : [];

  await prisma.$transaction(async (tx) => {
    // If marking as primary, unset other primaries
    if (input.isPrimary) {
      await tx.contact.updateMany({
        where: { partnerId },
        data: { isPrimary: false },
      });
    }
    await tx.contact.create({
      data: {
        partnerId,
        name: input.name.trim(),
        title: input.title?.trim() || null,
        phones,
        emails,
        isPrimary: input.isPrimary ?? false,
      },
    });
    await tx.activity.create({
      data: {
        partnerId,
        userId: session.user.id,
        type: 'COMMENT',
        body: `Added contact: ${input.name.trim()}${input.title ? ` · ${input.title.trim()}` : ''}`,
      },
    });
  });

  revalidatePath(`/partners/${partnerId}`);
}

export async function setPrimaryContact(partnerId: string, contactId: string) {
  await assertCanEdit(partnerId);
  await prisma.$transaction([
    prisma.contact.updateMany({
      where: { partnerId, NOT: { id: contactId } },
      data: { isPrimary: false },
    }),
    prisma.contact.update({
      where: { id: contactId },
      data: { isPrimary: true },
    }),
  ]);
  revalidatePath(`/partners/${partnerId}`);
}

export async function deleteContact(partnerId: string, contactId: string) {
  await assertCanEdit(partnerId);
  await prisma.contact.delete({ where: { id: contactId } });
  revalidatePath(`/partners/${partnerId}`);
}

// ─── Tasks ───────────────────────────────────────────────────────────

export async function createTask(
  partnerId: string,
  input: {
    title: string;
    description?: string;
    dueAt?: string; // ISO
    priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  },
) {
  const { session } = await assertCanEdit(partnerId);
  if (!input.title.trim()) throw new Error('Title required');

  await prisma.task.create({
    data: {
      partnerId,
      assigneeId: session.user.id,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      priority: input.priority ?? 'NORMAL',
    },
  });
  revalidatePath(`/partners/${partnerId}`);
  revalidatePath('/radar');
}

export async function completeTask(taskId: string) {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { partnerId: true, assigneeId: true },
  });
  if (!task) throw new Error('NOT_FOUND');
  // Only the assignee or a manager+ can complete
  const isManagerPlus = session.user.role === 'MANAGER' || session.user.role === 'ADMIN';
  if (task.assigneeId !== session.user.id && !isManagerPlus) throw new Error('FORBIDDEN');

  await prisma.task.update({
    where: { id: taskId },
    data: { completedAt: new Date() },
  });
  if (task.partnerId) revalidatePath(`/partners/${task.partnerId}`);
  revalidatePath('/radar');
}

// ─── Appointments ────────────────────────────────────────────────────

export async function createAppointment(
  partnerId: string,
  input: {
    type: string;
    title: string;
    location?: string;
    startsAt: string; // ISO
    endsAt: string; // ISO
    notes?: string;
    /** When true, skip conflict detection (user clicked "Save anyway"). */
    force?: boolean;
  },
): Promise<{ ok: true } | { ok: false; conflicts: ConflictReport[] }> {
  const { session } = await assertCanEdit(partnerId);
  if (!input.title.trim()) throw new Error('Title required');

  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);

  // SPEC §6.4 — conflict detection against the rep's other appointments
  // AND cached external events. The user can bypass with `force:true`
  // (the drawer surfaces this as the "Save anyway" button).
  if (!input.force) {
    const conflicts = await findAppointmentConflicts(session.user.id, startsAt, endsAt);
    if (conflicts.length > 0) {
      return { ok: false, conflicts };
    }
  }

  await prisma.appointment.create({
    data: {
      partnerId,
      userId: session.user.id,
      type: input.type,
      title: input.title.trim(),
      location: input.location?.trim() || null,
      startsAt,
      endsAt,
      notes: input.notes?.trim() || null,
    },
  });
  revalidatePath(`/partners/${partnerId}`);
  revalidatePath('/calendar');
  return { ok: true };
}

export interface ConflictReport {
  title: string;
  startsAt: string;
  endsAt: string;
  source: 'internal' | 'external';
  provider?: string;
}

async function findAppointmentConflicts(
  userId: string,
  startsAt: Date,
  endsAt: Date,
): Promise<ConflictReport[]> {
  // Pull overlapping internal appointments + cached externals. We use
  // half-open comparison on both so back-to-back slots (e.g. 10-11 vs
  // 11-12) are NOT flagged as a conflict.
  const hits: ConflictReport[] = [];

  const internalOverlaps = await prisma.appointment.findMany({
    where: { userId, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } },
    select: { title: true, startsAt: true, endsAt: true },
  });
  for (const a of internalOverlaps) {
    hits.push({
      title: a.title,
      startsAt: a.startsAt.toISOString(),
      endsAt: a.endsAt.toISOString(),
      source: 'internal',
    });
  }

  try {
    const externalOverlaps = await prisma.calendarEventCache.findMany({
      where: { userId, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } },
      select: { title: true, startsAt: true, endsAt: true, provider: true },
    });
    for (const x of externalOverlaps) {
      hits.push({
        title: x.title,
        startsAt: x.startsAt.toISOString(),
        endsAt: x.endsAt.toISOString(),
        source: 'external',
        provider: x.provider,
      });
    }
  } catch {
    // Cache table may not exist pre-migrate — fall through.
  }

  return hits;
}

// ─── Events (Chamber mixers, lunch-and-learns, broker opens) ─────────

export async function createEvent(
  partnerId: string,
  input: {
    type: string;
    title: string;
    location?: string;
    startsAt: string; // ISO
    endsAt?: string; // ISO
    notes?: string;
  },
) {
  const { session } = await assertCanEdit(partnerId);
  if (!input.title.trim()) throw new Error('Title required');

  await prisma.event.create({
    data: {
      partnerId,
      userId: session.user.id,
      type: input.type,
      title: input.title.trim(),
      location: input.location?.trim() || null,
      startsAt: new Date(input.startsAt),
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
      notes: input.notes?.trim() || null,
    },
  });
  revalidatePath(`/partners/${partnerId}`);
}

// ─── Comments (existing) ─────────────────────────────────────────────

export async function addComment(partnerId: string, body: string) {
  if (!body.trim()) return;
  const { session } = await assertCanEdit(partnerId);
  await prisma.activity.create({
    data: {
      partnerId,
      userId: session.user.id,
      type: 'COMMENT',
      body: body.trim().slice(0, 5000),
    },
  });
  revalidatePath(`/partners/${partnerId}`);
  revalidatePath('/radar');
}

/**
 * Activate a partner — the SPEC §3.17 balloon moment.
 *
 * Flow:
 *   1. Permission check (manager+ only)
 *   2. Serialize partner + primary contact into Storm's CreatePartnerPayload
 *   3. Call stormClient.createReferralPartner() — mock by default
 *   4. Persist stormCloudId, set stage=ACTIVATED, activatedAt=now, activatedBy
 *   5. Log Activity(ACTIVATION) and AuditLog
 *   6. Return payload so the client can fire balloons + toast
 */
export async function activatePartner(partnerId: string) {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');
  if (session.user.role !== 'MANAGER' && session.user.role !== 'ADMIN') {
    throw new Error('FORBIDDEN: manager+ required to activate partners');
  }

  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
    include: {
      contacts: { where: { isPrimary: true }, take: 1 },
      market: { select: { id: true, name: true } },
    },
  });
  if (!partner) throw new Error('NOT_FOUND');
  if (partner.stage === 'ACTIVATED') {
    return { alreadyActivated: true, stormCloudId: partner.stormCloudId ?? null };
  }

  const primary = partner.contacts[0];
  const primaryEmail = (
    primary?.emails as Array<{ address: string; primary?: boolean }> | null
  )?.find((e) => e.primary)?.address;
  const primaryPhone = (
    primary?.phones as Array<{ number: string; primary?: boolean }> | null
  )?.find((p) => p.primary)?.number;

  // Push to Storm Cloud (mock by default; real in Phase 5 when API lands)
  const { stormCloudId } = await stormClient().createReferralPartner({
    externalId: partner.publicId,
    companyName: partner.companyName,
    partnerType: partner.partnerType,
    address: partner.address ?? undefined,
    marketCode: partner.market.name,
    primaryContact: primary
      ? {
          name: primary.name,
          email: primaryEmail,
          phone: primaryPhone,
        }
      : undefined,
    metadata: {
      activatedAt: new Date().toISOString(),
      activatedBy: session.user.id,
      notes: partner.notes ?? undefined,
    },
  });

  const now = new Date();
  await prisma.$transaction([
    prisma.partner.update({
      where: { id: partnerId },
      data: {
        stage: 'ACTIVATED',
        stageChangedAt: now,
        activatedAt: now,
        activatedBy: session.user.id,
        stormCloudId,
      },
    }),
    prisma.activity.create({
      data: {
        partnerId,
        userId: session.user.id,
        type: 'ACTIVATION',
        body: `Activated and pushed to Storm Cloud. 🎉 (stormCloudId: ${stormCloudId})`,
        metadata: { stormCloudId },
      },
    }),
    prisma.auditLog.create({
      data: {
        userId: session.user.id,
        entityType: 'partner',
        entityId: partnerId,
        action: 'activate',
        diff: { stormCloudId, activatedAt: now.toISOString() } as Prisma.InputJsonValue,
      },
    }),
  ]);

  revalidatePath(`/partners/${partnerId}`);
  revalidatePath('/radar');
  revalidatePath('/partners');

  // Kick off a first revenue sync so the partner's financial panel has
  // something to show the moment activation completes — instead of
  // waiting up to 6 hours for the cron to pick them up. Fire-and-forget;
  // failure here must not block activation.
  try {
    const { inngest } = await import('@/lib/inngest-client');
    await inngest.send({
      name: 'partner-portal/storm-revenue.sync',
      data: { partnerId },
    });
  } catch (err) {
    console.warn('[activate] failed to enqueue storm-revenue sync', err);
  }

  return { alreadyActivated: false, stormCloudId };
}

// ─── Expenses (Phase 6) ──────────────────────────────────────────────
import { decideApproval } from '@partnerradar/api';
import {
  draftMessage,
  placeholderDraft,
  isAIConfigured,
  type DraftArgs,
  type DraftPurpose,
} from '@partnerradar/ai';

const EXPENSE_CATEGORIES = ['Meal', 'Gift', 'Event', 'Travel', 'Other'] as const;
type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export async function createExpense(
  partnerId: string,
  input: {
    amount: number;
    description: string;
    category: ExpenseCategory;
    occurredOn: string; // ISO
    // receiptFileId comes in Phase 6.1 once R2 is connected
  },
): Promise<{ ok: true; status: string; reason: string } | { ok: false; reason: string }> {
  const { session } = await assertCanEdit(partnerId);
  if (!input.amount || input.amount <= 0) throw new Error('Amount must be positive');
  if (!input.description.trim()) throw new Error('Description required');
  if (!EXPENSE_CATEGORIES.includes(input.category)) throw new Error('Invalid category');

  // Pull the rep's month-to-date spend + applicable budget rule.
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [monthSpendRow, userRow, ruleRow] = await Promise.all([
    prisma.expense.aggregate({
      where: {
        userId: session.user.id,
        occurredOn: { gte: startOfMonth },
        approvalStatus: { not: 'REJECTED' },
      },
      _sum: { amount: true },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { monthlyRevenueCached: true },
    }),
    // Prefer a rep-specific rule, then market-specific, then default.
    findApplicableBudgetRule(session.user.id, session.user.markets[0] ?? null),
  ]);

  const monthToDateSpend = Number(monthSpendRow._sum.amount ?? 0);
  const monthlyRevenueCached = userRow?.monthlyRevenueCached
    ? Number(userRow.monthlyRevenueCached)
    : null;

  const decision = decideApproval({
    amount: input.amount,
    rule: {
      autoApproveUnder: Number(ruleRow.autoApproveUnder),
      managerApproveUnder: Number(ruleRow.managerApproveUnder),
      monthlyBudgetPercentOfRevenue: ruleRow.monthlyBudgetPercentOfRevenue
        ? Number(ruleRow.monthlyBudgetPercentOfRevenue)
        : null,
    },
    monthToDateSpend,
    monthlyRevenueCached,
  });

  if (decision.status === 'BLOCKED_OVER_CAP') {
    return { ok: false, reason: decision.reason };
  }

  const dbStatus = decision.status === 'AUTO_APPROVED' ? 'AUTO_APPROVED' : 'PENDING';

  const created = await prisma.expense.create({
    data: {
      partnerId,
      userId: session.user.id,
      amount: new Prisma.Decimal(input.amount),
      description: input.description.trim(),
      category: input.category,
      occurredOn: new Date(input.occurredOn),
      approvalStatus: dbStatus,
    },
    select: { id: true },
  });

  revalidatePath(`/partners/${partnerId}`);
  revalidatePath('/admin/expenses');
  revalidatePath('/radar');

  // Email the approver pool so pending expenses don't languish in a
  // queue no one's watching. Fire-and-forget — this must never block
  // submission.
  if (dbStatus === 'PENDING') {
    const { notifyExpensePending } = await import('@/lib/notifications/expense-emails');
    await notifyExpensePending(created.id);
  }

  return { ok: true, status: decision.status, reason: decision.reason };
}

async function findApplicableBudgetRule(userId: string, marketId: string | null) {
  const rule = await prisma.budgetRule.findFirst({
    where: { repId: userId },
  });
  if (rule) return rule;
  if (marketId) {
    const marketRule = await prisma.budgetRule.findFirst({
      where: { marketId, repId: null },
    });
    if (marketRule) return marketRule;
  }
  const globalRule = await prisma.budgetRule.findFirst({
    where: { marketId: null, repId: null },
  });
  if (globalRule) return globalRule;
  // No rule stored yet — return DEFAULT as a Decimal-friendly shape.
  return {
    autoApproveUnder: new Prisma.Decimal(25),
    managerApproveUnder: new Prisma.Decimal(100),
    monthlyBudgetPercentOfRevenue: null as Prisma.Decimal | null,
  };
}

// ─── AI drafts (Phase 7) ─────────────────────────────────────────────

export async function generateAIDraft(
  partnerId: string,
  input: {
    channel: 'email' | 'sms';
    purpose: DraftPurpose;
    contextNotes?: string;
  },
): Promise<{ subject?: string; body: string; model: string; isPlaceholder: boolean }> {
  const { session } = await assertCanEdit(partnerId);

  const [partner, user, recentActivities] = await Promise.all([
    prisma.partner.findUniqueOrThrow({
      where: { id: partnerId },
      select: {
        companyName: true,
        partnerType: true,
        notes: true,
        market: { select: { name: true } },
      },
    }),
    prisma.user.findUniqueOrThrow({
      where: { id: session.user.id },
      select: { name: true, aiToneProfile: true },
    }),
    prisma.activity.findMany({
      where: { partnerId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { type: true, body: true, createdAt: true },
    }),
  ]);

  const firstName = user.name.split(/\s+/)[0] ?? user.name;
  const recentSummaries = recentActivities.map(
    (a) => `${a.type.toLowerCase()}: ${(a.body ?? '').slice(0, 140)}`,
  );

  const args: DraftArgs = {
    channel: input.channel,
    purpose: input.purpose,
    contextNotes: input.contextNotes,
    partner: {
      companyName: partner.companyName,
      partnerType: partner.partnerType,
      marketName: partner.market?.name,
      notes: partner.notes,
      recentActivity: recentSummaries,
    },
    rep: { name: user.name, firstName },
    tone:
      user.aiToneProfile && typeof user.aiToneProfile === 'object'
        ? (user.aiToneProfile as DraftArgs['tone'])
        : null,
  };

  if (!isAIConfigured()) {
    return { ...placeholderDraft(args), isPlaceholder: true };
  }
  try {
    const res = await draftMessage(args);
    return { ...res, isPlaceholder: false };
  } catch (err) {
    console.error('[ai draft] falling back to placeholder:', err);
    return { ...placeholderDraft(args), isPlaceholder: true };
  }
}

/**
 * Record that the rep accepted a draft (sent it or saved it with edits).
 * Increments aiAutonomousApprovals toward the 5-approval autonomy gate.
 */
export async function recordDraftAccepted(
  partnerId: string,
  input: { channel: 'email' | 'sms'; subject?: string; body: string },
): Promise<void> {
  const { session } = await assertCanEdit(partnerId);
  await prisma.$transaction([
    prisma.activity.create({
      data: {
        partnerId,
        userId: session.user.id,
        type: input.channel === 'email' ? 'EMAIL_OUT' : 'SMS_OUT',
        body:
          input.channel === 'email'
            ? `[draft-accepted] ${input.subject ?? '(no subject)'}\n\n${input.body}`
            : `[draft-accepted] ${input.body}`,
      },
    }),
    prisma.user.update({
      where: { id: session.user.id },
      data: { aiAutonomousApprovals: { increment: 1 } },
    }),
  ]);
  revalidatePath(`/partners/${partnerId}`);
}

// ─── Customer conversion ────────────────────────────────────────────
//
// "Sometimes a partner turns into a customer — we roof their house!"
// Two modes:
//
//   • partner_and_customer: they still refer us business AND we work
//     for them. Flag isCustomer=true; the partner record stays active
//     in PartnerRadar and a Storm customer is queued for create.
//
//   • customer_only: the relationship has shifted entirely; they're
//     just a customer now. Flag isCustomer=true + customerOnly=true,
//     stage moves to INACTIVE (with reason), partner is archived from
//     active pipeline. Storm push happens the same way.
//
// The Storm push itself is intentionally a stub — once Kirk wires
// STORM_CLOUD_API_KEY we can replace the logged-only branch with
// stormClient.createCustomer({...}). Today we log the intent + write
// an audit entry so the conversion is traceable.

export type CustomerConvertMode = 'partner_and_customer' | 'customer_only';

export async function convertToCustomer(
  partnerId: string,
  input: {
    mode: CustomerConvertMode;
    /** Required when mode=customer_only; reasoning shown in audit log + Reports → Funnel */
    dormantReason?: string;
    /** Optional free-text note copied onto the activity for context */
    note?: string;
  },
) {
  const { session, partner } = await assertCanEdit(partnerId);
  if (input.mode === 'customer_only' && !input.dormantReason?.trim()) {
    throw new Error('A reason is required when archiving a partner as customer-only.');
  }

  const now = new Date();
  const { mode } = input;

  const data: Record<string, unknown> = {
    isCustomer: true,
    becameCustomerAt: now,
  };
  if (mode === 'customer_only') {
    data.customerOnly = true;
    data.stage = 'INACTIVE';
    data.stageChangedAt = now;
    data.dormantReason = input.dormantReason!.trim();
    data.archivedAt = now;
  }

  // Stub the Storm push — we record the intent so Kirk can confirm
  // every conversion in the audit log and re-drive once Storm creds
  // are live. When STORM_CLOUD_API_KEY arrives, replace this block
  // with a real stormClient.createCustomer call inside the transaction.
  const stormPushNote = process.env.STORM_CLOUD_API_KEY
    ? '(Storm push will be wired by the Storm sync job.)'
    : '(Storm push pending — STORM_CLOUD_API_KEY not configured yet.)';

  await prisma.$transaction([
    prisma.partner.update({ where: { id: partnerId }, data }),
    prisma.activity.create({
      data: {
        partnerId,
        userId: session.user.id,
        type: 'COMMENT',
        body:
          mode === 'partner_and_customer'
            ? `${session.user.name} marked this partner as a customer (still partnering). ${stormPushNote}${
                input.note ? `\n\nNote: ${input.note}` : ''
              }`
            : `${session.user.name} converted this partner to a customer-only record. Reason: ${input.dormantReason}. ${stormPushNote}${
                input.note ? `\n\nNote: ${input.note}` : ''
              }`,
        metadata: {
          customerConvertMode: mode,
          dormantReason: input.dormantReason ?? null,
          stormPushed: false,
        },
      },
    }),
    prisma.auditLog.create({
      data: {
        userId: session.user.id,
        entityType: 'Partner',
        entityId: partnerId,
        action: 'CONVERT_TO_CUSTOMER',
        diff: {
          mode,
          dormantReason: input.dormantReason ?? null,
          fromStage: partner.stage,
          stormPushed: false,
        },
      },
    }),
  ]);

  revalidatePath(`/partners/${partnerId}`);
  revalidatePath('/partners');
  revalidatePath('/radar');
  return { ok: true, mode };
}

// ─── Stage change with dormant-reason gate ─────────────────────────
//
// Companion to changeStage that ENFORCES a reason when transitioning
// to INACTIVE. The /partners/[id] UI calls this for INACTIVE moves
// and falls through to changeStage() for everything else.
export async function changeStageToInactive(partnerId: string, reason: string, note?: string) {
  if (!reason.trim()) throw new Error('A reason is required when marking a partner Inactive.');
  const { session, partner: prev } = await assertCanEdit(partnerId);
  const fromStage = prev.stage;

  await prisma.$transaction([
    prisma.partner.update({
      where: { id: partnerId },
      data: {
        stage: 'INACTIVE',
        stageChangedAt: new Date(),
        dormantReason: reason.trim(),
      },
    }),
    prisma.activity.create({
      data: {
        partnerId,
        userId: session.user.id,
        type: 'STAGE_CHANGE',
        body: note?.trim() || `Marked Inactive. Reason: ${reason.trim()}`,
        metadata: { fromStage, toStage: 'INACTIVE', dormantReason: reason.trim() },
      },
    }),
    prisma.auditLog.create({
      data: {
        userId: session.user.id,
        entityType: 'partner',
        entityId: partnerId,
        action: 'stage_change',
        diff: { from: fromStage, to: 'INACTIVE', dormantReason: reason.trim() },
      },
    }),
  ]);
  revalidatePath(`/partners/${partnerId}`);
  revalidatePath('/radar');
  revalidatePath('/partners');
  return { ok: true };
}

// ─── Referral linkage ──────────────────────────────────────────────
//
// Set who referred this partner. Pass null to clear. Self-referral is
// rejected. The schema's onDelete=SetNull keeps cycles harmless even
// if the referring partner is later archived.
export async function setReferredBy(
  partnerId: string,
  referredByPartnerId: string | null,
): Promise<{ ok: true }> {
  const { session } = await assertCanEdit(partnerId);
  if (referredByPartnerId === partnerId) {
    throw new Error("A partner can't refer themselves.");
  }
  await prisma.partner.update({
    where: { id: partnerId },
    data: { referredByPartnerId },
  });
  await prisma.activity.create({
    data: {
      partnerId,
      userId: session.user.id,
      type: 'COMMENT',
      body: referredByPartnerId
        ? `${session.user.name} set the referral source for this partner.`
        : `${session.user.name} cleared the referral source for this partner.`,
      metadata: { referredByPartnerId },
    },
  });
  revalidatePath(`/partners/${partnerId}`);
  if (referredByPartnerId) revalidatePath(`/partners/${referredByPartnerId}`);
  return { ok: true };
}
