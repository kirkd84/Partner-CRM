/**
 * GET /api/studio/designs/[id]/pdf
 *
 * Print-quality PDF export of a MwDesign. Renders the same Satori → PNG
 * pipeline as /png, then embeds the PNG into a pdf-lib Document at the
 * physical paper size most appropriate for the template:
 *
 *   - Letter (8.5x11) by default — flyers / handouts / posters
 *   - Business card (3.5x2) sheet when ?layout=cards — 10-up on Letter
 *   - Native size when ?layout=native — page = template's actual dimensions
 *
 * Query params (mirror the PNG route where they overlap):
 *   ?variant=light|dark|brand-primary
 *   ?sizeKey=instagram-square|business-card|...
 *   ?partnerId=...                ← MW-6 mail-merge
 *   ?layout=letter|cards|native   ← print layout, default = letter
 *   ?bleed=0.125                  ← bleed margin in inches
 *
 * Permissions: same workspace gate as the PNG route.
 */

import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@partnerradar/db';
import {
  toBrandRenderProfile,
  type BrandProfile,
  type MergeContext,
} from '@partnerradar/marketing-engine';
import { renderDesign } from '@partnerradar/marketing-engine/render';
import {
  getTemplate,
  getPlatformSize,
  type ColorVariant,
  type SlotValues,
} from '@partnerradar/marketing-templates';
// pdf-lib has zero native deps and tree-shakes well — keep on Node runtime
// only because renderDesign already pulls @resvg/resvg-js into this module.
import { PDFDocument, type PDFPage, rgb } from 'pdf-lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 1pt = 1/72 inch. PDF coordinates are points.
const POINTS_PER_INCH = 72;

interface PaperSize {
  widthIn: number;
  heightIn: number;
}

const LETTER: PaperSize = { widthIn: 8.5, heightIn: 11 };
// Business card is 3.5"x2"; 10-up tile = 2 cols x 5 rows on Letter with
// thin gutters. Pass `?cropMarks=1` to add commercial-print trim guides.
const BUSINESS_CARD: PaperSize = { widthIn: 3.5, heightIn: 2 };

// Crop-mark geometry (printer's marks). Standards say marks should sit
// 1/8" outside the trim box and be ~1/4" long, ~0.5pt thick.
const CROP_MARK_OFFSET_PT = (1 / 8) * POINTS_PER_INCH;
const CROP_MARK_LEN_PT = (1 / 4) * POINTS_PER_INCH;
const CROP_MARK_WIDTH_PT = 0.5;

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });
  const { id } = await ctx.params;

  const design = await prisma.mwDesign.findUnique({
    where: { id },
    include: { brand: true, workspace: true },
  });
  if (!design) return new Response('Not found', { status: 404 });

  if (session.user.role !== 'ADMIN' && session.user.role !== 'MANAGER') {
    return new Response('Forbidden', { status: 403 });
  }
  if (session.user.role === 'MANAGER') {
    const markets = session.user.markets ?? [];
    if (
      !design.workspace.partnerRadarMarketId ||
      !markets.includes(design.workspace.partnerRadarMarketId)
    ) {
      return new Response('Forbidden', { status: 403 });
    }
  }

  const doc = design.document as unknown as {
    templateKey: string;
    slots: SlotValues;
    variant: ColorVariant;
    sizeKey: string;
  };

  const variantOverride = req.nextUrl.searchParams.get('variant') as ColorVariant | null;
  const variant = variantOverride ?? doc.variant ?? 'light';
  const sizeOverride = req.nextUrl.searchParams.get('sizeKey');
  const partnerIdParam = req.nextUrl.searchParams.get('partnerId');
  const layoutParam = (req.nextUrl.searchParams.get('layout') ?? 'letter').toLowerCase();
  const bleedIn = clampNum(req.nextUrl.searchParams.get('bleed'), 0, 0.5, 0);
  // Crop marks: opt-in via ?cropMarks=1. Useful when sending the PDF to a
  // commercial printer that needs trim guides; not useful for self-print
  // on a paper trimmer (where they'd be visible on every card).
  const cropMarks =
    req.nextUrl.searchParams.get('cropMarks') === '1' ||
    req.nextUrl.searchParams.get('cropMarks') === 'true';

  const template = getTemplate(doc.templateKey);
  if (!template) return new Response('Template gone', { status: 500 });

  const brandProfile = design.brand.profile as unknown as BrandProfile;

  const size =
    (sizeOverride
      ? (template.manifest.sizes.find((s) => s.key === sizeOverride) ??
        getPlatformSize(sizeOverride))
      : null) ??
    template.manifest.sizes.find((s) => s.key === doc.sizeKey) ??
    template.manifest.sizes[0]!;

  // Optional partner merge — same as the PNG route.
  const merge = partnerIdParam
    ? await loadMergeContext(partnerIdParam, brandProfile).catch((err) => {
        console.warn('[design-pdf] partner merge lookup failed', err);
        return undefined;
      })
    : undefined;

  let renderedPngBytes: Uint8Array;
  try {
    const rendered = await renderDesign({
      template,
      brand: toBrandRenderProfile(brandProfile),
      slots: doc.slots,
      size,
      variant,
      ...(merge ? { merge } : {}),
    });
    renderedPngBytes = rendered.png;
  } catch (err) {
    console.error('[design-pdf] render', err);
    return new Response(String((err as Error).message ?? 'render failed'), { status: 500 });
  }

  try {
    const pdf = await PDFDocument.create();
    const png = await pdf.embedPng(renderedPngBytes);

    if (layoutParam === 'cards') {
      drawBusinessCardSheet(pdf, png, LETTER, { cropMarks });
    } else if (layoutParam === 'native') {
      drawNative(pdf, png, size, { cropMarks });
    } else {
      // Default: single design centered on Letter with optional bleed.
      drawCenteredOnLetter(pdf, png, LETTER, bleedIn, { cropMarks });
    }

    pdf.setTitle(slugifyTitle(template.manifest.name, doc.slots));
    pdf.setProducer('PartnerRadar Marketing Studio');
    pdf.setCreator('PartnerRadar');
    pdf.setCreationDate(new Date());

    const pdfBytes = await pdf.save();
    const filename = `${slugifyTitle(template.manifest.name, doc.slots)}.pdf`;

    return new Response(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `inline; filename="${filename}"`,
        'cache-control': 'private, max-age=30',
      },
    });
  } catch (err) {
    console.error('[design-pdf] assemble', err);
    return new Response(String((err as Error).message ?? 'pdf assembly failed'), { status: 500 });
  }
}

/**
 * Render the design centered on a Letter page. Bleed shrinks the safe
 * area so the design pulls back from the edge — useful when Kirk's
 * inkjet won't print to the paper edge.
 */
function drawCenteredOnLetter(
  pdf: PDFDocument,
  png: Awaited<ReturnType<PDFDocument['embedPng']>>,
  paper: PaperSize,
  bleedIn: number,
  opts: { cropMarks?: boolean } = {},
) {
  const pageW = paper.widthIn * POINTS_PER_INCH;
  const pageH = paper.heightIn * POINTS_PER_INCH;
  const page = pdf.addPage([pageW, pageH]);

  const safeMarginPt = bleedIn * POINTS_PER_INCH + 0.25 * POINTS_PER_INCH; // always at least 1/4"
  const maxW = pageW - 2 * safeMarginPt;
  const maxH = pageH - 2 * safeMarginPt;

  // Fit-to-box preserving aspect ratio.
  const ratio = png.width / png.height;
  let drawW = maxW;
  let drawH = maxW / ratio;
  if (drawH > maxH) {
    drawH = maxH;
    drawW = maxH * ratio;
  }
  const x = (pageW - drawW) / 2;
  const y = (pageH - drawH) / 2;
  page.drawImage(png, { x, y, width: drawW, height: drawH });

  if (opts.cropMarks) {
    drawCropMarks(page, x, y, drawW, drawH);
  }
}

/**
 * Render the design as its own PDF page sized to the template's native
 * pixel dimensions (assuming 300 DPI). Useful for sending designs to a
 * commercial print shop that wants exact-size PDFs.
 */
function drawNative(
  pdf: PDFDocument,
  png: Awaited<ReturnType<PDFDocument['embedPng']>>,
  size: { width: number; height: number },
  opts: { cropMarks?: boolean } = {},
) {
  // Treat the template's pixel dimensions as 300dpi for print sizing.
  // Satori renders at 2x for retina, then resvg writes the PNG at that
  // raster size, so we work back to physical inches via the template's
  // declared size which is already the 1x logical width/height.
  const widthIn = size.width / 300;
  const heightIn = size.height / 300;
  const pageW = widthIn * POINTS_PER_INCH;
  const pageH = heightIn * POINTS_PER_INCH;
  // When crop marks are requested we need room outside the trim for the
  // marks themselves, so we expand the page by 1/4" in every direction.
  const pad = opts.cropMarks ? CROP_MARK_OFFSET_PT + CROP_MARK_LEN_PT : 0;
  const page = pdf.addPage([pageW + 2 * pad, pageH + 2 * pad]);
  page.drawImage(png, { x: pad, y: pad, width: pageW, height: pageH });
  if (opts.cropMarks) {
    drawCropMarks(page, pad, pad, pageW, pageH);
  }
}

/**
 * 10-up business cards on a Letter page (2 columns × 5 rows). Each card
 * lands at the standard 3.5"×2" trim size; gutters are 0.125" so a
 * regular paper trimmer cuts cleanly. With ?cropMarks=1 we draw printer
 * trim guides at every interior + exterior corner of the card grid.
 */
function drawBusinessCardSheet(
  pdf: PDFDocument,
  png: Awaited<ReturnType<PDFDocument['embedPng']>>,
  paper: PaperSize,
  opts: { cropMarks?: boolean } = {},
) {
  const pageW = paper.widthIn * POINTS_PER_INCH;
  const pageH = paper.heightIn * POINTS_PER_INCH;
  const page = pdf.addPage([pageW, pageH]);

  const cardW = BUSINESS_CARD.widthIn * POINTS_PER_INCH;
  const cardH = BUSINESS_CARD.heightIn * POINTS_PER_INCH;
  const cols = 2;
  const rows = 5;
  const gutterX = 0.125 * POINTS_PER_INCH;
  const gutterY = 0.125 * POINTS_PER_INCH;
  const totalW = cols * cardW + (cols - 1) * gutterX;
  const totalH = rows * cardH + (rows - 1) * gutterY;
  const startX = (pageW - totalW) / 2;
  // pdf-lib origin is bottom-left; we draw row 0 at the TOP of the page.
  const startY = pageH - (pageH - totalH) / 2 - cardH;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = startX + c * (cardW + gutterX);
      const y = startY - r * (cardH + gutterY);
      page.drawImage(png, { x, y, width: cardW, height: cardH });
      if (opts.cropMarks) {
        drawCropMarks(page, x, y, cardW, cardH);
      }
    }
  }
}

/**
 * Draw printer's trim marks (corner registration lines) at each corner
 * of an axis-aligned box. Mark sits CROP_MARK_OFFSET_PT outside the box,
 * extends CROP_MARK_LEN_PT, and is rendered as two short orthogonal
 * strokes. Using rgb(0,0,0) keeps the marks usable on color printers.
 */
function drawCropMarks(page: PDFPage, x: number, y: number, w: number, h: number) {
  const o = CROP_MARK_OFFSET_PT;
  const len = CROP_MARK_LEN_PT;
  const stroke = { color: rgb(0, 0, 0), thickness: CROP_MARK_WIDTH_PT };
  const corners: Array<{ cx: number; cy: number; sx: 1 | -1; sy: 1 | -1 }> = [
    { cx: x, cy: y, sx: -1, sy: -1 }, // bottom-left
    { cx: x + w, cy: y, sx: 1, sy: -1 }, // bottom-right
    { cx: x, cy: y + h, sx: -1, sy: 1 }, // top-left
    { cx: x + w, cy: y + h, sx: 1, sy: 1 }, // top-right
  ];
  for (const corner of corners) {
    // Horizontal arm sits offset by `o` in the Y direction.
    page.drawLine({
      start: { x: corner.cx + corner.sx * o, y: corner.cy + corner.sy * o },
      end: { x: corner.cx + corner.sx * (o + len), y: corner.cy + corner.sy * o },
      ...stroke,
    });
    // Vertical arm sits offset by `o` in the X direction.
    page.drawLine({
      start: { x: corner.cx + corner.sx * o, y: corner.cy + corner.sy * o },
      end: { x: corner.cx + corner.sx * o, y: corner.cy + corner.sy * (o + len) },
      ...stroke,
    });
  }
}

async function loadMergeContext(
  partnerId: string,
  brandProfile: BrandProfile,
): Promise<MergeContext | undefined> {
  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: {
      companyName: true,
      partnerType: true,
      contacts: {
        where: { isPrimary: true },
        select: { name: true, title: true, emails: true, phones: true },
        take: 1,
      },
    },
  });
  if (!partner) return undefined;
  const c = partner.contacts[0];
  const fullName = c?.name ?? '';
  const [firstName, ...rest] = fullName.trim().split(/\s+/);
  const emails = (c?.emails as Array<{ address?: string; primary?: boolean }> | null) ?? [];
  const phones = (c?.phones as Array<{ number?: string; primary?: boolean }> | null) ?? [];
  const email = emails.find((e) => e?.primary)?.address ?? emails[0]?.address ?? undefined;
  const phone = phones.find((p) => p?.primary)?.number ?? phones[0]?.number ?? undefined;

  return {
    recipient: {
      firstName: firstName || fullName,
      lastName: rest.join(' '),
      fullName,
      ...(c?.title ? { title: c.title } : {}),
      ...(email ? { email } : {}),
      ...(phone ? { phone } : {}),
    },
    partner: {
      companyName: partner.companyName,
      primaryContactName: fullName,
      industry: partner.partnerType,
    },
    brand: {
      companyName: brandProfile.companyName,
      ...(brandProfile.tagline ? { tagline: brandProfile.tagline } : {}),
    },
  };
}

function slugifyTitle(label: string, slots: SlotValues): string {
  // Try the headline slot first so PDFs default to a meaningful filename
  // ("Spring Open House.pdf" vs "Flyer.pdf").
  const text = (slots.text as Record<string, string> | undefined) ?? {};
  const headline = text.headline ?? text.title ?? text.h1 ?? '';
  const base = (headline || label).replace(/[^\w\s-]/g, '').trim();
  return base.toLowerCase().replace(/\s+/g, '-').slice(0, 60) || 'design';
}

function clampNum(s: string | null, min: number, max: number, fallback: number): number {
  if (!s) return fallback;
  const n = Number(s);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
