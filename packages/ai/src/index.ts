/**
 * Anthropic Claude wrapper for PartnerRadar — SPEC §6.7.
 *
 * Two entry points:
 *   • extractTone(samples) — Claude Haiku. Turns 6–10 short samples
 *     into a ToneProfile JSON that future drafts steer on.
 *   • draftMessage(args)   — Claude Sonnet. Generates a message for
 *     a specific partner + purpose, in the rep's voice.
 *
 * Both call paths check ANTHROPIC_API_KEY up front. If it's missing,
 * they throw `AIKeyMissingError` so callers can fall back to a
 * placeholder ("AI drafts light up once the Anthropic key is set")
 * without crashing the page.
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

export class AIKeyMissingError extends Error {
  constructor() {
    super('ANTHROPIC_API_KEY is not configured — AI features unavailable');
    this.name = 'AIKeyMissingError';
  }
}

export function isAIConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function client(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new AIKeyMissingError();
  return new Anthropic({ apiKey });
}

// ─── Tone extraction ───────────────────────────────────────────────
const EXTRACT_TONE_PROMPT = `You are a writing-style analyst. Given several short messages a salesperson has written to partners, extract a ToneProfile JSON with these fields:

- formality (1–10): 1 = very casual ("hey!"), 10 = formal business letter
- avgSentenceLength: estimated average words per sentence
- commonGreetings: up to 5 greetings they tend to use
- commonSignoffs: up to 5 signoffs they tend to use
- emojiRate (0–1): fraction of samples containing ≥1 emoji
- preferredLength: "short" (<80 words) | "medium" (80–180) | "long" (>180)
- quirks: up to 5 noticeable patterns — regional phrases, industry shorthand, nicknames

Return ONLY valid JSON. No prose. No markdown fences. Do not invent fields. If a sample is empty, weight remaining samples.`;

export async function extractTone(samples: string[]): Promise<ToneProfile> {
  const anthropic = client();
  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 800,
    system: EXTRACT_TONE_PROMPT,
    messages: [
      {
        role: 'user',
        content: samples
          .filter((s) => s.trim().length > 0)
          .map((s, i) => `--- Sample ${i + 1} ---\n${s}`)
          .join('\n\n'),
      },
    ],
  });
  const text = msg.content
    .map((c) => (c.type === 'text' ? c.text : ''))
    .join('')
    .trim();
  // Strip accidental code fences
  const cleaned = text.replace(/^```json\s*|^```\s*|```$/gm, '').trim();
  const parsed = JSON.parse(cleaned);
  return ToneProfile.parse(parsed);
}

// ─── Draft a partner message ───────────────────────────────────────
export type DraftPurpose =
  | 'first_outreach'
  | 'follow_up'
  | 'schedule_meeting'
  | 'post_meeting_thankyou'
  | 're_engagement'
  | 'custom';

export const PURPOSE_LABELS: Record<DraftPurpose, string> = {
  first_outreach: 'First outreach',
  follow_up: 'Follow-up',
  schedule_meeting: 'Schedule a meeting',
  post_meeting_thankyou: 'Post-meeting thank-you',
  re_engagement: 'Re-engagement',
  custom: 'Custom',
};

const PURPOSE_GUIDANCE: Record<DraftPurpose, string> = {
  first_outreach:
    'Warm, curious, low-pressure introduction. Reference one specific thing about the partner company. Ask a single open question to start a conversation.',
  follow_up:
    'Reference the previous touchpoint explicitly. Add one piece of new value (an insight, a relevant story, a next step). Clear ask, zero guilt.',
  schedule_meeting:
    "Propose a meeting. Offer 2–3 concrete time slots in the rep's time zone. Keep it short — longer is not kinder.",
  post_meeting_thankyou:
    'Thank them for their time. Summarise one takeaway that landed. Confirm the next step and who owns it.',
  re_engagement:
    'Warm re-entry after a gap. Do NOT apologise for the gap. Bring something useful and invite a low-commitment next step.',
  custom: "Follow the rep's context notes closely. Keep voice consistent with the tone profile.",
};

export interface DraftArgs {
  channel: 'email' | 'sms';
  purpose: DraftPurpose;
  contextNotes?: string;
  partner: {
    companyName: string;
    partnerType: string;
    marketName?: string;
    notes?: string | null;
    recentActivity?: string[]; // last 3-5 summarised activities
  };
  rep: {
    name: string;
    firstName: string;
  };
  tone: ToneProfile | null;
}

export interface DraftResult {
  subject?: string;
  body: string;
  model: string;
}

export async function draftMessage(args: DraftArgs): Promise<DraftResult> {
  const anthropic = client();

  const sys = buildSystemPrompt(args);
  const user = buildUserPrompt(args);

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 800,
    system: sys,
    messages: [{ role: 'user', content: user }],
  });
  const raw = msg.content
    .map((c) => (c.type === 'text' ? c.text : ''))
    .join('')
    .trim();

  if (args.channel === 'email') {
    const { subject, body } = splitEmail(raw);
    return { subject, body, model: 'claude-sonnet-4-6' };
  }
  return { body: raw, model: 'claude-sonnet-4-6' };
}

function buildSystemPrompt(args: DraftArgs): string {
  const tone =
    args.tone ??
    ({
      formality: 5,
      avgSentenceLength: 14,
      commonGreetings: ['Hi {name}'],
      commonSignoffs: ['Thanks'],
      emojiRate: 0.1,
      preferredLength: 'short',
      quirks: [],
    } satisfies ToneProfile);

  const compliance =
    args.channel === 'email'
      ? 'EMAIL: always include a short signoff. Do NOT mention regulations explicitly. Keep under 180 words.'
      : 'SMS: keep under 300 characters. No subject line. Never send between 9pm and 8am local time. No emojis unless the tone profile has emojiRate >= 0.3.';

  return [
    `You are writing on behalf of ${args.rep.firstName} — a roofing-industry business development rep — to a partner contact.`,
    `Your ONE job: write in ${args.rep.firstName}'s voice, not a generic sales AI voice.`,
    ``,
    `TONE PROFILE:`,
    `- Formality ${tone.formality}/10`,
    `- Preferred length: ${tone.preferredLength}`,
    `- Greetings they use: ${tone.commonGreetings.join(', ') || '(none learned)'}`,
    `- Signoffs they use: ${tone.commonSignoffs.join(', ') || '(none learned)'}`,
    `- Emoji rate: ${tone.emojiRate}`,
    tone.quirks.length ? `- Quirks: ${tone.quirks.join('; ')}` : '',
    ``,
    `PURPOSE: ${PURPOSE_LABELS[args.purpose]}`,
    `GUIDANCE: ${PURPOSE_GUIDANCE[args.purpose]}`,
    ``,
    `CHANNEL: ${args.channel.toUpperCase()}. ${compliance}`,
    ``,
    args.channel === 'email'
      ? `OUTPUT FORMAT: first line is "Subject: <subject>", then a blank line, then the body. No markdown, no quoted greetings.`
      : `OUTPUT FORMAT: body only, no subject, no preamble.`,
  ]
    .filter(Boolean)
    .join('\n');
}

function buildUserPrompt(args: DraftArgs): string {
  const parts: string[] = [];
  parts.push(`Partner: ${args.partner.companyName} (${args.partner.partnerType})`);
  if (args.partner.marketName) parts.push(`Market: ${args.partner.marketName}`);
  if (args.partner.notes) parts.push(`Notes: ${args.partner.notes}`);
  if (args.partner.recentActivity?.length) {
    parts.push(`Recent touchpoints:\n- ${args.partner.recentActivity.join('\n- ')}`);
  }
  if (args.contextNotes) parts.push(`Rep's note for this draft: ${args.contextNotes}`);
  parts.push(`\nWrite the ${args.channel === 'email' ? 'email' : 'SMS'} now.`);
  return parts.join('\n\n');
}

function splitEmail(raw: string): { subject: string; body: string } {
  const lines = raw.split('\n');
  const subjectLine = lines.find((l) => /^subject\s*:/i.test(l));
  if (!subjectLine) return { subject: '(no subject)', body: raw };
  const subject = subjectLine.replace(/^subject\s*:\s*/i, '').trim();
  const body = lines
    .slice(lines.indexOf(subjectLine) + 1)
    .join('\n')
    .replace(/^\s+/, '')
    .trim();
  return { subject, body };
}

// ─── Fallback "draft" for when the API key isn't set. ──────────────
// Kirk can still see the drawer shape + copy flow before wiring the
// Anthropic key. Obviously-placeholder so nobody accidentally sends.
export function placeholderDraft(args: DraftArgs): DraftResult {
  const subject =
    args.channel === 'email'
      ? `[placeholder] ${PURPOSE_LABELS[args.purpose]} — ${args.partner.companyName}`
      : undefined;
  const body = [
    `Hi {{contact.firstName}} —`,
    '',
    `[This is a placeholder draft. Real AI drafts light up when an ANTHROPIC_API_KEY is set in Railway.]`,
    '',
    `Purpose: ${PURPOSE_LABELS[args.purpose]}`,
    `Partner: ${args.partner.companyName}`,
    args.contextNotes ? `Your note: ${args.contextNotes}` : '',
    '',
    `— ${args.rep.firstName}`,
  ]
    .filter(Boolean)
    .join('\n');
  return { subject, body, model: 'placeholder' };
}
