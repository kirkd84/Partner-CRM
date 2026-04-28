'use server';

/**
 * /admin/import-partners — bring an existing partner book in from a CSV.
 *
 * Why this exists separate from /admin/state-boards:
 *   state-boards is for *prospect* lists (state licensee CSVs that go
 *   into the scraped-leads queue for review). This action is for
 *   *active* partners — Kirk's existing book from a prior CRM,
 *   spreadsheet, or Storm Cloud export — that go directly into the
 *   Partner table.
 *
 * Column aliases (case-insensitive):
 *   companyName: company, name, business, account
 *   partnerType: type, partner_type, category
 *   address    : address, street, address1
 *   city       : city, town
 *   state      : state, province
 *   zip        : zip, postal_code, zipcode, postcode
 *   phone      : phone, phone_number
 *   website    : website, url, site
 *   stage      : stage, status (mapped via STAGE_MAP)
 *   contact    : contact, contact_name, primary_contact
 *   email      : email, email_address
 *
 * Dedup: by (marketId, lower(companyName)). Re-runs of the same CSV
 * skip rows that already exist.
 *
 * Permissions: admin or manager-in-market.
 */

import { revalidatePath } from 'next/cache';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { prisma, Prisma } from '@partnerradar/db';
import { auth } from '@/auth';

const UPLOAD_DIR = '/tmp/partner-imports';
const MAX_BYTES = 50 * 1024 * 1024; // 50MB — a 100k-row CSV fits comfortably
const PARTNER_TYPES = [
  'REALTOR',
  'PROPERTY_MANAGER',
  'INSURANCE_AGENT',
  'MORTGAGE_BROKER',
  'HOME_INSPECTOR',
  'PUBLIC_ADJUSTER',
  'REAL_ESTATE_ATTORNEY',
  'HVAC',
  'PLUMBING',
  'ELECTRICAL',
  'LANDSCAPER',
  'GENERAL_CONTRACTOR',
  'RESTORATION_MITIGATION',
  'FACILITIES_MANAGER_COMMERCIAL',
  'OTHER',
] as const;
type PartnerType = (typeof PARTNER_TYPES)[number];

// Common stage labels → schema enum. Forgiving so spreadsheets with
// "active" / "Won" / "Lost" don't all get rejected.
const STAGE_MAP: Record<string, string> = {
  new: 'NEW_LEAD',
  new_lead: 'NEW_LEAD',
  prospect: 'NEW_LEAD',
  researched: 'RESEARCHED',
  contacted: 'INITIAL_CONTACT',
  initial_contact: 'INITIAL_CONTACT',
  meeting: 'MEETING_SCHEDULED',
  meeting_scheduled: 'MEETING_SCHEDULED',
  in_conversation: 'IN_CONVERSATION',
  conversation: 'IN_CONVERSATION',
  proposal: 'PROPOSAL_SENT',
  proposal_sent: 'PROPOSAL_SENT',
  active: 'ACTIVATED',
  activated: 'ACTIVATED',
  won: 'ACTIVATED',
  inactive: 'INACTIVE',
  dormant: 'INACTIVE',
  lost: 'INACTIVE',
};

export interface PartnerImportInput {
  marketId: string;
  csvBase64: string;
  filename: string;
  /** Default partnerType if the CSV doesn't have a type column. */
  defaultPartnerType?: PartnerType;
  /** If true, rows that already exist (by name+market) get their
   *  contact info refreshed; otherwise they're skipped. */
  overwriteExisting?: boolean;
}

export interface PartnerImportResult {
  total: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
  /** First few errors so the user can see what went wrong without
   *  having to scroll through Railway logs. */
  sampleErrors: string[];
}

async function assertManagerInMarket(marketId: string) {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');
  if (session.user.role !== 'ADMIN' && session.user.role !== 'MANAGER') {
    throw new Error('FORBIDDEN');
  }
  if (session.user.role === 'MANAGER') {
    const markets = session.user.markets ?? [];
    if (!markets.includes(marketId)) throw new Error('FORBIDDEN');
  }
  return session;
}

export async function importPartnersCsv(input: PartnerImportInput): Promise<PartnerImportResult> {
  const session = await assertManagerInMarket(input.marketId);

  const buf = Buffer.from(input.csvBase64, 'base64');
  if (buf.length === 0) throw new Error('Uploaded file is empty.');
  if (buf.length > MAX_BYTES) {
    throw new Error(`File too large (${(buf.length / 1024 / 1024).toFixed(1)}MB > 50MB limit).`);
  }
  // Persist a copy under /tmp for re-run / debugging. /tmp is dyno-local
  // so it disappears on redeploy — fine for an import artifact.
  await mkdir(UPLOAD_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeName = input.filename.replace(/[^a-z0-9._-]/gi, '_').slice(0, 80);
  const csvPath = join(UPLOAD_DIR, `${stamp}-${safeName}`);
  await writeFile(csvPath, buf);

  const text = buf.toString('utf8');
  const lines = text.split(/\r?\n/);
  const headerLine = lines.shift();
  if (!headerLine) throw new Error('CSV is empty.');
  const headers = splitCsvLine(headerLine).map((h) => h.trim().toLowerCase());

  const result: PartnerImportResult = {
    total: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    sampleErrors: [],
  };

  for (const raw of lines) {
    if (!raw.trim()) continue;
    const fields = splitCsvLine(raw);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (fields[i] ?? '').trim();
    });

    const companyName = pickField(row, [
      'company_name',
      'companyname',
      'company',
      'name',
      'business',
      'account',
    ]);
    if (!companyName) {
      // A blank-name row is almost always a CSV artifact (trailing
      // newline, comma row). Skip silently rather than counting as
      // an error.
      continue;
    }
    result.total++;

    try {
      const partnerType = resolvePartnerType(
        pickField(row, ['partner_type', 'partnertype', 'type', 'category']),
        input.defaultPartnerType,
      );
      const stageRaw = pickField(row, ['stage', 'status']);
      const stage = stageRaw ? (STAGE_MAP[stageRaw.toLowerCase()] ?? 'NEW_LEAD') : 'NEW_LEAD';
      const data = {
        companyName,
        partnerType,
        stage,
        address: pickField(row, ['address', 'street', 'address1', 'address_1']) || null,
        city: pickField(row, ['city', 'town']) || null,
        state: pickField(row, ['state', 'province']).toUpperCase().slice(0, 2) || null,
        zip: pickField(row, ['zip', 'postal_code', 'zipcode', 'postcode']) || null,
        phone: pickField(row, ['phone', 'phone_number', 'tel']) || null,
        website: pickField(row, ['website', 'url', 'site']) || null,
        notes: pickField(row, ['notes', 'note', 'comment', 'comments']) || null,
      };

      // Upsert by (marketId + lower(companyName)). Prisma doesn't have
      // case-insensitive unique constraints on Postgres without a
      // generated column, so we look up first then create-or-update.
      const existing = await prisma.partner.findFirst({
        where: {
          marketId: input.marketId,
          companyName: { equals: companyName, mode: 'insensitive' },
        },
        select: { id: true },
      });

      if (existing) {
        if (input.overwriteExisting) {
          await prisma.partner.update({
            where: { id: existing.id },
            data: {
              ...data,
              // Don't bump stage backwards if the import has a less-advanced
              // stage. Concretely: existing partners shouldn't lose
              // ACTIVATED status because the import CSV said "prospect".
              stage:
                STAGE_PRECEDENCE[stage] >
                (STAGE_PRECEDENCE[
                  (
                    await prisma.partner.findUnique({
                      where: { id: existing.id },
                      select: { stage: true },
                    })
                  )?.stage as string
                ] ?? 0)
                  ? (stage as never)
                  : undefined,
            },
          });
          result.updated++;
        } else {
          result.skipped++;
        }
      } else {
        // Generate a publicId on the fly — the Partner model requires it.
        // Format: `PR-<6-char-suffix>` of the cuid for human friendliness.
        const created = await prisma.partner.create({
          data: {
            ...data,
            stage: stage as never,
            partnerType: partnerType as never,
            marketId: input.marketId,
            source: 'IMPORT' as never,
            publicId: '', // filled in below
          },
          select: { id: true },
        });
        await prisma.partner.update({
          where: { id: created.id },
          data: { publicId: `PR-${created.id.slice(-6).toUpperCase()}` },
        });

        // Stash a primary contact if any contact info is present.
        const contactName = pickField(row, ['contact', 'contact_name', 'primary_contact']);
        const contactEmail = pickField(row, ['email', 'email_address', 'contact_email']);
        const contactPhone = pickField(row, ['contact_phone', 'mobile', 'cell']);
        const contactTitle = pickField(row, ['title', 'role', 'job_title']);
        if (contactName || contactEmail || contactPhone) {
          await prisma.contact.create({
            data: {
              partnerId: created.id,
              name: contactName || companyName,
              title: contactTitle || null,
              isPrimary: true,
              emails: contactEmail
                ? ([{ address: contactEmail, primary: true }] as unknown as Prisma.InputJsonValue)
                : ([] as unknown as Prisma.InputJsonValue),
              phones: contactPhone
                ? ([{ number: contactPhone, primary: true }] as unknown as Prisma.InputJsonValue)
                : ([] as unknown as Prisma.InputJsonValue),
            },
          });
        }
        result.inserted++;
      }
    } catch (err) {
      result.errors++;
      if (result.sampleErrors.length < 5) {
        result.sampleErrors.push(
          `${companyName}: ${err instanceof Error ? err.message : 'unknown error'}`,
        );
      }
    }
  }

  // Audit-log the import — bulk partner writes deserve to be tracked
  // alongside the bulk CSV exports we already log.
  try {
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'partner.import.csv',
        entityType: 'Partner',
        entityId: 'bulk',
        metadata: {
          filename: input.filename,
          marketId: input.marketId,
          csvPath,
          ...result,
        } as never,
      },
    });
  } catch (err) {
    console.error('[partner-import] audit log write failed', err);
  }

  revalidatePath('/admin/import-partners');
  revalidatePath('/partners');
  return result;
}

const STAGE_PRECEDENCE: Record<string, number> = {
  NEW_LEAD: 1,
  RESEARCHED: 2,
  INITIAL_CONTACT: 3,
  MEETING_SCHEDULED: 4,
  IN_CONVERSATION: 5,
  PROPOSAL_SENT: 6,
  ACTIVATED: 7,
  INACTIVE: 0,
};

function pickField(row: Record<string, string>, keys: string[]): string {
  for (const k of keys) {
    const v = row[k.toLowerCase()];
    if (v && v.trim()) return v.trim();
  }
  return '';
}

function resolvePartnerType(raw: string, fallback?: PartnerType): PartnerType {
  const lower = raw.toLowerCase().replace(/\s+/g, '_').replace(/-+/g, '_');
  const match = PARTNER_TYPES.find((t) => t.toLowerCase() === lower);
  if (match) return match;
  if (fallback) return fallback;
  return 'OTHER';
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else {
      if (c === ',') {
        out.push(cur);
        cur = '';
      } else if (c === '"') {
        inQuotes = true;
      } else {
        cur += c;
      }
    }
  }
  out.push(cur);
  return out;
}
