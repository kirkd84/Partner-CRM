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
    await provisionMarketingWorkspaces(prisma);
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

    // ── Partner field additions for Event Tracking fallback waitlist ──
    {
      label: 'add Partner.autoWaitlistEligible',
      sql: `ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "autoWaitlistEligible" BOOLEAN NOT NULL DEFAULT false`,
    },
    {
      label: 'add Partner.waitlistPriority',
      sql: `ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "waitlistPriority" INTEGER`,
    },
    // EV-8: Partner reliability stats populated by the post-event
    // postmortem. Null until first event; kept as FLOAT (nullable) so
    // queries that sort on them can put nulls last via ORDER BY.
    {
      label: 'add Partner.eventAcceptanceRate',
      sql: `ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "eventAcceptanceRate" DOUBLE PRECISION`,
    },
    {
      label: 'add Partner.eventShowRate',
      sql: `ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "eventShowRate" DOUBLE PRECISION`,
    },
    {
      label: 'add Partner.reliabilityScore',
      sql: `ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "reliabilityScore" DOUBLE PRECISION`,
    },
    // EV-11: shareable read-only event link (lazy-generated).
    {
      label: 'add EvEvent.shareToken',
      sql: `ALTER TABLE "EvEvent" ADD COLUMN IF NOT EXISTS "shareToken" TEXT`,
    },
    // EV-11 UX pass: HOST_ONLY visibility so a rep can run a private
    // event without other reps in the same market seeing it.
    {
      label: 'EvEventVisibility +HOST_ONLY',
      sql: `
        DO $$ BEGIN
          ALTER TYPE "EvEventVisibility" ADD VALUE IF NOT EXISTS 'HOST_ONLY';
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      `,
    },
    {
      label: 'EvEvent.shareToken unique index',
      sql: `CREATE UNIQUE INDEX IF NOT EXISTS "EvEvent_shareToken_key" ON "EvEvent"("shareToken") WHERE "shareToken" IS NOT NULL`,
    },
    // EV-8: extend ActivityType with post-event outcomes.
    // Single DO block — Prisma's $executeRawUnsafe runs as a prepared
    // statement which forbids multiple commands separated by `;`.
    // Nested BEGIN/EXCEPTION blocks let each ALTER fail independently.
    {
      label: 'ActivityType +EVENT_ATTENDED/NO_SHOW/WALKED_IN',
      sql: `
        DO $$ BEGIN
          BEGIN
            ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'EVENT_ATTENDED';
          EXCEPTION WHEN duplicate_object THEN NULL;
          END;
          BEGIN
            ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'EVENT_NO_SHOW';
          EXCEPTION WHEN duplicate_object THEN NULL;
          END;
          BEGIN
            ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'EVENT_WALKED_IN';
          EXCEPTION WHEN duplicate_object THEN NULL;
          END;
        END $$;
      `,
    },

    // ═══════════════════════════════════════════════════════════════════
    // EVENT TRACKING TABLES — see SPEC_EVENTS.md
    // ═══════════════════════════════════════════════════════════════════

    // Enums — created via DO blocks so re-runs don't error.
    ...evEnumStatements(),

    {
      label: 'create EvEvent',
      sql: `
        CREATE TABLE IF NOT EXISTS "EvEvent" (
          "id" TEXT NOT NULL,
          "publicId" TEXT NOT NULL,
          "marketId" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          "description" TEXT,
          "venueName" TEXT,
          "venueAddress" TEXT,
          "venueLat" DOUBLE PRECISION,
          "venueLng" DOUBLE PRECISION,
          "startsAt" TIMESTAMP(3) NOT NULL,
          "endsAt" TIMESTAMP(3) NOT NULL,
          "timezone" TEXT NOT NULL,
          "status" "EvEventStatus" NOT NULL DEFAULT 'DRAFT',
          "visibility" "EvEventVisibility" NOT NULL DEFAULT 'PRIVATE',
          "defaultPlusOnesAllowed" BOOLEAN NOT NULL DEFAULT false,
          "responseWindowOverride" JSONB,
          "confirmationCascadeOverride" JSONB,
          "designId" TEXT,
          "emailSubject" TEXT,
          "smsBodyTemplate" TEXT,
          "createdBy" TEXT NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "canceledAt" TIMESTAMP(3),
          "canceledReason" TEXT,
          CONSTRAINT "EvEvent_pkey" PRIMARY KEY ("id")
        )
      `,
    },
    {
      label: 'EvEvent indexes + unique publicId',
      sql: `
        CREATE UNIQUE INDEX IF NOT EXISTS "EvEvent_publicId_key" ON "EvEvent"("publicId");
        CREATE INDEX IF NOT EXISTS "EvEvent_marketId_status_idx" ON "EvEvent"("marketId", "status");
        CREATE INDEX IF NOT EXISTS "EvEvent_startsAt_idx" ON "EvEvent"("startsAt");
        CREATE INDEX IF NOT EXISTS "EvEvent_createdBy_idx" ON "EvEvent"("createdBy");
      `,
    },
    {
      label: 'FK EvEvent.marketId → Market.id',
      sql: `
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EvEvent_marketId_fkey') THEN
            ALTER TABLE "EvEvent" ADD CONSTRAINT "EvEvent_marketId_fkey"
              FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
          END IF;
        END $$;
      `,
    },

    {
      label: 'create EvTicketType',
      sql: `
        CREATE TABLE IF NOT EXISTS "EvTicketType" (
          "id" TEXT NOT NULL,
          "eventId" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          "kind" "EvTicketKind" NOT NULL,
          "capacity" INTEGER NOT NULL,
          "isPrimary" BOOLEAN NOT NULL DEFAULT false,
          "internalAllocation" INTEGER NOT NULL DEFAULT 0,
          "description" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "EvTicketType_pkey" PRIMARY KEY ("id")
        )
      `,
    },
    {
      label: 'EvTicketType indexes',
      sql: `
        CREATE UNIQUE INDEX IF NOT EXISTS "EvTicketType_eventId_name_key" ON "EvTicketType"("eventId","name");
        CREATE INDEX IF NOT EXISTS "EvTicketType_eventId_idx" ON "EvTicketType"("eventId");
      `,
    },
    {
      label: 'FK EvTicketType.eventId → EvEvent.id',
      sql: `
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EvTicketType_eventId_fkey') THEN
            ALTER TABLE "EvTicketType" ADD CONSTRAINT "EvTicketType_eventId_fkey"
              FOREIGN KEY ("eventId") REFERENCES "EvEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
          END IF;
        END $$;
      `,
    },

    {
      label: 'create EvHost',
      sql: `
        CREATE TABLE IF NOT EXISTS "EvHost" (
          "id" TEXT NOT NULL,
          "eventId" TEXT NOT NULL,
          "userId" TEXT NOT NULL,
          "ticketTypeIds" JSONB NOT NULL DEFAULT '[]',
          "role" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "EvHost_pkey" PRIMARY KEY ("id")
        )
      `,
    },
    {
      label: 'EvHost indexes',
      sql: `
        CREATE UNIQUE INDEX IF NOT EXISTS "EvHost_eventId_userId_key" ON "EvHost"("eventId","userId");
        CREATE INDEX IF NOT EXISTS "EvHost_userId_idx" ON "EvHost"("userId");
      `,
    },
    {
      label: 'FKs on EvHost',
      sql: `
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EvHost_eventId_fkey') THEN
            ALTER TABLE "EvHost" ADD CONSTRAINT "EvHost_eventId_fkey"
              FOREIGN KEY ("eventId") REFERENCES "EvEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EvHost_userId_fkey') THEN
            ALTER TABLE "EvHost" ADD CONSTRAINT "EvHost_userId_fkey"
              FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
          END IF;
        END $$;
      `,
    },

    {
      label: 'create EvSubEvent',
      sql: `
        CREATE TABLE IF NOT EXISTS "EvSubEvent" (
          "id" TEXT NOT NULL,
          "eventId" TEXT NOT NULL,
          "kind" "EvSubEventKind" NOT NULL,
          "name" TEXT NOT NULL,
          "venueName" TEXT,
          "venueAddress" TEXT,
          "startsAt" TIMESTAMP(3) NOT NULL,
          "endsAt" TIMESTAMP(3) NOT NULL,
          "invitationScope" "EvSubEventScope" NOT NULL,
          "dependentTicketTypeId" TEXT,
          "reminderOverride" JSONB,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "EvSubEvent_pkey" PRIMARY KEY ("id")
        )
      `,
    },
    {
      label: 'EvSubEvent indexes + FKs',
      sql: `
        CREATE INDEX IF NOT EXISTS "EvSubEvent_eventId_idx" ON "EvSubEvent"("eventId");
        CREATE INDEX IF NOT EXISTS "EvSubEvent_startsAt_idx" ON "EvSubEvent"("startsAt");
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EvSubEvent_eventId_fkey') THEN
            ALTER TABLE "EvSubEvent" ADD CONSTRAINT "EvSubEvent_eventId_fkey"
              FOREIGN KEY ("eventId") REFERENCES "EvEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EvSubEvent_dependentTicketTypeId_fkey') THEN
            ALTER TABLE "EvSubEvent" ADD CONSTRAINT "EvSubEvent_dependentTicketTypeId_fkey"
              FOREIGN KEY ("dependentTicketTypeId") REFERENCES "EvTicketType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
          END IF;
        END $$;
      `,
    },

    {
      label: 'create EvInvite',
      sql: `
        CREATE TABLE IF NOT EXISTS "EvInvite" (
          "id" TEXT NOT NULL,
          "eventId" TEXT NOT NULL,
          "partnerId" TEXT,
          "contactId" TEXT,
          "adHocName" TEXT,
          "adHocEmail" TEXT,
          "adHocPhone" TEXT,
          "plusOneAllowed" BOOLEAN NOT NULL DEFAULT false,
          "plusOneName" TEXT,
          "queueOrder" INTEGER NOT NULL,
          "queueTier" "EvQueueTier" NOT NULL DEFAULT 'PRIMARY',
          "status" "EvInviteStatus" NOT NULL DEFAULT 'QUEUED',
          "sentAt" TIMESTAMP(3),
          "respondedAt" TIMESTAMP(3),
          "confirmationRequestedAt" TIMESTAMP(3),
          "confirmedAt" TIMESTAMP(3),
          "expiresAt" TIMESTAMP(3),
          "canceledAt" TIMESTAMP(3),
          "canceledReason" TEXT,
          "rsvpToken" TEXT NOT NULL,
          "lastEmailMessageId" TEXT,
          "lastSmsSid" TEXT,
          "notes" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "EvInvite_pkey" PRIMARY KEY ("id")
        )
      `,
    },
    {
      label: 'EvInvite indexes + FKs',
      sql: `
        CREATE UNIQUE INDEX IF NOT EXISTS "EvInvite_rsvpToken_key" ON "EvInvite"("rsvpToken");
        CREATE UNIQUE INDEX IF NOT EXISTS "EvInvite_eventId_partnerId_key" ON "EvInvite"("eventId","partnerId");
        CREATE INDEX IF NOT EXISTS "EvInvite_eventId_status_queueOrder_idx" ON "EvInvite"("eventId","status","queueOrder");
        CREATE INDEX IF NOT EXISTS "EvInvite_partnerId_idx" ON "EvInvite"("partnerId");
        CREATE INDEX IF NOT EXISTS "EvInvite_expiresAt_idx" ON "EvInvite"("expiresAt");
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EvInvite_eventId_fkey') THEN
            ALTER TABLE "EvInvite" ADD CONSTRAINT "EvInvite_eventId_fkey"
              FOREIGN KEY ("eventId") REFERENCES "EvEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EvInvite_partnerId_fkey') THEN
            ALTER TABLE "EvInvite" ADD CONSTRAINT "EvInvite_partnerId_fkey"
              FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
          END IF;
        END $$;
      `,
    },

    {
      label: 'create EvTicketAssignment',
      sql: `
        CREATE TABLE IF NOT EXISTS "EvTicketAssignment" (
          "id" TEXT NOT NULL,
          "inviteId" TEXT NOT NULL,
          "ticketTypeId" TEXT NOT NULL,
          "quantity" INTEGER NOT NULL DEFAULT 1,
          "status" "EvTicketStatus" NOT NULL DEFAULT 'TENTATIVE',
          "checkedInAt" TIMESTAMP(3),
          "checkedInBy" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "EvTicketAssignment_pkey" PRIMARY KEY ("id")
        )
      `,
    },
    {
      label: 'EvTicketAssignment indexes + FKs',
      sql: `
        CREATE UNIQUE INDEX IF NOT EXISTS "EvTicketAssignment_inviteId_ticketTypeId_key" ON "EvTicketAssignment"("inviteId","ticketTypeId");
        CREATE INDEX IF NOT EXISTS "EvTicketAssignment_ticketTypeId_status_idx" ON "EvTicketAssignment"("ticketTypeId","status");
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EvTicketAssignment_inviteId_fkey') THEN
            ALTER TABLE "EvTicketAssignment" ADD CONSTRAINT "EvTicketAssignment_inviteId_fkey"
              FOREIGN KEY ("inviteId") REFERENCES "EvInvite"("id") ON DELETE CASCADE ON UPDATE CASCADE;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EvTicketAssignment_ticketTypeId_fkey') THEN
            ALTER TABLE "EvTicketAssignment" ADD CONSTRAINT "EvTicketAssignment_ticketTypeId_fkey"
              FOREIGN KEY ("ticketTypeId") REFERENCES "EvTicketType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
          END IF;
        END $$;
      `,
    },

    {
      label: 'create EvRsvpEvent',
      sql: `
        CREATE TABLE IF NOT EXISTS "EvRsvpEvent" (
          "id" TEXT NOT NULL,
          "inviteId" TEXT NOT NULL,
          "kind" TEXT NOT NULL,
          "ticketDelta" JSONB,
          "actorType" TEXT NOT NULL,
          "actorId" TEXT,
          "userAgent" TEXT,
          "ipAddress" TEXT,
          "notes" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "EvRsvpEvent_pkey" PRIMARY KEY ("id")
        );
        CREATE INDEX IF NOT EXISTS "EvRsvpEvent_inviteId_createdAt_idx" ON "EvRsvpEvent"("inviteId","createdAt");
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EvRsvpEvent_inviteId_fkey') THEN
            ALTER TABLE "EvRsvpEvent" ADD CONSTRAINT "EvRsvpEvent_inviteId_fkey"
              FOREIGN KEY ("inviteId") REFERENCES "EvInvite"("id") ON DELETE CASCADE ON UPDATE CASCADE;
          END IF;
        END $$;
      `,
    },

    {
      label: 'create EvReminder',
      sql: `
        CREATE TABLE IF NOT EXISTS "EvReminder" (
          "id" TEXT NOT NULL,
          "inviteId" TEXT,
          "subEventId" TEXT,
          "eventId" TEXT NOT NULL,
          "kind" "EvReminderKind" NOT NULL,
          "channel" "EvReminderChannel" NOT NULL,
          "scheduledFor" TIMESTAMP(3) NOT NULL,
          "sentAt" TIMESTAMP(3),
          "deliveryStatus" TEXT NOT NULL DEFAULT 'pending',
          "messageId" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "EvReminder_pkey" PRIMARY KEY ("id")
        );
        CREATE INDEX IF NOT EXISTS "EvReminder_scheduledFor_sentAt_idx" ON "EvReminder"("scheduledFor","sentAt");
        CREATE INDEX IF NOT EXISTS "EvReminder_inviteId_idx" ON "EvReminder"("inviteId");
        CREATE INDEX IF NOT EXISTS "EvReminder_eventId_idx" ON "EvReminder"("eventId");
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EvReminder_eventId_fkey') THEN
            ALTER TABLE "EvReminder" ADD CONSTRAINT "EvReminder_eventId_fkey"
              FOREIGN KEY ("eventId") REFERENCES "EvEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EvReminder_inviteId_fkey') THEN
            ALTER TABLE "EvReminder" ADD CONSTRAINT "EvReminder_inviteId_fkey"
              FOREIGN KEY ("inviteId") REFERENCES "EvInvite"("id") ON DELETE CASCADE ON UPDATE CASCADE;
          END IF;
        END $$;
      `,
    },

    {
      label: 'create EvActivityLogEntry',
      sql: `
        CREATE TABLE IF NOT EXISTS "EvActivityLogEntry" (
          "id" TEXT NOT NULL,
          "eventId" TEXT NOT NULL,
          "userId" TEXT,
          "kind" TEXT NOT NULL,
          "summary" TEXT NOT NULL,
          "metadata" JSONB,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "EvActivityLogEntry_pkey" PRIMARY KEY ("id")
        );
        CREATE INDEX IF NOT EXISTS "EvActivityLogEntry_eventId_createdAt_idx" ON "EvActivityLogEntry"("eventId","createdAt");
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EvActivityLogEntry_eventId_fkey') THEN
            ALTER TABLE "EvActivityLogEntry" ADD CONSTRAINT "EvActivityLogEntry_eventId_fkey"
              FOREIGN KEY ("eventId") REFERENCES "EvEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
          END IF;
        END $$;
      `,
    },

    {
      label: 'create EvWaitlistRule',
      sql: `
        CREATE TABLE IF NOT EXISTS "EvWaitlistRule" (
          "id" TEXT NOT NULL,
          "marketId" TEXT NOT NULL,
          "active" BOOLEAN NOT NULL DEFAULT true,
          "orderingStrategy" TEXT NOT NULL DEFAULT 'priority-asc',
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "EvWaitlistRule_pkey" PRIMARY KEY ("id")
        );
        CREATE UNIQUE INDEX IF NOT EXISTS "EvWaitlistRule_marketId_key" ON "EvWaitlistRule"("marketId");
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EvWaitlistRule_marketId_fkey') THEN
            ALTER TABLE "EvWaitlistRule" ADD CONSTRAINT "EvWaitlistRule_marketId_fkey"
              FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;
          END IF;
        END $$;
      `,
    },

    // EV-6: Batch offers (freed dependent tickets; parking-pass cascade).
    {
      label: 'create EvBatchOffer',
      sql: `
        CREATE TABLE IF NOT EXISTS "EvBatchOffer" (
          "id" TEXT NOT NULL,
          "eventId" TEXT NOT NULL,
          "ticketTypeId" TEXT NOT NULL,
          "status" "EvBatchOfferStatus" NOT NULL DEFAULT 'OPEN',
          "expiresAt" TIMESTAMP(3) NOT NULL,
          "claimedByInviteId" TEXT,
          "claimedAt" TIMESTAMP(3),
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "EvBatchOffer_pkey" PRIMARY KEY ("id")
        );
        CREATE INDEX IF NOT EXISTS "EvBatchOffer_eventId_status_idx" ON "EvBatchOffer"("eventId","status");
        CREATE INDEX IF NOT EXISTS "EvBatchOffer_ticketTypeId_status_idx" ON "EvBatchOffer"("ticketTypeId","status");
        CREATE INDEX IF NOT EXISTS "EvBatchOffer_expiresAt_idx" ON "EvBatchOffer"("expiresAt");
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EvBatchOffer_eventId_fkey') THEN
            ALTER TABLE "EvBatchOffer" ADD CONSTRAINT "EvBatchOffer_eventId_fkey"
              FOREIGN KEY ("eventId") REFERENCES "EvEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EvBatchOffer_ticketTypeId_fkey') THEN
            ALTER TABLE "EvBatchOffer" ADD CONSTRAINT "EvBatchOffer_ticketTypeId_fkey"
              FOREIGN KEY ("ticketTypeId") REFERENCES "EvTicketType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
          END IF;
        END $$;
      `,
    },
    {
      label: 'create EvBatchOfferRecipient',
      sql: `
        CREATE TABLE IF NOT EXISTS "EvBatchOfferRecipient" (
          "id" TEXT NOT NULL,
          "batchOfferId" TEXT NOT NULL,
          "inviteId" TEXT NOT NULL,
          "claimToken" TEXT NOT NULL,
          "notifiedAt" TIMESTAMP(3),
          "clickedAt" TIMESTAMP(3),
          "wonRaceAt" TIMESTAMP(3),
          "lostRaceAt" TIMESTAMP(3),
          "wantsFutureOffers" BOOLEAN NOT NULL DEFAULT false,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "EvBatchOfferRecipient_pkey" PRIMARY KEY ("id")
        );
        CREATE UNIQUE INDEX IF NOT EXISTS "EvBatchOfferRecipient_claimToken_key" ON "EvBatchOfferRecipient"("claimToken");
        CREATE UNIQUE INDEX IF NOT EXISTS "EvBatchOfferRecipient_batchOfferId_inviteId_key" ON "EvBatchOfferRecipient"("batchOfferId","inviteId");
        CREATE INDEX IF NOT EXISTS "EvBatchOfferRecipient_claimToken_idx" ON "EvBatchOfferRecipient"("claimToken");
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EvBatchOfferRecipient_batchOfferId_fkey') THEN
            ALTER TABLE "EvBatchOfferRecipient" ADD CONSTRAINT "EvBatchOfferRecipient_batchOfferId_fkey"
              FOREIGN KEY ("batchOfferId") REFERENCES "EvBatchOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EvBatchOfferRecipient_inviteId_fkey') THEN
            ALTER TABLE "EvBatchOfferRecipient" ADD CONSTRAINT "EvBatchOfferRecipient_inviteId_fkey"
              FOREIGN KEY ("inviteId") REFERENCES "EvInvite"("id") ON DELETE CASCADE ON UPDATE CASCADE;
          END IF;
        END $$;
      `,
    },

    // ═══════════════════════════════════════════════════════════════════
    // MARKETING WIZARD TABLES — see SPEC_MARKETING.md
    // ═══════════════════════════════════════════════════════════════════

    ...mwEnumStatements(),

    {
      label: 'create MwWorkspace',
      sql: `
        CREATE TABLE IF NOT EXISTS "MwWorkspace" (
          "id" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          "partnerRadarMarketId" TEXT,
          "ownerUserId" TEXT NOT NULL,
          "plan" "MwPlan" NOT NULL DEFAULT 'EMBEDDED',
          "stripeCustomerId" TEXT,
          "stripeSubscriptionId" TEXT,
          "monthlyGenerationQuota" INTEGER NOT NULL DEFAULT 25,
          "monthlyGenerationsUsed" INTEGER NOT NULL DEFAULT 0,
          "quotaResetsAt" TIMESTAMP(3) NOT NULL,
          "overageRatePerGeneration" MONEY NOT NULL DEFAULT 0.79,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "MwWorkspace_pkey" PRIMARY KEY ("id")
        );
        CREATE UNIQUE INDEX IF NOT EXISTS "MwWorkspace_partnerRadarMarketId_key" ON "MwWorkspace"("partnerRadarMarketId");
        CREATE INDEX IF NOT EXISTS "MwWorkspace_stripeCustomerId_idx" ON "MwWorkspace"("stripeCustomerId");
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MwWorkspace_partnerRadarMarketId_fkey') THEN
            ALTER TABLE "MwWorkspace" ADD CONSTRAINT "MwWorkspace_partnerRadarMarketId_fkey"
              FOREIGN KEY ("partnerRadarMarketId") REFERENCES "Market"("id") ON DELETE SET NULL ON UPDATE CASCADE;
          END IF;
        END $$;
      `,
    },

    {
      label: 'create MwWorkspaceMember',
      sql: `
        CREATE TABLE IF NOT EXISTS "MwWorkspaceMember" (
          "id" TEXT NOT NULL,
          "workspaceId" TEXT NOT NULL,
          "userId" TEXT NOT NULL,
          "role" "MwWorkspaceRole" NOT NULL DEFAULT 'EDITOR',
          "invitedBy" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "MwWorkspaceMember_pkey" PRIMARY KEY ("id")
        );
        CREATE UNIQUE INDEX IF NOT EXISTS "MwWorkspaceMember_workspaceId_userId_key" ON "MwWorkspaceMember"("workspaceId","userId");
        CREATE INDEX IF NOT EXISTS "MwWorkspaceMember_userId_idx" ON "MwWorkspaceMember"("userId");
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MwWorkspaceMember_workspaceId_fkey') THEN
            ALTER TABLE "MwWorkspaceMember" ADD CONSTRAINT "MwWorkspaceMember_workspaceId_fkey"
              FOREIGN KEY ("workspaceId") REFERENCES "MwWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MwWorkspaceMember_userId_fkey') THEN
            ALTER TABLE "MwWorkspaceMember" ADD CONSTRAINT "MwWorkspaceMember_userId_fkey"
              FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
          END IF;
        END $$;
      `,
    },

    {
      label: 'create MwBrand',
      sql: `
        CREATE TABLE IF NOT EXISTS "MwBrand" (
          "id" TEXT NOT NULL,
          "workspaceId" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          "profile" JSONB NOT NULL,
          "status" "MwBrandStatus" NOT NULL DEFAULT 'TRAINING',
          "isDefault" BOOLEAN NOT NULL DEFAULT false,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "MwBrand_pkey" PRIMARY KEY ("id")
        );
        CREATE INDEX IF NOT EXISTS "MwBrand_workspaceId_idx" ON "MwBrand"("workspaceId");
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MwBrand_workspaceId_fkey') THEN
            ALTER TABLE "MwBrand" ADD CONSTRAINT "MwBrand_workspaceId_fkey"
              FOREIGN KEY ("workspaceId") REFERENCES "MwWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
          END IF;
        END $$;
      `,
    },

    {
      label: 'create MwTrainingSample',
      sql: `
        CREATE TABLE IF NOT EXISTS "MwTrainingSample" (
          "id" TEXT NOT NULL,
          "brandId" TEXT NOT NULL,
          "fileId" TEXT NOT NULL,
          "contentType" TEXT NOT NULL,
          "analysis" JSONB,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "MwTrainingSample_pkey" PRIMARY KEY ("id")
        );
        CREATE INDEX IF NOT EXISTS "MwTrainingSample_brandId_idx" ON "MwTrainingSample"("brandId");
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MwTrainingSample_brandId_fkey') THEN
            ALTER TABLE "MwTrainingSample" ADD CONSTRAINT "MwTrainingSample_brandId_fkey"
              FOREIGN KEY ("brandId") REFERENCES "MwBrand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
          END IF;
        END $$;
      `,
    },

    {
      label: 'create MwBrandAsset',
      sql: `
        CREATE TABLE IF NOT EXISTS "MwBrandAsset" (
          "id" TEXT NOT NULL,
          "brandId" TEXT NOT NULL,
          "kind" "MwBrandAssetKind" NOT NULL,
          "variant" TEXT,
          "fileId" TEXT NOT NULL,
          "metadata" JSONB,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "MwBrandAsset_pkey" PRIMARY KEY ("id")
        );
        CREATE INDEX IF NOT EXISTS "MwBrandAsset_brandId_idx" ON "MwBrandAsset"("brandId");
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MwBrandAsset_brandId_fkey') THEN
            ALTER TABLE "MwBrandAsset" ADD CONSTRAINT "MwBrandAsset_brandId_fkey"
              FOREIGN KEY ("brandId") REFERENCES "MwBrand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
          END IF;
        END $$;
      `,
    },

    {
      label: 'create MwDesign',
      sql: `
        CREATE TABLE IF NOT EXISTS "MwDesign" (
          "id" TEXT NOT NULL,
          "workspaceId" TEXT NOT NULL,
          "brandId" TEXT NOT NULL,
          "createdBy" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          "contentType" "MwContentType" NOT NULL,
          "templateId" TEXT,
          "status" "MwDesignStatus" NOT NULL DEFAULT 'DRAFT',
          "intent" JSONB NOT NULL,
          "direction" JSONB NOT NULL,
          "document" JSONB NOT NULL,
          "previewImageUrl" TEXT,
          "partnerRadarEventId" TEXT,
          "partnerRadarPartnerId" TEXT,
          "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
          "archivedAt" TIMESTAMP(3),
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "MwDesign_pkey" PRIMARY KEY ("id")
        );
        CREATE INDEX IF NOT EXISTS "MwDesign_workspaceId_status_idx" ON "MwDesign"("workspaceId","status");
        CREATE INDEX IF NOT EXISTS "MwDesign_brandId_idx" ON "MwDesign"("brandId");
        CREATE INDEX IF NOT EXISTS "MwDesign_partnerRadarEventId_idx" ON "MwDesign"("partnerRadarEventId");
        CREATE INDEX IF NOT EXISTS "MwDesign_createdBy_idx" ON "MwDesign"("createdBy");
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MwDesign_workspaceId_fkey') THEN
            ALTER TABLE "MwDesign" ADD CONSTRAINT "MwDesign_workspaceId_fkey"
              FOREIGN KEY ("workspaceId") REFERENCES "MwWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MwDesign_brandId_fkey') THEN
            ALTER TABLE "MwDesign" ADD CONSTRAINT "MwDesign_brandId_fkey"
              FOREIGN KEY ("brandId") REFERENCES "MwBrand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
          END IF;
        END $$;
      `,
    },

    {
      label: 'create MwDesignVersion',
      sql: `
        CREATE TABLE IF NOT EXISTS "MwDesignVersion" (
          "id" TEXT NOT NULL,
          "designId" TEXT NOT NULL,
          "document" JSONB NOT NULL,
          "changeLog" TEXT NOT NULL,
          "createdBy" TEXT NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "MwDesignVersion_pkey" PRIMARY KEY ("id")
        );
        CREATE INDEX IF NOT EXISTS "MwDesignVersion_designId_createdAt_idx" ON "MwDesignVersion"("designId","createdAt");
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MwDesignVersion_designId_fkey') THEN
            ALTER TABLE "MwDesignVersion" ADD CONSTRAINT "MwDesignVersion_designId_fkey"
              FOREIGN KEY ("designId") REFERENCES "MwDesign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
          END IF;
        END $$;
      `,
    },

    {
      label: 'create MwExport',
      sql: `
        CREATE TABLE IF NOT EXISTS "MwExport" (
          "id" TEXT NOT NULL,
          "designId" TEXT NOT NULL,
          "format" TEXT NOT NULL,
          "targetChannel" TEXT,
          "width" INTEGER NOT NULL,
          "height" INTEGER NOT NULL,
          "dpi" INTEGER,
          "colorMode" TEXT,
          "fileId" TEXT NOT NULL,
          "sizeBytes" INTEGER NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "MwExport_pkey" PRIMARY KEY ("id")
        );
        CREATE INDEX IF NOT EXISTS "MwExport_designId_idx" ON "MwExport"("designId");
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MwExport_designId_fkey') THEN
            ALTER TABLE "MwExport" ADD CONSTRAINT "MwExport_designId_fkey"
              FOREIGN KEY ("designId") REFERENCES "MwDesign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
          END IF;
        END $$;
      `,
    },

    {
      label: 'create MwCampaign',
      sql: `
        CREATE TABLE IF NOT EXISTS "MwCampaign" (
          "id" TEXT NOT NULL,
          "workspaceId" TEXT NOT NULL,
          "designId" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          "channelMix" JSONB NOT NULL,
          "recipients" JSONB NOT NULL,
          "status" "MwCampaignStatus" NOT NULL DEFAULT 'DRAFT',
          "scheduledFor" TIMESTAMP(3),
          "sentAt" TIMESTAMP(3),
          "stats" JSONB,
          "partnerRadarEventId" TEXT,
          "createdBy" TEXT NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "MwCampaign_pkey" PRIMARY KEY ("id")
        );
        CREATE INDEX IF NOT EXISTS "MwCampaign_workspaceId_status_idx" ON "MwCampaign"("workspaceId","status");
        CREATE INDEX IF NOT EXISTS "MwCampaign_partnerRadarEventId_idx" ON "MwCampaign"("partnerRadarEventId");
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MwCampaign_designId_fkey') THEN
            ALTER TABLE "MwCampaign" ADD CONSTRAINT "MwCampaign_designId_fkey"
              FOREIGN KEY ("designId") REFERENCES "MwDesign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
          END IF;
        END $$;
      `,
    },

    {
      label: 'create MwSocialAccount',
      sql: `
        CREATE TABLE IF NOT EXISTS "MwSocialAccount" (
          "id" TEXT NOT NULL,
          "workspaceId" TEXT NOT NULL,
          "userId" TEXT,
          "platform" "MwSocialPlatform" NOT NULL,
          "externalId" TEXT NOT NULL,
          "handle" TEXT NOT NULL,
          "displayName" TEXT,
          "avatarUrl" TEXT,
          "providerAccountRef" TEXT NOT NULL,
          "connectionStatus" TEXT NOT NULL DEFAULT 'active',
          "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "lastPostedAt" TIMESTAMP(3),
          CONSTRAINT "MwSocialAccount_pkey" PRIMARY KEY ("id")
        );
        CREATE UNIQUE INDEX IF NOT EXISTS "MwSocialAccount_workspaceId_platform_externalId_key" ON "MwSocialAccount"("workspaceId","platform","externalId");
        CREATE INDEX IF NOT EXISTS "MwSocialAccount_workspaceId_platform_idx" ON "MwSocialAccount"("workspaceId","platform");
        CREATE INDEX IF NOT EXISTS "MwSocialAccount_userId_idx" ON "MwSocialAccount"("userId");
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MwSocialAccount_workspaceId_fkey') THEN
            ALTER TABLE "MwSocialAccount" ADD CONSTRAINT "MwSocialAccount_workspaceId_fkey"
              FOREIGN KEY ("workspaceId") REFERENCES "MwWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
          END IF;
        END $$;
      `,
    },

    {
      label: 'create MwGeneration',
      sql: `
        CREATE TABLE IF NOT EXISTS "MwGeneration" (
          "id" TEXT NOT NULL,
          "workspaceId" TEXT NOT NULL,
          "designId" TEXT,
          "userId" TEXT NOT NULL,
          "model" TEXT NOT NULL,
          "kind" TEXT NOT NULL,
          "inputTokens" INTEGER,
          "outputTokens" INTEGER,
          "durationMs" INTEGER,
          "costUsd" MONEY NOT NULL,
          "status" TEXT NOT NULL,
          "errorMessage" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "MwGeneration_pkey" PRIMARY KEY ("id")
        );
        CREATE INDEX IF NOT EXISTS "MwGeneration_workspaceId_createdAt_idx" ON "MwGeneration"("workspaceId","createdAt");
        CREATE INDEX IF NOT EXISTS "MwGeneration_userId_createdAt_idx" ON "MwGeneration"("userId","createdAt");
        CREATE INDEX IF NOT EXISTS "MwGeneration_model_idx" ON "MwGeneration"("model");
      `,
    },

    {
      label: 'create MwPrintJob',
      sql: `
        CREATE TABLE IF NOT EXISTS "MwPrintJob" (
          "id" TEXT NOT NULL,
          "workspaceId" TEXT NOT NULL,
          "designId" TEXT NOT NULL,
          "userId" TEXT NOT NULL,
          "provider" TEXT NOT NULL,
          "product" TEXT NOT NULL,
          "quantity" INTEGER NOT NULL,
          "shippingAddress" JSONB NOT NULL,
          "orderCost" MONEY NOT NULL,
          "markupApplied" MONEY NOT NULL DEFAULT 0,
          "externalOrderId" TEXT,
          "status" TEXT NOT NULL,
          "trackingUrl" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "MwPrintJob_pkey" PRIMARY KEY ("id")
        );
        CREATE INDEX IF NOT EXISTS "MwPrintJob_workspaceId_status_idx" ON "MwPrintJob"("workspaceId","status");
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MwPrintJob_workspaceId_fkey') THEN
            ALTER TABLE "MwPrintJob" ADD CONSTRAINT "MwPrintJob_workspaceId_fkey"
              FOREIGN KEY ("workspaceId") REFERENCES "MwWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
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

/**
 * Auto-provision one MwWorkspace per Market in embedded mode, and enroll
 * every User in the workspace belonging to one of their markets. Safe to
 * re-run: both upserts so existing rows stay put.
 *
 * This is the magic that lets /studio work immediately on first deploy —
 * no manual setup, no "create a workspace first" nag screen.
 */
async function provisionMarketingWorkspaces(prisma: unknown) {
  const db = prisma as {
    market: { findMany: (args: unknown) => Promise<Array<{ id: string; name: string }>> };
    mwWorkspace: {
      findUnique: (args: unknown) => Promise<{ id: string; ownerUserId: string } | null>;
      create: (args: unknown) => Promise<unknown>;
    };
    user: {
      findFirst: (args: unknown) => Promise<{ id: string } | null>;
      findMany: (args: unknown) => Promise<
        Array<{
          id: string;
          role: 'REP' | 'MANAGER' | 'ADMIN';
          markets: Array<{ marketId: string }>;
        }>
      >;
    };
    mwWorkspaceMember: {
      upsert: (args: unknown) => Promise<unknown>;
    };
  };

  let markets: Array<{ id: string; name: string }> = [];
  try {
    markets = await db.market.findMany({ select: { id: true, name: true } });
  } catch {
    return; // schema not migrated yet
  }
  if (markets.length === 0) return;

  const nowPlus30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  for (const market of markets) {
    try {
      const existing = await db.mwWorkspace.findUnique({
        where: { partnerRadarMarketId: market.id },
      });
      let workspaceId = existing?.id;
      let ownerId = existing?.ownerUserId;

      if (!existing) {
        // Owner defaults to the first ADMIN; if no admin, first user in market.
        const admin = await db.user.findFirst({
          where: { role: 'ADMIN', active: true },
          select: { id: true },
          orderBy: { createdAt: 'asc' },
        });
        ownerId = admin?.id;
        if (!ownerId) {
          console.log(`[auto-migrate]   · skip workspace for ${market.name} — no admin yet`);
          continue;
        }
        const created = (await db.mwWorkspace.create({
          data: {
            name: `${market.name} Studio`,
            partnerRadarMarketId: market.id,
            ownerUserId: ownerId,
            plan: 'EMBEDDED',
            monthlyGenerationQuota: 0, // embedded = no quota
            quotaResetsAt: nowPlus30,
          },
        })) as { id: string };
        workspaceId = created.id;
        console.log(`[auto-migrate]   ✓ provisioned Mw workspace for ${market.name}`);
      }

      if (!workspaceId) continue;

      // Enroll every active user whose markets include this one.
      const usersInMarket = await db.user.findMany({
        where: { active: true, markets: { some: { marketId: market.id } } },
        select: { id: true, role: true, markets: { select: { marketId: true } } },
      });
      for (const u of usersInMarket) {
        const role = u.role === 'ADMIN' ? 'OWNER' : u.role === 'MANAGER' ? 'ADMIN' : 'EDITOR';
        await db.mwWorkspaceMember.upsert({
          where: { workspaceId_userId: { workspaceId, userId: u.id } },
          create: { workspaceId, userId: u.id, role },
          update: {}, // don't overwrite existing role — admin may have promoted
        });
      }
    } catch (err) {
      console.warn(`[auto-migrate]   ✗ workspace provision for ${market.name}`, err);
    }
  }
}

/**
 * Create every EvEnum type Postgres needs for the Ev* tables. Each call
 * is inside a DO block that checks the catalog first, so re-runs don't
 * error. Prisma normally generates these from schema.prisma on migrate;
 * we do them by hand because Kirk doesn't run prisma:push.
 */
function evEnumStatements(): Array<{ label: string; sql: string }> {
  const ENUMS: Array<{ name: string; values: string[] }> = [
    { name: 'EvEventStatus', values: ['DRAFT', 'SCHEDULED', 'LIVE', 'COMPLETED', 'CANCELED'] },
    { name: 'EvEventVisibility', values: ['PRIVATE', 'MARKET_WIDE', 'PUBLIC', 'HOST_ONLY'] },
    { name: 'EvTicketKind', values: ['PRIMARY', 'DEPENDENT'] },
    {
      name: 'EvSubEventKind',
      values: ['SETUP', 'PRE_EVENT', 'MAIN', 'DINNER', 'POST_EVENT', 'TEARDOWN', 'CUSTOM'],
    },
    {
      name: 'EvSubEventScope',
      values: ['INTERNAL_ONLY', 'ALL_CONFIRMED', 'DEPENDENT_TICKET_HOLDERS', 'CUSTOM'],
    },
    {
      name: 'EvInviteStatus',
      values: [
        'QUEUED',
        'SENT',
        'ACCEPTED',
        'DECLINED',
        'EXPIRED',
        'CONFIRMATION_REQUESTED',
        'CONFIRMED',
        'NO_SHOW',
        'CANCELED',
        'AUTO_CANCELED',
      ],
    },
    { name: 'EvQueueTier', values: ['PRIMARY', 'AUTO_FALLBACK', 'AD_HOC'] },
    { name: 'EvTicketStatus', values: ['TENTATIVE', 'CONFIRMED', 'DROPPED', 'RELEASED'] },
    {
      name: 'EvReminderKind',
      values: [
        'INITIAL_INVITE',
        'CONFIRMATION_REQUEST',
        'CONFIRMATION_NUDGE_1',
        'CONFIRMATION_NUDGE_2',
        'AUTO_CANCEL_NOTICE',
        'DAY_BEFORE',
        'ARRIVAL_DETAILS',
        'SETUP_T_MINUS_4H',
        'SETUP_T_MINUS_1H',
        'CUSTOM',
      ],
    },
    { name: 'EvReminderChannel', values: ['EMAIL', 'SMS', 'BOTH'] },
    { name: 'EvBatchOfferStatus', values: ['OPEN', 'CLAIMED', 'EXPIRED', 'CANCELED'] },
  ];
  return ENUMS.map(({ name, values }) => ({
    label: `enum ${name}`,
    sql: buildEnumDDL(name, values),
  }));
}

function mwEnumStatements(): Array<{ label: string; sql: string }> {
  const ENUMS: Array<{ name: string; values: string[] }> = [
    {
      name: 'MwPlan',
      values: ['SEEDLING', 'PRO', 'AGENCY', 'STUDIO', 'ENTERPRISE', 'TRIAL', 'EMBEDDED'],
    },
    { name: 'MwWorkspaceRole', values: ['OWNER', 'ADMIN', 'EDITOR', 'VIEWER'] },
    { name: 'MwBrandStatus', values: ['TRAINING', 'ACTIVE', 'ARCHIVED'] },
    { name: 'MwBrandAssetKind', values: ['LOGO', 'BADGE', 'CERTIFICATION', 'ICON', 'CUSTOM'] },
    { name: 'MwDesignStatus', values: ['DRAFT', 'REVIEW', 'APPROVED', 'FINAL', 'ARCHIVED'] },
    {
      name: 'MwContentType',
      values: [
        'FLYER',
        'SOCIAL_POST',
        'SOCIAL_STORY',
        'BROCHURE',
        'BUSINESS_CARD',
        'EMAIL_HEADER',
        'POSTCARD',
      ],
    },
    {
      name: 'MwCampaignStatus',
      values: ['DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'FAILED', 'CANCELED'],
    },
    {
      name: 'MwSocialPlatform',
      values: [
        'FACEBOOK',
        'INSTAGRAM',
        'LINKEDIN',
        'PINTEREST',
        'X',
        'TIKTOK',
        'YOUTUBE',
        'GOOGLE_BUSINESS',
      ],
    },
  ];
  return ENUMS.map(({ name, values }) => ({
    label: `enum ${name}`,
    sql: buildEnumDDL(name, values),
  }));
}

/**
 * Idempotent enum creation. CREATE TYPE only happens if the type is
 * missing. We don't try to ALTER TYPE ADD VALUE here — some Postgres
 * versions refuse that inside a transaction block. Adding enum values
 * to an already-created type is a one-off migration worth handling
 * separately when it happens.
 */
function buildEnumDDL(name: string, values: string[]): string {
  // `CREATE TYPE "Name"` (quoted) preserves case in pg_type.typname.
  // The guard compares case-insensitively so it matches regardless of
  // whether the type was created via this function or via a Prisma
  // migration. Before this fix we lowercased the needle but the stored
  // typname was case-preserved, so every boot ran CREATE and errored
  // with `type "Name" already exists` — harmless but log-noisy and it
  // poisoned connection state on Railway.
  const needle = name.toLowerCase();
  return `
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE LOWER(typname) = '${needle}') THEN
        CREATE TYPE "${name}" AS ENUM (${values.map((v) => `'${v}'`).join(', ')});
      END IF;
    END $$;
  `;
}
