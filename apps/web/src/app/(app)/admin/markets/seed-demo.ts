'use server';

/**
 * Demo-data seeder — admin-only. Inserts a batch of realistic-looking
 * partners into a chosen market so event rosters, hit lists, and the
 * map have something to chew on during a preview run.
 *
 * Safety:
 * - Every generated partner gets `source: SCRAPED` + a publicId prefix
 *   of `DEMO-` so they're trivially filterable when Kirk wants to
 *   nuke the seed set.
 * - Names are deterministic from a seeded RNG so re-running won't
 *   explode the DB with duplicates — unique-on-companyName isn't in
 *   the schema, but the seeder checks for existing demo rows and
 *   skips them.
 * - Partners are scattered around the market's `defaultCenter` inside
 *   a ~15-mile radius with a tiny contact block so {{firstName}} merges
 *   have something to bind to.
 */

import { revalidatePath } from 'next/cache';
import { prisma, Prisma } from '@partnerradar/db';
import { auth } from '@/auth';

const PARTNER_TYPES = [
  'REALTOR',
  'INSURANCE_AGENT',
  'MORTGAGE_BROKER',
  'PROPERTY_MANAGER',
  'HOME_INSPECTOR',
  'PUBLIC_ADJUSTER',
  'REAL_ESTATE_ATTORNEY',
  'HVAC',
  'PLUMBING',
  'GENERAL_CONTRACTOR',
  'RESTORATION_MITIGATION',
  'FACILITIES_MANAGER_COMMERCIAL',
] as const;

const STAGES = [
  'NEW_LEAD',
  'NEW_LEAD',
  'NEW_LEAD',
  'RESEARCHED',
  'INITIAL_CONTACT',
  'MEETING_SCHEDULED',
  'IN_CONVERSATION',
] as const;

// Company-name templates by partner type. Mixed to feel like a real
// market — no "LoremCo" placeholders.
const COMPANY_PATTERNS: Partial<Record<(typeof PARTNER_TYPES)[number], string[]>> = {
  REALTOR: [
    '{place} Realty Group',
    '{adj} {place} Realty',
    '{place} & Co. Real Estate',
    'The {place} Home Team',
    '{place} Properties',
  ],
  INSURANCE_AGENT: [
    '{place} Insurance Agency',
    '{adj} Shield Insurance',
    '{place} Risk Partners',
    'Summit {place} Insurance',
  ],
  MORTGAGE_BROKER: ['{place} Mortgage Co.', '{adj} Home Loans', '{place} Lending Group'],
  PROPERTY_MANAGER: [
    '{place} Property Management',
    '{adj} Residential Management',
    '{place} PM Services',
  ],
  HOME_INSPECTOR: ['{place} Home Inspections', '{adj} Inspection Co.'],
  PUBLIC_ADJUSTER: ['{place} Public Adjusters', '{adj} Claims Advocates'],
  REAL_ESTATE_ATTORNEY: ['{place} Real Estate Law', '{adj} & Associates'],
  HVAC: ['{place} Heating & Air', '{adj} Mechanical'],
  PLUMBING: ['{place} Plumbing Co.', '{adj} Pipe Works'],
  GENERAL_CONTRACTOR: ['{place} Builders', '{adj} Construction Group'],
  RESTORATION_MITIGATION: ['{place} Restoration', '{adj} Water & Fire'],
  FACILITIES_MANAGER_COMMERCIAL: ['{place} Facilities Group', '{adj} Commercial Services'],
};

const PLACE_NAMES = [
  'Aspen',
  'Ridgeline',
  'Cherry Creek',
  'Summit',
  'Highlands',
  'Sloan',
  'Capitol Hill',
  'LoHi',
  'RiNo',
  'Washington Park',
  'Stapleton',
  'Belmar',
  'Sunnyside',
  'Five Points',
  'Uptown',
  'Lakewood',
  'Golden',
  'Arvada',
  'Thornton',
  'Parker',
  'Centennial',
  'Englewood',
  'Littleton',
  'Broomfield',
  'Westminster',
];
const ADJECTIVES = [
  'Blue',
  'Pinnacle',
  'Mountain',
  'Evergreen',
  'Frontier',
  'Keystone',
  'Copper',
  'Granite',
  'Silverline',
  'Anvil',
  'Sagebrush',
  'Timber',
];

const FIRST_NAMES = [
  'Sarah',
  'Michael',
  'Jessica',
  'David',
  'Ashley',
  'Chris',
  'Amanda',
  'Ryan',
  'Melissa',
  'Kevin',
  'Stephanie',
  'Brandon',
  'Nicole',
  'Jason',
  'Rachel',
  'Andrew',
  'Jennifer',
  'Patrick',
  'Lauren',
  'Matthew',
  'Maria',
  'Daniel',
  'Samantha',
  'Gabriel',
];
const LAST_NAMES = [
  'Jenkins',
  'Torres',
  'Nguyen',
  'Okafor',
  'Patel',
  'Morales',
  'Kowalski',
  'Chen',
  'Brown',
  'Rivera',
  'Thompson',
  'Nakamura',
  'Fischer',
  'Singh',
  'Adams',
  'Reyes',
  'Walker',
  'McIntyre',
  'Bhatia',
  'Kennedy',
];
const STREET_NAMES = [
  'Pine',
  'Cedar',
  'Main',
  'Broadway',
  'Colfax',
  'Speer',
  'Alameda',
  'Hampden',
  'Leetsdale',
  'Yale',
  'Evans',
  'Mississippi',
  'Arapahoe',
  '6th',
  '17th',
  'Stout',
  'Market',
  'Wynkoop',
];
const STREET_TYPES = ['St', 'Ave', 'Blvd', 'Pkwy', 'Dr'];

const DEFAULT_CITIES = [
  { city: 'Denver', state: 'CO', zip: '80202' },
  { city: 'Lakewood', state: 'CO', zip: '80226' },
  { city: 'Aurora', state: 'CO', zip: '80012' },
  { city: 'Centennial', state: 'CO', zip: '80112' },
  { city: 'Arvada', state: 'CO', zip: '80003' },
  { city: 'Littleton', state: 'CO', zip: '80123' },
  { city: 'Thornton', state: 'CO', zip: '80229' },
  { city: 'Parker', state: 'CO', zip: '80134' },
];

/** Tiny deterministic PRNG so re-running with the same seed produces the same batch. */
function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SeedDemoInput {
  marketId: string;
  count?: number;
  seed?: number;
}

export interface SeedDemoResult {
  inserted: number;
  skipped: number;
  marketName: string;
}

export async function seedDemoPartners(input: SeedDemoInput): Promise<SeedDemoResult> {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');
  if (session.user.role !== 'ADMIN') throw new Error('FORBIDDEN');

  const market = await prisma.market.findUnique({ where: { id: input.marketId } });
  if (!market) throw new Error('NOT_FOUND');

  const center = market.defaultCenter as { lat?: number; lng?: number } | null;
  const centerLat = center?.lat ?? 39.7392;
  const centerLng = center?.lng ?? -104.9903;

  const count = Math.max(1, Math.min(200, input.count ?? 50));
  const rng = mulberry32(input.seed ?? 20260424);
  const now = new Date();

  let inserted = 0;
  let skipped = 0;

  for (let i = 0; i < count; i++) {
    const partnerType = PARTNER_TYPES[Math.floor(rng() * PARTNER_TYPES.length)]!;
    const place = PLACE_NAMES[Math.floor(rng() * PLACE_NAMES.length)]!;
    const adj = ADJECTIVES[Math.floor(rng() * ADJECTIVES.length)]!;
    const patterns = COMPANY_PATTERNS[partnerType] ?? COMPANY_PATTERNS.REALTOR!;
    const pattern = patterns[Math.floor(rng() * patterns.length)]!;
    const companyName = pattern.replace('{place}', place).replace('{adj}', adj);

    const first = FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)]!;
    const last = LAST_NAMES[Math.floor(rng() * LAST_NAMES.length)]!;
    const contactName = `${first} ${last}`;

    // Scatter partners up to ~15 miles around the market center.
    // 1° lat ≈ 69 mi; 1° lng ≈ 54 mi at 40°N. Good enough for demo.
    const dLat = (rng() * 2 - 1) * (15 / 69);
    const dLng = (rng() * 2 - 1) * (15 / 54);
    const lat = centerLat + dLat;
    const lng = centerLng + dLng;

    const streetNum = Math.floor(rng() * 9000) + 1000;
    const streetName = STREET_NAMES[Math.floor(rng() * STREET_NAMES.length)]!;
    const streetType = STREET_TYPES[Math.floor(rng() * STREET_TYPES.length)]!;
    const cityRow = DEFAULT_CITIES[Math.floor(rng() * DEFAULT_CITIES.length)]!;
    const address = `${streetNum} ${streetName} ${streetType}`;

    const phone = `720-${300 + Math.floor(rng() * 700)}-${1000 + Math.floor(rng() * 9000)}`;
    const email = `${first.toLowerCase()}.${last.toLowerCase()}@${place
      .toLowerCase()
      .replace(/\s+/g, '')}-${partnerType.toLowerCase().split('_')[0]}.example`;

    // De-dupe on companyName + marketId — cheap and avoids runaway bloat
    // if Kirk clicks the button a few times.
    const existing = await prisma.partner.findFirst({
      where: { companyName, marketId: market.id },
      select: { id: true },
    });
    if (existing) {
      skipped++;
      continue;
    }

    const publicId = `DEMO-${(now.getTime().toString(36) + i.toString(36)).toUpperCase().slice(-8)}`;
    const stage = STAGES[Math.floor(rng() * STAGES.length)]!;

    try {
      await prisma.partner.create({
        data: {
          publicId,
          marketId: market.id,
          companyName,
          partnerType: partnerType as never,
          address,
          city: cityRow.city,
          state: cityRow.state,
          zip: cityRow.zip,
          lat,
          lng,
          stage: stage as never,
          source: 'SCRAPED',
          sourceDetails: {
            provider: 'demo-seeder',
            seed: input.seed ?? 20260424,
            note: 'Generated by admin seeder for preview/testing.',
          } as Prisma.InputJsonValue,
          notes: `Demo partner seeded ${now.toISOString().slice(0, 10)} for preview.`,
          contacts: {
            create: {
              name: contactName,
              title:
                partnerType === 'REALTOR'
                  ? 'Realtor'
                  : partnerType === 'INSURANCE_AGENT'
                    ? 'Agent'
                    : partnerType === 'MORTGAGE_BROKER'
                      ? 'Loan Officer'
                      : partnerType === 'PROPERTY_MANAGER'
                        ? 'Property Manager'
                        : partnerType === 'PUBLIC_ADJUSTER'
                          ? 'Public Adjuster'
                          : 'Contact',
              phones: [{ number: phone, label: 'mobile', primary: true }] as Prisma.InputJsonValue,
              emails: [
                { address: email, label: 'work', primary: true, unsubscribedAt: null },
              ] as Prisma.InputJsonValue,
              isPrimary: true,
              smsConsent: false,
              emailConsent: true,
            },
          },
        },
      });
      inserted++;
    } catch (err) {
      console.warn('[seed-demo] insert failed', {
        companyName,
        err: err instanceof Error ? err.message : err,
      });
      skipped++;
    }
  }

  revalidatePath('/partners');
  revalidatePath('/admin/markets');
  revalidatePath('/radar');
  return { inserted, skipped, marketName: market.name };
}
