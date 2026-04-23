import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  CreatePartnerPayload,
  ExternalAppointment,
  PartnerStats,
  RevenueAttribution,
  StormCloudClient,
  StormProject,
} from './types';

const MOCK_PATH = path.resolve(process.cwd(), 'dev-data/storm-mock.json');

interface MockStore {
  partners: Array<{
    stormCloudId: string;
    payload: CreatePartnerPayload;
    createdAt: string;
  }>;
  revenue: Record<string, RevenueAttribution[]>;
  appointments: Record<string, ExternalAppointment[]>;
}

async function load(): Promise<MockStore> {
  try {
    const raw = await fs.readFile(MOCK_PATH, 'utf-8');
    return JSON.parse(raw) as MockStore;
  } catch {
    return { partners: [], revenue: {}, appointments: {} };
  }
}

async function save(store: MockStore): Promise<void> {
  await fs.mkdir(path.dirname(MOCK_PATH), { recursive: true });
  await fs.writeFile(MOCK_PATH, JSON.stringify(store, null, 2));
}

/** Mock Storm Cloud client — persists to `dev-data/storm-mock.json` across runs. */
export class MockStormCloudClient implements StormCloudClient {
  async createReferralPartner(payload: CreatePartnerPayload): Promise<{ stormCloudId: string }> {
    const store = await load();
    const stormCloudId = `mock-sc-${payload.externalId}`;
    store.partners.push({ stormCloudId, payload, createdAt: new Date().toISOString() });
    await save(store);
    return { stormCloudId };
  }

  async getAttributedRevenue(stormCloudId: string): Promise<RevenueAttribution[]> {
    const store = await load();
    return store.revenue[stormCloudId] ?? [];
  }

  async getAppointments(stormCloudId: string): Promise<ExternalAppointment[]> {
    const store = await load();
    return store.appointments[stormCloudId] ?? [];
  }

  async getUser(_email: string): Promise<{ stormCloudUserId: string } | null> {
    return null; // Phase 5: SSO lookup
  }

  async listProjects(stormCloudId: string): Promise<StormProject[]> {
    return generateMockProjects(stormCloudId);
  }

  async getPartnerStats(stormCloudId: string): Promise<PartnerStats> {
    return generateMockStats(stormCloudId);
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    return { ok: true, message: 'Mock client — data persisted to dev-data/storm-mock.json' };
  }
}

// ─── Deterministic mock generators ───────────────────────────────────
// Seeded by stormCloudId so every demo load shows the same plausible data.

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function seedRng(seed: number) {
  let s = seed || 1;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

const FIRST = [
  'Gilbert',
  'Maria',
  'Dale',
  'Priya',
  'Marcus',
  'Teresa',
  'Jamal',
  'Sofia',
  'Ethan',
  'Nalani',
  'Bobby',
  'Carmen',
];
const LAST = [
  'Wanklyn',
  'Hernandez',
  'Flores',
  'Okafor',
  'Bennett',
  'Lipe',
  'Kowalski',
  'Reyes',
  'Chen',
  'Murphy',
  'Thornton',
  'Vaughn',
];
const STREETS = [
  'Clarhan Rd',
  'Windrow Lane',
  'Aspen Grove',
  'Pinecrest Dr',
  'Evergreen Way',
  'Mesa Ridge',
  'Summit Blvd',
];
const CITIES = [
  ['Topeka', 'KS', 'Topeka, KS'],
  ['Lafayette', 'CO', 'Denver, CO'],
  ['Denver', 'CO', 'Denver, CO'],
  ['Westminster', 'CO', 'Denver, CO'],
  ['Arvada', 'CO', 'Denver, CO'],
  ['Castle Rock', 'CO', 'Denver, CO'],
  ['Colorado Springs', 'CO', 'Colorado Springs, CO'],
];
const STATUSES = [
  'Lead',
  'Inspected',
  'Contract',
  'Install Scheduled',
  'Installed',
  'Supplement',
  'Reinspect',
];
const SALES_REPS = ['Kirk McCoy', 'Phil Crismore', 'Josiah Cupit', 'Riley Ramirez', 'Sam Darby'];
const SUPPLEMENTERS = [null, null, 'Phil Crismore', 'Josiah Cupit', null];

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

function generateMockProjects(stormCloudId: string): StormProject[] {
  const seed = hashCode(stormCloudId);
  const rng = seedRng(seed);
  // 0–6 projects based on the hash — older partners should trend higher
  const count = Math.floor(rng() * 7);
  const projects: StormProject[] = [];
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    const first = pick(rng, FIRST);
    const last = pick(rng, LAST);
    const street = `${Math.floor(rng() * 9000) + 1000} ${pick(rng, STREETS)}`;
    const cityTuple = pick(rng, CITIES);
    const revenue = Math.round((rng() * 45000 + 4000) * 100) / 100;
    const insuranceTotal = Math.round(revenue * (0.85 + rng() * 0.25) * 100) / 100;
    const expenses = Math.round(revenue * (0.25 + rng() * 0.35) * 100) / 100;
    const arOutstanding = rng() < 0.6 ? 0 : Math.round(rng() * revenue * 100) / 100;
    const status = pick(rng, STATUSES);
    const daysAgoTouched = Math.floor(rng() * 45);
    const installDaysOffset =
      status === 'Installed' ? -Math.floor(rng() * 120) : Math.floor(rng() * 60);
    const installDate =
      status === 'Lead' || status === 'Inspected'
        ? null
        : new Date(now + installDaysOffset * 86400_000).toISOString();

    projects.push({
      id: `P${1100 + Math.floor(rng() * 900)}`,
      name: `${first} ${last}`,
      primaryContact: `${first} ${last}`,
      address: street,
      city: cityTuple[0]!,
      state: cityTuple[1]!,
      market: cityTuple[2]!,
      arOutstanding,
      status,
      lastTouchedAt: new Date(now - daysAgoTouched * 86400_000).toISOString(),
      installDate,
      salesReps: [pick(rng, SALES_REPS)],
      revenue,
      expenses,
      insuranceTotal,
      timeInStatus: formatDuration(Math.floor(rng() * 90) + 1),
      supplementer: pick(rng, SUPPLEMENTERS),
    });
  }

  return projects;
}

function formatDuration(days: number): string {
  if (days < 7) return `${days} day${days === 1 ? '' : 's'}`;
  if (days < 30) {
    const w = Math.floor(days / 7);
    return `${w} week${w === 1 ? '' : 's'}`;
  }
  const m = Math.floor(days / 30);
  return `${m} month${m === 1 ? '' : 's'}`;
}

function generateMockStats(stormCloudId: string): PartnerStats {
  const seed = hashCode(stormCloudId);
  const rng = seedRng(seed);

  // Lifetime anchors the rest — bigger for "older" partners via hash variance
  const lifetimeProjects = Math.floor(rng() * 40) + 3;
  const lifetimeRevenue = lifetimeProjects * (12000 + rng() * 18000);

  const lastYearProjects = Math.floor(lifetimeProjects * (0.15 + rng() * 0.35));
  const lastYearRevenue = lastYearProjects * (10000 + rng() * 15000);

  const ytdProjects = Math.floor(lifetimeProjects * (0.1 + rng() * 0.25));
  const ytdRevenue = ytdProjects * (11000 + rng() * 16000);

  const mtdProjects = Math.max(0, Math.floor(ytdProjects * (0.05 + rng() * 0.3)));
  const mtdRevenue = mtdProjects * (11000 + rng() * 14000);

  return {
    mtd: { revenue: round2(mtdRevenue), projects: mtdProjects },
    ytd: { revenue: round2(ytdRevenue), projects: ytdProjects },
    lastYear: { revenue: round2(lastYearRevenue), projects: lastYearProjects },
    lifetime: { revenue: round2(lifetimeRevenue), projects: lifetimeProjects },
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
