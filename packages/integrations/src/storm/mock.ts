import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  CreatePartnerPayload,
  ExternalAppointment,
  RevenueAttribution,
  StormCloudClient,
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
  async createReferralPartner(
    payload: CreatePartnerPayload,
  ): Promise<{ stormCloudId: string }> {
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

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    return { ok: true, message: 'Mock client — data persisted to dev-data/storm-mock.json' };
  }
}
