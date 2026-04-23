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
