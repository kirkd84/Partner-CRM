/**
 * POST /api/scan/extract — business card OCR + structured extraction.
 *
 * Body: multipart/form-data with a single field 'image' (jpeg/png/webp).
 * Response: 200 { ok: true, extraction } | 4xx { error }
 *
 * Permissions: any authenticated user. Reps scan cards in the field;
 * we don't gate to manager+ because the resulting Partner row goes
 * through the same review/dedupe flow as a manual creation.
 *
 * AI: hands the bytes to packages/ai's extractBusinessCard via
 * Claude Vision (Sonnet). If ANTHROPIC_API_KEY isn't set we return
 * 503 so the UI can show a "set the AI key first" message.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { extractBusinessCard, isAIConfigured } from '@partnerradar/ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB — generous for phone photos
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
  if (!isAIConfigured()) {
    return NextResponse.json(
      {
        error:
          'ANTHROPIC_API_KEY is not configured. Set it on Railway → Variables and redeploy to enable card scanning.',
      },
      { status: 503 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid multipart body' }, { status: 400 });
  }
  const file = form.get('image');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'image field missing' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `Image too large (${Math.round(file.size / 1024 / 1024)} MB) — max 8 MB.` },
      { status: 413 },
    );
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: `Unsupported type ${file.type}. Use JPEG, PNG, WebP, or GIF.` },
      { status: 415 },
    );
  }

  // Read into a buffer + base64 the bytes for the Anthropic call.
  // We don't persist the image to R2 yet — the create-partner flow
  // does that on confirm. Holding bytes in memory for one request is
  // fine; phone JPEGs are typically <2 MB.
  const buf = Buffer.from(await file.arrayBuffer());
  const base64 = buf.toString('base64');
  const mediaType = file.type as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

  try {
    const extraction = await extractBusinessCard({ imageBase64: base64, mediaType });
    return NextResponse.json({ ok: true, extraction });
  } catch (err) {
    console.warn('[scan/extract] failed', err);
    const msg = err instanceof Error ? err.message : 'extraction failed';
    return NextResponse.json({ error: `Vision extraction failed: ${msg}` }, { status: 500 });
  }
}
