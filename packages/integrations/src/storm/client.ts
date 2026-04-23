import type { StormCloudClient } from './types';
import { MockStormCloudClient } from './mock';

// Real client skeleton. Phase 5 fills this in once Kirk has API docs.
class RealStormCloudClient implements StormCloudClient {
  // TODO(phase5): endpoint URLs, auth header shape, idempotency keys,
  // retry w/ exponential backoff (3 attempts), circuit breaker (opens after
  // 5 consecutive failures for 60s), rate limit 10 req/sec.
  constructor(private readonly baseUrl: string, private readonly apiKey: string) {}

  createReferralPartner(): never {
    throw new Error(
      'RealStormCloudClient not implemented yet — set STORM_API_MODE=mock or fill the skeleton (SPEC §6.5)',
    );
  }
  getAttributedRevenue(): never {
    throw new Error('not implemented');
  }
  getAppointments(): never {
    throw new Error('not implemented');
  }
  getUser(): never {
    throw new Error('not implemented');
  }
  async testConnection(): Promise<{ ok: boolean; message: string }> {
    return {
      ok: false,
      message: `Real Storm client pending — baseUrl=${this.baseUrl ? 'set' : 'missing'}, apiKey=${
        this.apiKey ? 'set' : 'missing'
      }`,
    };
  }
}

let singleton: StormCloudClient | null = null;

export function stormClient(): StormCloudClient {
  if (singleton) return singleton;
  const mode = process.env.STORM_API_MODE ?? 'mock';
  if (mode === 'real') {
    const url = process.env.STORM_API_URL ?? '';
    const key = process.env.STORM_API_KEY ?? '';
    if (!url || !key) {
      throw new Error('STORM_API_MODE=real but STORM_API_URL / STORM_API_KEY missing');
    }
    singleton = new RealStormCloudClient(url, key);
  } else {
    singleton = new MockStormCloudClient();
  }
  return singleton;
}
