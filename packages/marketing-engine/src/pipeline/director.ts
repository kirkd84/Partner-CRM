/**
 * Layer 2: Creative direction. Given a DesignIntent + BrandProfile +
 * available templates, pick one and produce slot copy. Runs through
 * Claude Opus/Sonnet when an Anthropic key is present, falls back to a
 * deterministic rule-based composer when it isn't.
 *
 * The rule-based path produces honest, brand-correct copy — not award
 * winning, but good enough to demo the full pipeline and to be a safety
 * net when the LLM leg errors.
 */

import {
  listTemplatesByContentType,
  type TemplateModule,
  type ContentType,
  type SlotValues,
} from '@partnerradar/marketing-templates';
import type { BrandProfile } from '../brand/types';
import type { CreativeDirection, DesignIntent } from '../index';
import { routeDirector } from '../models/router';

export interface DirectorOutput {
  template: TemplateModule;
  direction: CreativeDirection;
  slotValues: SlotValues;
}

export async function direct(input: {
  intent: DesignIntent;
  brand: BrandProfile;
  tier?: 'premium' | 'standard' | 'draft';
}): Promise<DirectorOutput> {
  const { intent, brand } = input;
  const contentType = intent.contentType as ContentType;
  const candidates = listTemplatesByContentType(contentType);
  if (candidates.length === 0) {
    throw new Error(`No templates registered for contentType=${contentType}`);
  }

  const route = routeDirector(input.tier ?? 'standard');
  if (route.provider === 'anthropic') {
    try {
      return await directViaAnthropic(candidates, intent, brand, route.model);
    } catch (err) {
      console.warn('[director] LLM failed, falling back to rules', err);
    }
  }
  return directViaRules(candidates, intent, brand);
}

export function directViaRules(
  candidates: TemplateModule[],
  intent: DesignIntent,
  brand: BrandProfile,
): DirectorOutput {
  // Pull mood hints from both the explicit tone AND the prompt body so
  // picking is grounded in what the user actually wrote, not just the
  // tone classifier. We pick the candidate with the highest overlap.
  const moodHints = [...toneToMoodTags(intent.tone), ...keywordMoodTags(intent.purpose)];
  const scored = candidates
    .map((t) => ({
      template: t,
      score: t.manifest.moodTags.reduce((acc, tag) => acc + (moodHints.includes(tag) ? 1 : 0), 0),
    }))
    .sort((a, b) => b.score - a.score);
  const template = scored[0]?.score && scored[0].score > 0 ? scored[0].template : candidates[0]!;

  const copy = composeCopy(intent, brand);

  const direction: CreativeDirection = {
    templateKey: template.manifest.catalogKey,
    copy,
    colorStrategy:
      intent.tone === 'urgent'
        ? 'primary-hero'
        : intent.tone === 'formal'
          ? 'mono-elegant'
          : 'secondary-accent',
    imageStrategy: template.manifest.contentType === 'FLYER' ? 'full-bleed' : 'none',
    reasoning: `Rule-based pick: contentType=${intent.contentType}${
      intent.tone ? `, tone=${intent.tone}` : ''
    }. Matched template "${template.manifest.name}" on mood tags ${moodHints.join(', ') || '(default)'}.`,
  };

  const slotValues: SlotValues = { text: {}, image: {} };
  if (template.manifest.slots.some((s) => s.key === 'headline'))
    slotValues.text.headline = copy.headline;
  if (template.manifest.slots.some((s) => s.key === 'subhead') && copy.subhead)
    slotValues.text.subhead = copy.subhead;
  if (template.manifest.slots.some((s) => s.key === 'body') && copy.body)
    slotValues.text.body = copy.body;
  if (template.manifest.slots.some((s) => s.key === 'cta') && copy.cta)
    slotValues.text.cta = copy.cta;
  if (template.manifest.slots.some((s) => s.key === 'eyebrow') && copy.eyebrow)
    slotValues.text.eyebrow = copy.eyebrow;
  if (template.manifest.slots.some((s) => s.key === 'quote')) slotValues.text.quote = copy.headline;
  if (template.manifest.slots.some((s) => s.key === 'attribution') && copy.attribution)
    slotValues.text.attribution = copy.attribution;
  if (template.manifest.slots.some((s) => s.key === 'name')) slotValues.text.name = copy.headline;
  if (template.manifest.slots.some((s) => s.key === 'title') && copy.subhead)
    slotValues.text.title = copy.subhead;

  return { template, direction, slotValues };
}

function toneToMoodTags(tone: DesignIntent['tone']): string[] {
  switch (tone) {
    case 'urgent':
      return ['urgent', 'offer', 'announcement'];
    case 'celebratory':
      return ['celebration', 'announcement', 'social'];
    case 'formal':
      return ['elegant', 'minimal', 'professional'];
    case 'warm':
      return ['testimonial', 'trust', 'professional'];
    default:
      return ['professional'];
  }
}

/**
 * Pull broad mood/category hints from the raw prompt. Conservative —
 * only matches obvious keywords, otherwise the director falls back to
 * the tone-derived tags or the first candidate.
 */
function keywordMoodTags(purpose: string): string[] {
  const out: string[] = [];
  const p = purpose.toLowerCase();
  if (/\bbefore\b.*\bafter\b|transformation|repair|restore|renovat/.test(p))
    out.push('transformation', 'showcase', 'results');
  if (/testimonial|review|quote|client said|five[- ]star/.test(p))
    out.push('testimonial', 'trust', 'quote');
  if (/event|invite|invitation|suite|party|gala|dinner/.test(p))
    out.push('event', 'invite', 'announcement');
  if (/team|crew|staff|meet the|behind the scenes|day in the life/.test(p))
    out.push('team', 'lifestyle', 'authentic');
  if (/portfolio|project|showcase|recent work|gallery|grid/.test(p))
    out.push('showcase', 'gallery', 'portfolio');
  if (/special|sale|offer|promo|discount|limited/.test(p))
    out.push('offer', 'announcement', 'urgent');
  if (/24[- ]hour|same[- ]day|emergency|now|immediate/.test(p)) out.push('urgent', 'announcement');
  if (/celebrate|anniversary|milestone|launch|grand opening/.test(p))
    out.push('celebration', 'announcement', 'social');
  if (/professional|trust|reliable|dependable/.test(p)) out.push('professional', 'trust');
  return out;
}

function composeCopy(intent: DesignIntent, brand: BrandProfile) {
  const company = brand.companyName;
  const p = intent.purpose.trim();
  const audience = intent.audience?.trim();
  const tone = intent.tone ?? null;

  // Try to extract a clean short phrase from the prompt.
  const shortPurpose = p.split(/[.!?]/)[0]?.trim() || p;

  // Headline: turn purpose into a marketing sentence.
  let headline = shortPurpose;
  if (tone === 'urgent') headline = capitalize(stripLead(shortPurpose));
  else if (tone === 'celebratory') headline = capitalize(stripLead(shortPurpose));
  else headline = capitalize(stripLead(shortPurpose));
  if (headline.length > 72) headline = headline.slice(0, 70) + '…';

  const subhead = audience
    ? `For ${audience}.${brand.tagline ? ' ' + brand.tagline : ''}`
    : (brand.tagline ?? '');

  const body = `${company} · ${brand.industry ?? 'Trusted local service'}${
    audience ? ' · Built for ' + audience : ''
  }.`;

  const cta =
    tone === 'urgent'
      ? 'Call today'
      : tone === 'celebratory'
        ? 'Join us'
        : brand.contact.phone
          ? 'Give us a call'
          : 'Learn more';

  const eyebrow = tone === 'urgent' ? 'Same-day' : tone === 'celebratory' ? 'New' : 'Featured';

  return {
    headline,
    subhead: subhead || undefined,
    body,
    cta,
    eyebrow,
    attribution: audience ? `Our ${audience} team` : company,
  };
}

function stripLead(s: string): string {
  return s.replace(/^(a|an|the|my|our|your|for|to|about|make|create|design)\s+/i, '').trim();
}

function capitalize(s: string): string {
  return s.length ? s[0]!.toUpperCase() + s.slice(1) : s;
}

async function directViaAnthropic(
  candidates: TemplateModule[],
  intent: DesignIntent,
  brand: BrandProfile,
  model: string,
): Promise<DirectorOutput> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('no_key');

  const templatesManifest = candidates.map((t) => ({
    key: t.manifest.catalogKey,
    name: t.manifest.name,
    description: t.manifest.description,
    moodTags: t.manifest.moodTags,
    slots: t.manifest.slots.map((s) => ({ key: s.key, label: s.label, required: s.required })),
  }));

  const sys = `You are an art director. Pick exactly one template and produce concise, on-brand copy that fits each slot's purpose. Company: ${brand.companyName}${
    brand.tagline ? ` — ${brand.tagline}` : ''
  }. Brand tone descriptors: ${brand.voice.descriptors.join(', ') || 'professional, trustworthy'}. Return ONLY JSON.`;

  const user = `Design intent: ${JSON.stringify(intent)}
Available templates: ${JSON.stringify(templatesManifest, null, 2)}

Return JSON:
{
  "templateKey": "<catalogKey>",
  "reasoning": "why this template",
  "slots": { "<slotKey>": "<copy>" , ... }
}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 800,
      system: sys,
      messages: [{ role: 'user', content: [{ type: 'text', text: user }] }],
    }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}`);
  const data = (await res.json()) as { content?: Array<{ text?: string }> };
  const raw = data.content?.[0]?.text ?? '';
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('no_json');
  const parsed = JSON.parse(jsonMatch[0]) as {
    templateKey: string;
    reasoning?: string;
    slots: Record<string, string>;
  };
  const template =
    candidates.find((t) => t.manifest.catalogKey === parsed.templateKey) ?? candidates[0]!;
  const slotValues: SlotValues = { text: {}, image: {} };
  for (const [k, v] of Object.entries(parsed.slots ?? {})) {
    if (typeof v === 'string') slotValues.text[k] = v;
  }
  const direction: CreativeDirection = {
    templateKey: template.manifest.catalogKey,
    copy: {
      headline: slotValues.text.headline ?? slotValues.text.name ?? slotValues.text.quote ?? '',
      subhead: slotValues.text.subhead ?? slotValues.text.title ?? undefined,
      body: slotValues.text.body ?? undefined,
      cta: slotValues.text.cta ?? undefined,
    },
    colorStrategy: 'primary-hero',
    imageStrategy: template.manifest.contentType === 'FLYER' ? 'full-bleed' : 'none',
    reasoning: parsed.reasoning ?? `Anthropic ${model}`,
  };
  return { template, direction, slotValues };
}
