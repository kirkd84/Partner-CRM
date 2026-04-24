/**
 * Layer 1: Intent capture. Convert a raw user prompt into a DesignIntent
 * the director can reason about. Falls back to a deterministic keyword
 * parser when no Anthropic key is available — this is what lets MW-3
 * ship end-to-end even before Kirk plugs in his Anthropic key.
 */

import type { DesignIntent } from '../index';
import { routeIntentParse } from '../models/router';

const CONTENT_TYPE_KEYWORDS: Array<[RegExp, DesignIntent['contentType']]> = [
  [/\b(flyer|flier|hand[- ]?out|leaflet)\b/i, 'FLYER'],
  [/\b(post|instagram|facebook|linkedin|social)\b/i, 'SOCIAL_POST'],
  [/\b(brochure|tri[- ]?fold)\b/i, 'BROCHURE'],
  [/\b(business\s+card|b\.?c\.?)\b/i, 'BUSINESS_CARD'],
  [/\b(email\s+header|newsletter\s+header)\b/i, 'EMAIL_HEADER'],
];

const TONE_KEYWORDS: Array<[RegExp, NonNullable<DesignIntent['tone']>]> = [
  [/\b(urgent|now|same[- ]day|emergency|breaking|limited)\b/i, 'urgent'],
  [/\b(warm|friendly|welcoming|personal)\b/i, 'warm'],
  [/\b(formal|official|professional|corporate)\b/i, 'formal'],
  [/\b(celebrate|launch|anniversary|milestone|grand\s+opening)\b/i, 'celebratory'],
];

export async function parseIntent(prompt: string): Promise<DesignIntent> {
  const route = routeIntentParse();
  if (route.provider === 'anthropic') {
    try {
      return await parseViaAnthropic(prompt, route.model);
    } catch (err) {
      console.warn('[intent-parse] LLM failed, falling back to rules', err);
    }
  }
  return parseViaRules(prompt);
}

export function parseViaRules(prompt: string): DesignIntent {
  const contentType = CONTENT_TYPE_KEYWORDS.find(([rx]) => rx.test(prompt))?.[1] ?? 'FLYER';
  const tone = TONE_KEYWORDS.find(([rx]) => rx.test(prompt))?.[1];
  const audienceMatch = prompt.match(
    /\b(for|targeting|to)\s+([a-z][a-z'\- ]{3,48}?)(?:[,.;]|\s+(?:showing|emphasi[sz]ing|about|with)|\s*$)/i,
  );
  const audience = audienceMatch?.[2]?.trim();

  return {
    contentType,
    purpose: prompt.trim().slice(0, 500),
    ...(tone ? { tone } : {}),
    ...(audience ? { audience } : {}),
  };
}

async function parseViaAnthropic(prompt: string, model: string): Promise<DesignIntent> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('no_key');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 400,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Extract a DesignIntent from this marketing prompt. Return ONLY JSON with shape:
{"contentType":"FLYER"|"SOCIAL_POST"|"BROCHURE"|"BUSINESS_CARD"|"EMAIL_HEADER","purpose":"short phrase","tone":"warm"|"formal"|"urgent"|"celebratory"|null,"audience":"who it's for or null"}

Prompt: ${prompt}`,
            },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}`);
  const data = (await res.json()) as { content?: Array<{ text?: string }> };
  const text = data.content?.[0]?.text ?? '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('no_json');
  const parsed = JSON.parse(jsonMatch[0]) as Partial<DesignIntent> & { audience?: string };
  return {
    contentType: (parsed.contentType as DesignIntent['contentType']) ?? 'FLYER',
    purpose: parsed.purpose ?? prompt.slice(0, 500),
    ...(parsed.tone ? { tone: parsed.tone } : {}),
    ...(parsed.audience ? { audience: parsed.audience } : {}),
  };
}
