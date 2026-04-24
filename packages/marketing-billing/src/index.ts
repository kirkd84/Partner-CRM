/**
 * @partnerradar/marketing-billing
 *
 * Stripe integration for standalone mode. In embedded mode this
 * package is a no-op — embedded workspaces have plan=EMBEDDED and
 * no quota, so there's nothing to meter.
 *
 * Standalone activation (MW-13) wires:
 *   • subscription creation (Stripe Checkout → webhook → plan flip)
 *   • metered overage billing (monthly usage record from MwGeneration.costUsd)
 *   • Stripe customer portal for self-serve upgrades/cancellations
 *   • Tax handling via Stripe Tax
 *   • Webhook receiver at /api/webhooks/stripe
 */

export const BILLING_MODE = process.env.MARKETING_MODE === 'standalone' ? 'stripe' : 'noop';

export function isBillingEnabled(): boolean {
  return BILLING_MODE === 'stripe';
}

/**
 * Embedded no-op; MW-13 swaps in real Stripe checks when
 * MARKETING_MODE=standalone.
 */
export async function ensureQuotaAvailable(_args: {
  workspaceId: string;
  amount?: number;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  return { ok: true };
}
