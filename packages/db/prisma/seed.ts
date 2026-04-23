/**
 * PartnerRadar seed script
 * Run: pnpm db:seed
 *
 * Creates the demo dataset described in SPEC §6.1 kickoff:
 *   - 3 users: rep@demo.com, manager@demo.com, admin@demo.com  (pw: Demo1234!)
 *   - 2 markets seeded from tenant config (Denver + Colorado Springs for Roof Tech)
 *   - 10 partners across various stages
 *   - Sample activities so the Radar feed has content on first load
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { tenant } from '@partnerradar/config';

const prisma = new PrismaClient();

const AVATAR_COLORS = [
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#eab308',
  '#84cc16',
  '#10b981',
  '#14b8a6',
  '#06b6d4',
  '#3b82f6',
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
] as const;

function pickColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]!;
}

async function main() {
  const t = tenant();
  console.log(`\n🌱 Seeding PartnerRadar for tenant: ${t.legalName}\n`);

  // ── Markets ────────────────────────────────────────────────
  console.log('Markets…');
  const markets = await Promise.all(
    t.seedMarkets.map((m) =>
      prisma.market.upsert({
        where: { id: `seed-${m.name.toLowerCase().replace(/[^a-z]/g, '-')}` },
        update: {},
        create: {
          id: `seed-${m.name.toLowerCase().replace(/[^a-z]/g, '-')}`,
          name: m.name,
          timezone: m.timezone,
          defaultCenter: m.defaultCenter,
          scrapeRadius: m.scrapeRadiusMi,
          physicalAddress: t.physicalAddress,
        },
      }),
    ),
  );
  const [denver, coSprings] = markets;
  if (!denver || !coSprings) throw new Error('Seed markets missing');

  // ── Users ──────────────────────────────────────────────────
  console.log('Users…');
  const pw = await bcrypt.hash('Demo1234!', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@demo.com' },
    update: {},
    create: {
      email: 'admin@demo.com',
      passwordHash: pw,
      name: 'Kirk McCoy',
      role: 'ADMIN',
      avatarColor: pickColor('admin@demo.com'),
      homeAddress: '4955 Miller St. Suite 202, Wheat Ridge, CO 80033',
      officeAddress: '4955 Miller St. Suite 202, Wheat Ridge, CO 80033',
    },
  });
  const manager = await prisma.user.upsert({
    where: { email: 'manager@demo.com' },
    update: {},
    create: {
      email: 'manager@demo.com',
      passwordHash: pw,
      name: 'Morgan Mercer',
      role: 'MANAGER',
      avatarColor: pickColor('manager@demo.com'),
      officeAddress: '4955 Miller St. Suite 202, Wheat Ridge, CO 80033',
    },
  });
  const rep = await prisma.user.upsert({
    where: { email: 'rep@demo.com' },
    update: {},
    create: {
      email: 'rep@demo.com',
      passwordHash: pw,
      name: 'Riley Ramirez',
      role: 'REP',
      avatarColor: pickColor('rep@demo.com'),
      officeAddress: '4955 Miller St. Suite 202, Wheat Ridge, CO 80033',
    },
  });

  // Market assignments — all in Denver primary, admin also in CO Springs
  await prisma.userMarket.createMany({
    data: [
      { userId: admin.id, marketId: denver.id, isPrimary: true },
      { userId: admin.id, marketId: coSprings.id, isPrimary: false },
      { userId: manager.id, marketId: denver.id, isPrimary: true },
      { userId: rep.id, marketId: denver.id, isPrimary: true },
    ],
    skipDuplicates: true,
  });

  // ── Partners ───────────────────────────────────────────────
  console.log('Partners…');
  const partnerSeeds: Array<{
    publicId: string;
    companyName: string;
    partnerType: ParamValue<'partnerType'>;
    stage: ParamValue<'stage'>;
    address: string;
    city: string;
    state: string;
    zip: string;
    lat: number;
    lng: number;
    website?: string;
    notes?: string;
    assigned: 'rep' | 'manager' | 'unassigned';
    contact: { name: string; title: string; phone: string; email: string };
  }> = [
    {
      publicId: 'PR-1001',
      companyName: 'Summit Realty Group',
      partnerType: 'REALTOR',
      stage: 'NEW_LEAD',
      address: '1234 Wadsworth Blvd',
      city: 'Wheat Ridge',
      state: 'CO',
      zip: '80033',
      lat: 39.7698,
      lng: -105.0811,
      website: 'https://summitrealty.example.com',
      assigned: 'rep',
      contact: {
        name: 'Jenna Callahan',
        title: 'Broker',
        phone: '+17203330001',
        email: 'jenna@summitrealty.example.com',
      },
    },
    {
      publicId: 'PR-1002',
      companyName: 'Rob Mathes — State Farm',
      partnerType: 'INSURANCE_AGENT',
      stage: 'RESEARCHED',
      address: '7890 W 38th Ave',
      city: 'Wheat Ridge',
      state: 'CO',
      zip: '80033',
      lat: 39.7689,
      lng: -105.0835,
      notes: 'Big book of claims business — worth the drive.',
      assigned: 'rep',
      contact: {
        name: 'Rob Mathes',
        title: 'Agent',
        phone: '+17203330002',
        email: 'rob@robmathes.example.com',
      },
    },
    {
      publicId: 'PR-1003',
      companyName: 'Front Range Property Management',
      partnerType: 'PROPERTY_MANAGER',
      stage: 'INITIAL_CONTACT',
      address: '5678 Kipling St',
      city: 'Arvada',
      state: 'CO',
      zip: '80002',
      lat: 39.7918,
      lng: -105.1061,
      assigned: 'rep',
      contact: {
        name: 'Priya Santos',
        title: 'Portfolio Manager',
        phone: '+17203330003',
        email: 'priya@frpm.example.com',
      },
    },
    {
      publicId: 'PR-1004',
      companyName: 'Denver Inspect Pros',
      partnerType: 'HOME_INSPECTOR',
      stage: 'MEETING_SCHEDULED',
      address: '2010 S Wadsworth Blvd',
      city: 'Lakewood',
      state: 'CO',
      zip: '80227',
      lat: 39.67,
      lng: -105.0801,
      assigned: 'rep',
      contact: {
        name: 'Kyle Styer',
        title: 'Owner',
        phone: '+17203330004',
        email: 'kyle@denverinspect.example.com',
      },
    },
    {
      publicId: 'PR-1005',
      companyName: 'Evergreen Mortgage Co.',
      partnerType: 'MORTGAGE_BROKER',
      stage: 'IN_CONVERSATION',
      address: '8001 W Alameda Ave',
      city: 'Lakewood',
      state: 'CO',
      zip: '80226',
      lat: 39.7105,
      lng: -105.0854,
      notes: 'Promising — owner grew up in Wheat Ridge.',
      assigned: 'rep',
      contact: {
        name: 'Maya Pham',
        title: 'Senior Broker',
        phone: '+17203330005',
        email: 'maya@evergreen-mtg.example.com',
      },
    },
    {
      publicId: 'PR-1006',
      companyName: 'Colorado Public Adjusters LLC',
      partnerType: 'PUBLIC_ADJUSTER',
      stage: 'PROPOSAL_SENT',
      address: '100 Auraria Pkwy',
      city: 'Denver',
      state: 'CO',
      zip: '80204',
      lat: 39.7405,
      lng: -105.0071,
      assigned: 'manager',
      contact: {
        name: 'Daniel Oduya',
        title: 'Principal Adjuster',
        phone: '+17203330006',
        email: 'daniel@copubadjust.example.com',
      },
    },
    {
      publicId: 'PR-1007',
      companyName: 'Mile High HVAC',
      partnerType: 'HVAC',
      stage: 'ACTIVATED',
      address: '4100 Brighton Blvd',
      city: 'Denver',
      state: 'CO',
      zip: '80216',
      lat: 39.7768,
      lng: -104.9705,
      notes: 'Referred 3 storm claims last month.',
      assigned: 'rep',
      contact: {
        name: 'Harper Lin',
        title: 'Ops Manager',
        phone: '+17203330007',
        email: 'harper@milehighhvac.example.com',
      },
    },
    {
      publicId: 'PR-1008',
      companyName: 'Peak View Realty',
      partnerType: 'REALTOR',
      stage: 'NEW_LEAD',
      address: '201 N Tejon St',
      city: 'Colorado Springs',
      state: 'CO',
      zip: '80903',
      lat: 38.8423,
      lng: -104.8194,
      assigned: 'unassigned',
      contact: {
        name: 'Sam Wentz',
        title: 'Team Lead',
        phone: '+17193330008',
        email: 'sam@peakviewre.example.com',
      },
    },
    {
      publicId: 'PR-1009',
      companyName: 'Broadmoor Property Group',
      partnerType: 'PROPERTY_MANAGER',
      stage: 'RESEARCHED',
      address: '1 Lake Ave',
      city: 'Colorado Springs',
      state: 'CO',
      zip: '80906',
      lat: 38.789,
      lng: -104.8462,
      assigned: 'unassigned',
      contact: {
        name: 'Alex Carver',
        title: 'Director of Operations',
        phone: '+17193330009',
        email: 'alex@broadmoorpg.example.com',
      },
    },
    {
      publicId: 'PR-1010',
      companyName: 'Rocky Mountain Restoration Partners',
      partnerType: 'RESTORATION_MITIGATION',
      stage: 'INACTIVE',
      address: '5500 N Washington St',
      city: 'Denver',
      state: 'CO',
      zip: '80216',
      lat: 39.7881,
      lng: -104.9779,
      notes: 'Paused — they started an in-house roofing crew.',
      assigned: 'manager',
      contact: {
        name: 'Jordan Reeves',
        title: 'GM',
        phone: '+17203330010',
        email: 'jordan@rmrp.example.com',
      },
    },
  ];

  for (const s of partnerSeeds) {
    const assignedRepId =
      s.assigned === 'rep' ? rep.id : s.assigned === 'manager' ? manager.id : null;
    const marketId = s.state === 'CO' && s.city === 'Colorado Springs' ? coSprings.id : denver.id;
    const created = await prisma.partner.upsert({
      where: { publicId: s.publicId },
      update: {},
      create: {
        publicId: s.publicId,
        companyName: s.companyName,
        partnerType: s.partnerType,
        stage: s.stage,
        address: s.address,
        city: s.city,
        state: s.state,
        zip: s.zip,
        lat: s.lat,
        lng: s.lng,
        website: s.website,
        notes: s.notes,
        marketId,
        assignedRepId,
        activatedAt: s.stage === 'ACTIVATED' ? new Date() : null,
        activatedBy: s.stage === 'ACTIVATED' ? manager.id : null,
        stormCloudId: s.stage === 'ACTIVATED' ? `mock-sc-${s.publicId}` : null,
      },
    });

    await prisma.contact.upsert({
      where: { id: `seed-contact-${s.publicId}` },
      update: {},
      create: {
        id: `seed-contact-${s.publicId}`,
        partnerId: created.id,
        name: s.contact.name,
        title: s.contact.title,
        phones: [{ number: s.contact.phone, label: 'work', primary: true }],
        emails: [{ address: s.contact.email, label: 'work', primary: true }],
        isPrimary: true,
      },
    });
  }

  // ── Activities ────────────────────────────────────────────
  console.log('Activities…');
  const partners = await prisma.partner.findMany({ where: { assignedRepId: rep.id } });
  for (const p of partners.slice(0, 5)) {
    await prisma.activity.create({
      data: {
        partnerId: p.id,
        userId: rep.id,
        type: 'COMMENT',
        body: `First pass — ${p.companyName} looks like a solid fit for ${tenant().services.join(' + ')}.`,
      },
    });
  }
  const activated = await prisma.partner.findFirst({ where: { stage: 'ACTIVATED' } });
  if (activated) {
    await prisma.activity.create({
      data: {
        partnerId: activated.id,
        userId: manager.id,
        type: 'ACTIVATION',
        body: 'Activated and pushed to Storm Cloud. 🎉',
      },
    });
  }

  // ── Default budget rule ───────────────────────────────────
  await prisma.budgetRule.upsert({
    where: { id: 'seed-default-budget' },
    update: {},
    create: {
      id: 'seed-default-budget',
      autoApproveUnder: 25,
      managerApproveUnder: 100,
      monthlyBudgetPercentOfRevenue: 0.05,
    },
  });

  // ── Feature flags ─────────────────────────────────────────
  await prisma.featureFlag.createMany({
    data: [
      {
        key: 'ai_autonomous_sending',
        description: 'Gate for Phase 7 autonomous AI sends',
        enabled: false,
      },
      { key: 'scrape_jobs_enabled', description: 'Gate for Phase 8 scraping', enabled: false },
      {
        key: 'hit_list_enabled',
        description: 'Gate for Phase 9 route optimization',
        enabled: true,
      },
    ],
    skipDuplicates: true,
  });

  // ─── Appointment types (Storm-parity catalog) ───────────────────
  // Pulled from Kirk's Storm screenshot; these are the 14 types his
  // reps already know. Reminder timings are sensible defaults; Phase 7
  // honors them via Resend/push. Admins can tweak per-type in the UI.
  await prisma.appointmentType.createMany({
    data: [
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
    ],
    skipDuplicates: true,
  });

  console.log('\n✅ Seed complete. Log in at /login with:');
  console.log('   rep@demo.com · manager@demo.com · admin@demo.com (pw: Demo1234!)\n');
}

// Helper to ease Prisma enum narrowing in the seed array (no 'any' needed).
type ParamValue<K extends keyof Parameters<PrismaClient['partner']['create']>[0]['data']> =
  Parameters<PrismaClient['partner']['create']>[0]['data'][K];

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
