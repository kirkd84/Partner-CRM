/**
 * Anthropic Claude wrapper for PartnerRadar.
 * Phase 7 fills these out:
 *   - extractTone(samples): Haiku call — returns ToneProfile JSON
 *   - draftMessage(purpose, partner, tone): Sonnet call — returns message
 */
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

export const ToneProfile = z.object({
  formality: z.number().min(1).max(10),
  avgSentenceLength: z.number().positive(),
  commonGreetings: z.array(z.string()).max(10),
  commonSignoffs: z.array(z.string()).max(10),
  emojiRate: z.number().min(0).max(1),
  preferredLength: z.enum(['short', 'medium', 'long']),
  quirks: z.array(z.string()).max(10),
});
export type ToneProfile = z.infer<typeof ToneProfile>;

export function anthropic(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY missing');
  return new Anthropic({ apiKey });
}

// Phase 7: stub signatures so apps can type-check their future call sites.
export async function extractTone(_samples: string[]): Promise<ToneProfile> {
  throw new Error('extractTone lands in Phase 7');
}
