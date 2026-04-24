/**
 * Resilience wrapper for the Storm Cloud adapter.
 *
 * SPEC §6.5 requires:
 *   • retry with exponential backoff (3 attempts, 250ms base)
 *   • circuit breaker (opens after 5 consecutive failures for 60s)
 *   • rate limit (configurable, default 10 req/s)
 *   • idempotency keys on POST-ish methods
 *
 * Instead of baking these into the Real client we wrap any
 * StormCloudClient implementation so the Mock also gets the same
 * behaviour under load — which means dev/staging surfaces the same
 * failure modes production will.
 */
import type {
  CreatePartnerPayload,
  ExternalAppointment,
  PartnerStats,
  RevenueAttribution,
  StormCloudClient,
  StormProject,
} from './types';

export interface ResilienceOptions {
  /** max retry attempts per call, including the first (default 3) */
  maxAttempts?: number;
  /** base backoff in ms — doubled each retry (default 250) */
  baseBackoffMs?: number;
  /** circuit opens after this many consecutive failures (default 5) */
  breakerThreshold?: number;
  /** how long the circuit stays open before half-opening (default 60_000) */
  breakerCooldownMs?: number;
  /** sustained req/s ceiling across ALL methods (default 10) */
  rateLimitPerSec?: number;
}

const DEFAULTS: Required<ResilienceOptions> = {
  maxAttempts: 3,
  baseBackoffMs: 250,
  breakerThreshold: 5,
  breakerCooldownMs: 60_000,
  rateLimitPerSec: 10,
};

type CircuitState = 'closed' | 'open' | 'half-open';

class CircuitBreaker {
  private state: CircuitState = 'closed';
  private consecutiveFailures = 0;
  private openedAt = 0;
  constructor(
    private readonly threshold: number,
    private readonly cooldownMs: number,
  ) {}

  /** Throws if the circuit is open and still within the cooldown window. */
  guard(): void {
    if (this.state === 'open') {
      if (Date.now() - this.openedAt >= this.cooldownMs) {
        this.state = 'half-open';
      } else {
        throw new Error(
          `Storm circuit breaker open — cooling down for ${Math.max(
            0,
            this.cooldownMs - (Date.now() - this.openedAt),
          )}ms`,
        );
      }
    }
  }

  onSuccess(): void {
    this.consecutiveFailures = 0;
    this.state = 'closed';
  }

  onFailure(): void {
    this.consecutiveFailures += 1;
    if (this.state === 'half-open' || this.consecutiveFailures >= this.threshold) {
      this.state = 'open';
      this.openedAt = Date.now();
    }
  }

  snapshot(): { state: CircuitState; consecutiveFailures: number; openedAt: number } {
    return {
      state: this.state,
      consecutiveFailures: this.consecutiveFailures,
      openedAt: this.openedAt,
    };
  }
}

/**
 * Tiny fixed-window rate limiter. Drops into `await limiter.take()`
 * before issuing a call; if the window is saturated, sleeps until the
 * next window tick and tries again.
 */
class RateLimiter {
  private windowStart = Date.now();
  private count = 0;
  constructor(private readonly perSec: number) {}

  async take(): Promise<void> {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const now = Date.now();
      if (now - this.windowStart >= 1000) {
        this.windowStart = now;
        this.count = 0;
      }
      if (this.count < this.perSec) {
        this.count += 1;
        return;
      }
      const wait = 1000 - (now - this.windowStart);
      await new Promise((r) => setTimeout(r, Math.max(5, wait)));
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Deterministic idempotency key — same payload ⇒ same key. */
function idempotencyKey(method: string, payload: unknown): string {
  const s = `${method}:${JSON.stringify(payload)}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return `pr-${Math.abs(h).toString(36)}`;
}

export class ResilientStormClient implements StormCloudClient {
  private readonly opts: Required<ResilienceOptions>;
  private readonly breaker: CircuitBreaker;
  private readonly limiter: RateLimiter;

  constructor(
    private readonly inner: StormCloudClient,
    opts: ResilienceOptions = {},
  ) {
    this.opts = { ...DEFAULTS, ...opts };
    this.breaker = new CircuitBreaker(this.opts.breakerThreshold, this.opts.breakerCooldownMs);
    this.limiter = new RateLimiter(this.opts.rateLimitPerSec);
  }

  async createReferralPartner(payload: CreatePartnerPayload): Promise<{ stormCloudId: string }> {
    // Idempotency key is logged so a retry of a partially-completed POST
    // can be detected and deduplicated on the Storm side once the Real
    // client forwards it as an `Idempotency-Key` header.
    const key = idempotencyKey('createReferralPartner', payload);
    this.lastIdempotencyKey = key;
    return this.invoke('createReferralPartner', () => this.inner.createReferralPartner(payload));
  }

  /** Returns the idempotency key used for the most recent POST. */
  getLastIdempotencyKey(): string | null {
    return this.lastIdempotencyKey;
  }

  private lastIdempotencyKey: string | null = null;

  getAttributedRevenue(stormCloudId: string, since: Date): Promise<RevenueAttribution[]> {
    return this.invoke('getAttributedRevenue', () =>
      this.inner.getAttributedRevenue(stormCloudId, since),
    );
  }

  getAppointments(stormCloudId: string): Promise<ExternalAppointment[]> {
    return this.invoke('getAppointments', () => this.inner.getAppointments(stormCloudId));
  }

  listProjects(stormCloudId: string): Promise<StormProject[]> {
    return this.invoke('listProjects', () => this.inner.listProjects(stormCloudId));
  }

  getPartnerStats(stormCloudId: string): Promise<PartnerStats> {
    return this.invoke('getPartnerStats', () => this.inner.getPartnerStats(stormCloudId));
  }

  getUser(email: string): Promise<{ stormCloudUserId: string } | null> {
    return this.invoke('getUser', () => this.inner.getUser(email));
  }

  testConnection(): Promise<{ ok: boolean; message: string }> {
    return this.invoke('testConnection', () => this.inner.testConnection());
  }

  /** Read-only view for the Admin > Integrations page. */
  getDiagnostics() {
    return {
      breaker: this.breaker.snapshot(),
      rateLimitPerSec: this.opts.rateLimitPerSec,
      maxAttempts: this.opts.maxAttempts,
    };
  }

  private async invoke<T>(label: string, fn: () => Promise<T>): Promise<T> {
    this.breaker.guard();
    await this.limiter.take();

    let lastErr: unknown;
    for (let attempt = 1; attempt <= this.opts.maxAttempts; attempt += 1) {
      try {
        const result = await fn();
        this.breaker.onSuccess();
        return result;
      } catch (err) {
        lastErr = err;
        const isLast = attempt >= this.opts.maxAttempts;
        if (isLast) {
          this.breaker.onFailure();
          break;
        }
        // Exponential backoff with a small jitter to de-sync clients.
        const delay =
          this.opts.baseBackoffMs * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 60);
        console.warn(
          `[storm:${label}] attempt ${attempt} failed, retrying in ${delay}ms`,
          err instanceof Error ? err.message : err,
        );
        await sleep(delay);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(`Storm.${label} failed`);
  }
}
