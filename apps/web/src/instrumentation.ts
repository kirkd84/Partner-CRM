/**
 * Next.js instrumentation hook — runs ONCE when the server boots.
 *
 * Why this exists: Kirk is shipping PartnerRadar via Cowork without a
 * developer to run `prisma db push` against Railway Postgres by hand.
 * Instead of nagging him to open PowerShell every time the schema
 * changes, we apply the outstanding DDL here using the Prisma client's
 * raw-SQL escape hatch.
 *
 * Rules for new migrations:
 *  • Every statement MUST be idempotent (IF NOT EXISTS, IF EXISTS,
 *    DO $$ BEGIN ... END $$ guards). This runs on every boot.
 *  • If something fails, we log and keep going — the server MUST come
 *    up even if a migration is broken, otherwise Railway's healthcheck
 *    will kill the deploy and we lose the ability to ship a fix.
 *  • Never use this for destructive changes (drops, renames) — do
 *    those the old-fashioned way in a Railway Data console session.
 *  • Toggle off with SKIP_AUTO_MIGRATE=1 if we ever need to bail.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.SKIP_AUTO_MIGRATE === '1') {
    console.log('[auto-migrate] Skipped — SKIP_AUTO_MIGRATE=1');
    return;
  }
  if (!process.env.DATABASE_URL) {
    console.warn('[auto-migrate] No DATABASE_URL in env; skipping.');
    return;
  }

  const startedAt = Date.now();
  try {
    // Dynamic import keeps Prisma out of the edge runtime bundle.
    const { prisma } = await import('@partnerradar/db');
    await applyPendingDDL(prisma);
    await seedAppointmentTypes(prisma);
    await seedMessageTemplates(prisma);
    await seedAutomationCadences(prisma);
    console.log(`[auto-migrate] Completed in ${Date.now() - startedAt}ms`);
  } catch (err) {
    // NEVER throw — we do not want a migration bug to wedge the
    // entire deploy. Log loudly so it shows up in Railway logs.
    console.error('[auto-migrate] FAILED (server will still boot):', err);
  }
}

async function applyPendingDDL(prisma: { $executeRawUnsafe: (sql: string) => Promise<unknown> }) {
  const statements: Array<{ label: string; sql: string }> = [
    // ── AppointmentType table ──
    {
      label: 'create AppointmentType',
      sql: `
        CREATE TABLE IF NOT EXISTS "AppointmentType" (
          "id" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          "durationMinutes" INTEGER NOT NULL DEFAULT 30,
          "reminderMinutesBefore" INTEGER,
          "alertIfUnassigned" BOOLEAN NOT NULL DEFAULT false,
          "alertUserId" TEXT,
          "archivedAt" TIMESTAMP(3),
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "AppointmentType_pkey" PRIMARY KEY ("id")
        )
      `,
    },
    {
      label: 'unique index on AppointmentType.name',
      sql: `
        CREATE UNIQUE INDEX IF NOT EXISTS "AppointmentType_name_key"
          ON "AppointmentType"("name")
      `,
    },
    {
      label: 'index on AppointmentType.archivedAt',
      sql: `
        CREATE INDEX IF NOT EXISTS "AppointmentType_archivedAt_idx"
          ON "AppointmentType"("archivedAt")
      `,
    },
    {
      label: 'FK AppointmentType.alertUserId → User.id',
      sql: `
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'AppointmentType_alertUserId_fkey'
          ) THEN
            ALTER TABLE "AppointmentType"
              ADD CONSTRAINT "AppointmentType_alertUserId_fkey"
              FOREIGN KEY ("alertUserId")
              REFERENCES "User"("id")
              ON DELETE SET NULL ON UPDATE CASCADE;
          END IF;
        END $$;
      `,
    },

    // ── Appointment.appointmentTypeId column + FK ──
    {
      label: 'add Appointment.appointmentTypeId',
      sql: `
        ALTER TABLE "Appointment"
          ADD COLUMN IF NOT EXISTS "appointmentTypeId" TEXT
      `,
    },
    {
      label: 'index on Appointment.appointmentTypeId',
      sql: `
        CREATE INDEX IF NOT EXISTS "Appointment_appointmentTypeId_idx"
          ON "Appointment"("appointmentTypeId")
      `,
    },
    {
      label: 'FK Appointment.appointmentTypeId → AppointmentType.id',
      sql: `
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'Appointment_appointmentTypeId_fkey'
          ) THEN
            ALTER TABLE "Appointment"
              ADD CONSTRAINT "Appointment_appointmentTypeId_fkey"
              FOREIGN KEY ("appointmentTypeId")
              REFERENCES "AppointmentType"("id")
              ON DELETE SET NULL ON UPDATE CASCADE;
          END IF;
        END $$;
      `,
    },

    // ── Event table (partner-level networking events) ──
    // Included defensively — it was added in the same schema change
    // window as AppointmentType and may not exist yet in older DBs.
    {
      label: 'create Event',
      sql: `
        CREATE TABLE IF NOT EXISTS "Event" (
          "id" TEXT NOT NULL,
          "partnerId" TEXT NOT NULL,
          "userId" TEXT NOT NULL,
          "type" TEXT NOT NULL,
          "title" TEXT NOT NULL,
          "location" TEXT,
          "startsAt" TIMESTAMP(3) NOT NULL,
          "endsAt" TIMESTAMP(3),
          "notes" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
        )
      `,
    },
    {
      label: 'index on Event(partnerId, startsAt)',
      sql: `
        CREATE INDEX IF NOT EXISTS "Event_partnerId_startsAt_idx"
          ON "Event"("partnerId", "startsAt")
      `,
    },
    {
      label: 'index on Event(userId)',
      sql: `
        CREATE INDEX IF NOT EXISTS "Event_userId_idx"
          ON "Event"("userId")
      `,
    },
    {
      label: 'FK Event.partnerId → Partner.id',
      sql: `
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'Event_partnerId_fkey'
          ) THEN
            ALTER TABLE "Event"
              ADD CONSTRAINT "Event_partnerId_fkey"
              FOREIGN KEY ("partnerId")
              REFERENCES "Partner"("id")
              ON DELETE CASCADE ON UPDATE CASCADE;
          END IF;
        END $$;
      `,
    },
    {
      label: 'FK Event.userId → User.id',
      sql: `
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'Event_userId_fkey'
          ) THEN
            ALTER TABLE "Event"
              ADD CONSTRAINT "Event_userId_fkey"
              FOREIGN KEY ("userId")
              REFERENCES "User"("id")
              ON DELETE RESTRICT ON UPDATE CASCADE;
          END IF;
        END $$;
      `,
    },

    // ── WebhookEvent table (Phase 5 — Storm webhook receiver) ──
    {
      label: 'create WebhookEvent',
      sql: `
        CREATE TABLE IF NOT EXISTS "WebhookEvent" (
          "id" TEXT NOT NULL,
          "source" TEXT NOT NULL,
          "externalEventId" TEXT NOT NULL,
          "eventType" TEXT NOT NULL,
          "verified" BOOLEAN NOT NULL DEFAULT false,
          "payload" JSONB NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
        )
      `,
    },
    {
      label: 'unique index on WebhookEvent.externalEventId',
      sql: `
        CREATE UNIQUE INDEX IF NOT EXISTS "WebhookEvent_externalEventId_key"
          ON "WebhookEvent"("externalEventId")
      `,
    },
    {
      label: 'index on WebhookEvent(source, createdAt)',
      sql: `
        CREATE INDEX IF NOT EXISTS "WebhookEvent_source_createdAt_idx"
          ON "WebhookEvent"("source", "createdAt")
      `,
    },
  ];

  for (const { label, sql } of statements) {
    try {
      await prisma.$executeRawUnsafe(sql);
      console.log(`[auto-migrate]   ✓ ${label}`);
    } catch (err) {
      console.error(`[auto-migrate]   ✗ ${label}:`, err);
      // Keep going — one failure shouldn't block the rest.
    }
  }
}

async function seedAppointmentTypes(prisma: {
  appointmentType: {
    count: () => Promise<number>;
    createMany: (args: { data: unknown[]; skipDuplicates: boolean }) => Promise<unknown>;
  };
}) {
  // Only seed when the catalog is empty — admins can rename/delete
  // any of these and we should never undo their edits.
  const existing = await prisma.appointmentType.count();
  if (existing > 0) return;

  const SEED = [
    { name: 'Initial Inspection', durationMinutes: 60, reminderMinutesBefore: 60 },
    { name: 'Adjuster meeting', durationMinutes: 60, reminderMinutesBefore: 60 },
    { name: 'Reinspection meeting', durationMinutes: 60, reminderMinutesBefore: 60 },
    { name: 'Measurements', durationMinutes: 45, reminderMinutesBefore: 30 },
    { name: 'Photo Appointment', durationMinutes: 30, reminderMinutesBefore: 30 },
    { name: 'Loss Sheet Review', durationMinutes: 30, reminderMinutesBefore: 60 },
    { name: 'Manager meeting', durationMinutes: 30, reminderMinutesBefore: 30 },
    { name: 'Material Pickup', durationMinutes: 30, reminderMinutesBefore: 30 },
    { name: 'Roofing Material Delivery', durationMinutes: 60, reminderMinutesBefore: 120 },
    { name: 'Permit Inspection', durationMinutes: 30, reminderMinutesBefore: 60 },
    { name: 'Work Order Repair', durationMinutes: 120, reminderMinutesBefore: 60 },
    { name: 'First Insurance Check Pickup', durationMinutes: 30, reminderMinutesBefore: 60 },
    { name: 'Deductible check pickup', durationMinutes: 30, reminderMinutesBefore: 60 },
    { name: 'Final check pickup', durationMinutes: 30, reminderMinutesBefore: 60 },
  ];

  await prisma.appointmentType.createMany({ data: SEED, skipDuplicates: true });
  console.log(`[auto-migrate]   ✓ seeded ${SEED.length} appointment types`);
}

/**
 * Seed canonical message templates the first time the tenant loads.
 * Admins can rename, deactivate, or delete these — we only create them
 * once (when the table is empty) so edits stick.
 *
 * Why seed at all: brand-new tenants open /admin/cadences and find an
 * empty template picker. That stalls them. Shipping 4–5 real, working
 * templates means the first cadence can go out in under a minute.
 */
async function seedMessageTemplates(prisma: {
  messageTemplate: {
    count: () => Promise<number>;
    createMany: (args: { data: unknown[]; skipDuplicates: boolean }) => Promise<unknown>;
  };
  user: { findFirst: (args: { where: { role: 'ADMIN' } }) => Promise<{ id: string } | null> };
}) {
  let existing = 0;
  try {
    existing = await prisma.messageTemplate.count();
  } catch {
    return; // table not migrated yet
  }
  if (existing > 0) return;

  const createdBy = (await prisma.user.findFirst({ where: { role: 'ADMIN' } }))?.id ?? 'system';

  const TEMPLATES = [
    {
      kind: 'EMAIL' as const,
      name: 'Post-meeting follow-up',
      subject: 'Great chatting, {{contact_first_name}}',
      body: `Hi {{contact_first_name}},

Thanks again for the time today — really appreciated learning more about how {{partner_name}} is thinking about the next quarter.

I'll pull together what we talked about and send it over this week. In the meantime, reply to this email if anything else comes up.

— {{rep_first_name}}`,
      stage: 'MEETING_SCHEDULED' as const,
      active: true,
      createdBy,
    },
    {
      kind: 'EMAIL' as const,
      name: 'Proposal follow-up',
      subject: 'Quick follow-up on the proposal',
      body: `Hi {{contact_first_name}},

Wanted to check in on the proposal I sent over for {{partner_name}}. Happy to walk through any pieces that are still open, or adjust scope if it'd help.

What's a good time to chat next week?

— {{rep_first_name}}`,
      stage: 'PROPOSAL_SENT' as const,
      active: true,
      createdBy,
    },
    {
      kind: 'EMAIL' as const,
      name: 'Re-engagement — partner went quiet',
      subject: 'Are we still a fit, {{contact_first_name}}?',
      body: `Hi {{contact_first_name}},

Haven't heard back in a bit on {{partner_name}} — totally understand if the timing isn't right.

If you're still sizing things up, I'm around. If you've moved in a different direction, no worries, just let me know so I can stop pinging.

— {{rep_first_name}}`,
      stage: null,
      active: true,
      createdBy,
    },
    {
      kind: 'SMS' as const,
      name: 'Meeting reminder (SMS)',
      subject: null,
      body: `Hi {{contact_first_name}}, looking forward to our chat tomorrow for {{partner_name}}. Reply here if anything changes — {{rep_first_name}}`,
      stage: 'MEETING_SCHEDULED' as const,
      active: true,
      createdBy,
    },
    {
      kind: 'SMS' as const,
      name: 'Quick check-in (SMS)',
      subject: null,
      body: `Hey {{contact_first_name}}, wanted to check in on {{partner_name}}. Still working toward a good fit? — {{rep_first_name}}`,
      stage: null,
      active: true,
      createdBy,
    },
  ];

  try {
    await prisma.messageTemplate.createMany({ data: TEMPLATES, skipDuplicates: true });
    console.log(`[auto-migrate]   ✓ seeded ${TEMPLATES.length} message templates`);
  } catch (err) {
    console.warn('[auto-migrate]   ✗ seed templates failed (ok to ignore on first boot)', err);
  }
}

/**
 * Seed a couple of starter cadences that reference the templates
 * above. Only runs when the table is empty AND the templates exist —
 * otherwise step.templateId would point at nothing.
 */
async function seedAutomationCadences(prisma: {
  automationCadence: {
    count: () => Promise<number>;
    create: (args: { data: unknown }) => Promise<unknown>;
  };
  messageTemplate: {
    findFirst: (args: {
      where: { name: string };
      select: { id: true };
    }) => Promise<{ id: string } | null>;
  };
  user: { findFirst: (args: { where: { role: 'ADMIN' } }) => Promise<{ id: string } | null> };
}) {
  let existing = 0;
  try {
    existing = await prisma.automationCadence.count();
  } catch {
    return;
  }
  if (existing > 0) return;

  const admin = (await prisma.user.findFirst({ where: { role: 'ADMIN' } }))?.id;
  if (!admin) {
    console.log('[auto-migrate]   · skipping cadence seed — no admin user yet');
    return;
  }

  const [smsReminder, postMeeting, proposalFollow, reengage] = await Promise.all([
    prisma.messageTemplate.findFirst({
      where: { name: 'Meeting reminder (SMS)' },
      select: { id: true },
    }),
    prisma.messageTemplate.findFirst({
      where: { name: 'Post-meeting follow-up' },
      select: { id: true },
    }),
    prisma.messageTemplate.findFirst({
      where: { name: 'Proposal follow-up' },
      select: { id: true },
    }),
    prisma.messageTemplate.findFirst({
      where: { name: 'Re-engagement — partner went quiet' },
      select: { id: true },
    }),
  ]);

  const CADENCES: Array<{
    name: string;
    triggerStage: string;
    steps: Array<{
      offsetHours: number;
      kind: 'EMAIL' | 'SMS';
      templateId: string;
      requireApproval: boolean;
    }>;
  }> = [];

  if (smsReminder && postMeeting) {
    CADENCES.push({
      name: 'Meeting scheduled → SMS reminder + email follow-up',
      triggerStage: 'MEETING_SCHEDULED',
      steps: [
        { offsetHours: 24, kind: 'SMS', templateId: smsReminder.id, requireApproval: false },
        {
          offsetHours: 24,
          kind: 'EMAIL',
          templateId: postMeeting.id,
          requireApproval: false,
        },
      ],
    });
  }

  if (proposalFollow) {
    CADENCES.push({
      name: 'Proposal sent → check-in after 3 days',
      triggerStage: 'PROPOSAL_SENT',
      steps: [
        {
          offsetHours: 72,
          kind: 'EMAIL',
          templateId: proposalFollow.id,
          requireApproval: false,
        },
      ],
    });
  }

  if (reengage) {
    CADENCES.push({
      name: 'In conversation → re-engagement after 10 days',
      triggerStage: 'IN_CONVERSATION',
      steps: [{ offsetHours: 240, kind: 'EMAIL', templateId: reengage.id, requireApproval: true }],
    });
  }

  try {
    for (const c of CADENCES) {
      await prisma.automationCadence.create({
        data: {
          name: c.name,
          triggerStage: c.triggerStage,
          steps: c.steps,
          active: true,
          createdBy: admin,
        },
      });
    }
    console.log(`[auto-migrate]   ✓ seeded ${CADENCES.length} automation cadences`);
  } catch (err) {
    console.warn('[auto-migrate]   ✗ seed cadences failed (ok to ignore on first boot)', err);
  }
}
