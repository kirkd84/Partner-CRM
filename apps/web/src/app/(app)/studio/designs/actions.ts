'use server';

/**
 * Design-level server actions — create, regenerate, approve, archive.
 *
 * The create flow is the biggest one: parse the prompt → pick template
 * via the director → render the SVG/PNG server-side → persist MwDesign
 * with the document (template key + slots + variant + size). The PNG
 * is rendered on-the-fly by /api/studio/designs/[id]/png so the row
 * stays small and always reflects the current state.
 *
 * Permissions: manager+ can create inside workspaces they can reach
 * (admin = everywhere, manager = their markets). Rep access is a
 * future gate when we open Studio to more users.
 */

import { revalidatePath } from 'next/cache';
import { prisma, Prisma } from '@partnerradar/db';
import { auth } from '@/auth';
import {
  generateDesignFull,
  parseIntent,
  direct,
  type BrandProfile,
  type DesignIntent,
} from '@partnerradar/marketing-engine';
import type { SlotValues, ColorVariant } from '@partnerradar/marketing-templates';

export interface CreateDesignInput {
  workspaceId: string;
  brandId?: string;
  prompt: string;
  name?: string;
  contentType?: DesignIntent['contentType'];
  variant?: ColorVariant;
  sizeKey?: string;
}

async function assertAccess(workspaceId: string) {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');
  if (session.user.role !== 'ADMIN' && session.user.role !== 'MANAGER') {
    throw new Error('FORBIDDEN');
  }
  const ws = await prisma.mwWorkspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, partnerRadarMarketId: true },
  });
  if (!ws) throw new Error('NOT_FOUND');
  if (session.user.role !== 'ADMIN') {
    const markets = session.user.markets ?? [];
    if (!ws.partnerRadarMarketId || !markets.includes(ws.partnerRadarMarketId)) {
      throw new Error('FORBIDDEN');
    }
  }
  return { session, workspace: ws };
}

async function resolveBrand(workspaceId: string, brandId?: string) {
  const brand = brandId
    ? await prisma.mwBrand.findUnique({ where: { id: brandId } })
    : await prisma.mwBrand.findFirst({
        where: { workspaceId, status: 'ACTIVE' },
        orderBy: { updatedAt: 'desc' },
      });
  if (!brand) throw new Error('No active brand for this workspace. Approve one in /studio/brands.');
  return brand;
}

export async function createDesign(
  input: CreateDesignInput,
): Promise<{ id: string; elapsedMs: number; templateKey: string }> {
  const { session } = await assertAccess(input.workspaceId);
  if (!input.prompt.trim()) throw new Error('Give me a prompt to work from.');
  const brand = await resolveBrand(input.workspaceId, input.brandId);
  const brandProfile = brand.profile as unknown as BrandProfile;

  // Parse intent, pick template, generate slot copy.
  let intent: DesignIntent;
  if (input.contentType) {
    const parsed = await parseIntent(input.prompt);
    intent = { ...parsed, contentType: input.contentType };
  } else {
    intent = await parseIntent(input.prompt);
  }

  const directorOut = await direct({ intent, brand: brandProfile });
  const template = directorOut.template;
  const sizeKey = input.sizeKey ?? template.manifest.sizes[0]!.key;
  const size =
    template.manifest.sizes.find((s) => s.key === sizeKey) ?? template.manifest.sizes[0]!;
  const variant: ColorVariant = input.variant ?? 'light';

  const name = (input.name ?? intent.purpose).trim().slice(0, 120) || 'Untitled design';

  // We persist document = { templateKey, slots, variant, sizeKey }. The
  // PNG is rendered on demand by the /api/studio/designs/[id]/png route
  // so we don't have to store binaries until MW-3 follow-up wires R2.
  const document = {
    templateKey: template.manifest.catalogKey,
    slots: directorOut.slotValues,
    variant,
    sizeKey: size.key,
    width: size.width,
    height: size.height,
  };

  const created = await prisma.mwDesign.create({
    data: {
      workspaceId: input.workspaceId,
      brandId: brand.id,
      createdBy: session.user.id,
      name,
      contentType: intent.contentType,
      templateId: template.manifest.catalogKey,
      status: 'DRAFT',
      intent: intent as unknown as Prisma.InputJsonValue,
      direction: directorOut.direction as unknown as Prisma.InputJsonValue,
      document: document as unknown as Prisma.InputJsonValue,
      tags: intent.tone ? [intent.tone] : [],
    },
    select: { id: true },
  });

  // Activity: keep it light, AuditLog gets the formal record.
  try {
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        entityType: 'mw_design',
        entityId: created.id,
        action: 'create',
        diff: {
          prompt: input.prompt,
          template: template.manifest.catalogKey,
          brandId: brand.id,
        } as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    console.warn('[createDesign] audit log skipped', err);
  }

  revalidatePath('/studio');
  revalidatePath('/studio/designs');

  return {
    id: created.id,
    elapsedMs: 0,
    templateKey: template.manifest.catalogKey,
  };
}

export async function regenerateDesign(
  designId: string,
  opts: { prompt?: string; variant?: ColorVariant } = {},
): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');
  const existing = await prisma.mwDesign.findUnique({ where: { id: designId } });
  if (!existing) throw new Error('NOT_FOUND');
  await assertAccess(existing.workspaceId);
  const brand = await prisma.mwBrand.findUnique({ where: { id: existing.brandId } });
  if (!brand) throw new Error('BRAND_GONE');

  const prompt =
    opts.prompt ?? (existing.intent as { purpose?: string } | null)?.purpose ?? existing.name;

  const result = await generateDesignFull({
    prompt,
    brand: brand.profile as unknown as BrandProfile,
    ...(opts.variant ? { variant: opts.variant } : {}),
  });

  // Regenerate swaps in the director's fresh slot values — otherwise
  // the button wouldn't actually do anything visible. Hand-edits are
  // preserved across regular edits in updateDesignSlots.
  const doc = {
    templateKey: result.templateKey,
    slots: result.slots,
    variant: result.rendered.variant,
    sizeKey: result.rendered.sizeKey,
    width: result.rendered.width,
    height: result.rendered.height,
  };

  await prisma.mwDesign.update({
    where: { id: designId },
    data: {
      direction: result.direction as unknown as Prisma.InputJsonValue,
      document: doc as unknown as Prisma.InputJsonValue,
      intent: result.intent as unknown as Prisma.InputJsonValue,
    },
  });
  await prisma.mwDesignVersion.create({
    data: {
      designId,
      createdBy: session.user.id,
      changeLog: opts.prompt
        ? `Regenerated with prompt: ${opts.prompt.slice(0, 120)}`
        : 'Regenerated',
      document: doc as unknown as Prisma.InputJsonValue,
    },
  });

  revalidatePath(`/studio/designs/${designId}`);
}

export async function updateDesignStatus(
  designId: string,
  status: 'DRAFT' | 'REVIEW' | 'APPROVED' | 'FINAL' | 'ARCHIVED',
): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');
  const design = await prisma.mwDesign.findUnique({ where: { id: designId } });
  if (!design) throw new Error('NOT_FOUND');
  await assertAccess(design.workspaceId);

  await prisma.mwDesign.update({
    where: { id: designId },
    data: {
      status,
      archivedAt: status === 'ARCHIVED' ? new Date() : null,
    },
  });
  revalidatePath('/studio');
  revalidatePath(`/studio/designs/${designId}`);
}

/**
 * MW-4: revert the design back to the document recorded in a prior
 * MwDesignVersion. Logs a fresh version capturing the revert (so
 * "undo the undo" still works).
 */
export async function revertDesignToVersion(designId: string, versionId: string): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');
  const existing = await prisma.mwDesign.findUnique({ where: { id: designId } });
  if (!existing) throw new Error('NOT_FOUND');
  await assertAccess(existing.workspaceId);
  const version = await prisma.mwDesignVersion.findUnique({ where: { id: versionId } });
  if (!version || version.designId !== designId) throw new Error('VERSION_NOT_FOUND');

  await prisma.mwDesign.update({
    where: { id: designId },
    data: { document: version.document as unknown as Prisma.InputJsonValue },
  });
  await prisma.mwDesignVersion.create({
    data: {
      designId,
      createdBy: session.user.id,
      changeLog: `Reverted to version from ${version.createdAt.toISOString().slice(0, 16).replace('T', ' ')}`,
      document: version.document as unknown as Prisma.InputJsonValue,
    },
  });
  revalidatePath(`/studio/designs/${designId}`);
}

/**
 * MW-5: log a multi-channel export. We're not persisting bytes —
 * the PNG is regenerated on demand via /api/studio/designs/[id]/png
 * — but we keep MwExport rows so the user has a download history
 * and we can later add R2-backed cached bytes here.
 */
export async function recordDesignExport(
  designId: string,
  args: { sizeKey: string; format?: 'png' | 'pdf'; targetChannel?: string | null },
): Promise<{ id: string }> {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');
  const design = await prisma.mwDesign.findUnique({ where: { id: designId } });
  if (!design) throw new Error('NOT_FOUND');
  await assertAccess(design.workspaceId);

  // Resolve the size from either the template manifest or the global
  // platform catalog. We do a lightweight import here — keeps the
  // hot path of createDesign untouched.
  const { getTemplate, getPlatformSize } = await import('@partnerradar/marketing-templates');
  const tmpl = getTemplate((design.document as { templateKey?: string } | null)?.templateKey ?? '');
  const size =
    tmpl?.manifest.sizes.find((s) => s.key === args.sizeKey) ?? getPlatformSize(args.sizeKey);
  if (!size) throw new Error('Unknown size');

  const created = await prisma.mwExport.create({
    data: {
      designId,
      format: args.format ?? 'png',
      targetChannel: args.targetChannel ?? null,
      width: size.width,
      height: size.height,
      dpi: size.dpi ?? null,
      colorMode: 'RGB',
      // Until R2 lands we store a relative URL; the bytes are produced
      // on-the-fly by the PNG route. The fileId column lets us swap to
      // an R2 key with no schema change later.
      fileId: `inline:/api/studio/designs/${designId}/png?sizeKey=${size.key}`,
      sizeBytes: 0,
    },
    select: { id: true },
  });
  revalidatePath(`/studio/designs/${designId}`);
  return { id: created.id };
}

export async function updateDesignSlots(
  designId: string,
  overrides: {
    text?: Record<string, string>;
    image?: Record<string, string | null>; // null = clear the slot
    variant?: ColorVariant;
  },
): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');
  const existing = await prisma.mwDesign.findUnique({ where: { id: designId } });
  if (!existing) throw new Error('NOT_FOUND');
  await assertAccess(existing.workspaceId);

  const existingDoc = existing.document as unknown as {
    templateKey: string;
    slots: SlotValues;
    variant: ColorVariant;
    sizeKey: string;
    width: number;
    height: number;
  };

  // Merge image overrides — `null` removes the entry, anything else overwrites.
  const mergedImages: Record<string, string> = { ...(existingDoc.slots.image ?? {}) };
  if (overrides.image) {
    for (const [k, v] of Object.entries(overrides.image)) {
      if (v == null) delete mergedImages[k];
      else mergedImages[k] = v;
    }
  }

  const newDoc = {
    ...existingDoc,
    variant: overrides.variant ?? existingDoc.variant,
    slots: {
      text: { ...existingDoc.slots.text, ...(overrides.text ?? {}) },
      image: mergedImages,
    },
  };

  await prisma.mwDesign.update({
    where: { id: designId },
    data: { document: newDoc as unknown as Prisma.InputJsonValue },
  });
  const changeLog = overrides.variant
    ? 'Variant changed'
    : overrides.image
      ? 'Image updated'
      : 'Copy edited';
  await prisma.mwDesignVersion.create({
    data: {
      designId,
      createdBy: session.user.id,
      changeLog,
      document: newDoc as unknown as Prisma.InputJsonValue,
    },
  });
  revalidatePath(`/studio/designs/${designId}`);
}

/**
 * MW-4 lite: take a free-text refinement instruction ("make the headline
 * shorter", "swap to dark variant", "try a more urgent tone") and re-run
 * the director with the existing intent + that instruction merged in.
 *
 * Without an Anthropic key the rule-based director just re-picks based
 * on tone hints found in the instruction — so something like "make it
 * urgent" still nudges the design even with no LLM available.
 */
export async function refineDesign(designId: string, instruction: string): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');
  if (!instruction.trim()) throw new Error('Tell me what to change.');
  const existing = await prisma.mwDesign.findUnique({ where: { id: designId } });
  if (!existing) throw new Error('NOT_FOUND');
  await assertAccess(existing.workspaceId);
  const brand = await prisma.mwBrand.findUnique({ where: { id: existing.brandId } });
  if (!brand) throw new Error('BRAND_GONE');

  const existingIntent = existing.intent as unknown as DesignIntent;
  const existingDoc = existing.document as unknown as {
    templateKey: string;
    slots: SlotValues;
    variant: ColorVariant;
    sizeKey: string;
    width: number;
    height: number;
  };

  // Compose a refined intent: keep contentType, append the instruction
  // to purpose so the rule-based + LLM directors both see it.
  const refinedIntent: DesignIntent = {
    ...existingIntent,
    purpose: `${existingIntent.purpose}\n\nRefinement: ${instruction.trim()}`,
  };

  const directorOut = await direct({
    intent: refinedIntent,
    brand: brand.profile as unknown as BrandProfile,
  });

  // Preserve the user's image uploads — refinement is about copy/template,
  // not about discarding photos they took the time to upload.
  const newDoc = {
    templateKey: directorOut.template.manifest.catalogKey,
    slots: {
      text: directorOut.slotValues.text,
      image: { ...existingDoc.slots.image },
    },
    variant: existingDoc.variant,
    sizeKey:
      directorOut.template.manifest.sizes.find((s) => s.key === existingDoc.sizeKey)?.key ??
      directorOut.template.manifest.sizes[0]!.key,
    width:
      directorOut.template.manifest.sizes.find((s) => s.key === existingDoc.sizeKey)?.width ??
      directorOut.template.manifest.sizes[0]!.width,
    height:
      directorOut.template.manifest.sizes.find((s) => s.key === existingDoc.sizeKey)?.height ??
      directorOut.template.manifest.sizes[0]!.height,
  };

  await prisma.mwDesign.update({
    where: { id: designId },
    data: {
      intent: refinedIntent as unknown as Prisma.InputJsonValue,
      direction: directorOut.direction as unknown as Prisma.InputJsonValue,
      document: newDoc as unknown as Prisma.InputJsonValue,
    },
  });
  await prisma.mwDesignVersion.create({
    data: {
      designId,
      createdBy: session.user.id,
      changeLog: `Refined: ${instruction.trim().slice(0, 120)}`,
      document: newDoc as unknown as Prisma.InputJsonValue,
    },
  });
  revalidatePath(`/studio/designs/${designId}`);
}
