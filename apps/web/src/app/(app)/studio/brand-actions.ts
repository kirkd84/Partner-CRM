'use server';

/**
 * Brand-training server actions (SPEC_MARKETING §3).
 *
 * Admin-only for create/retrain/archive; managers get read-only from
 * the /studio/brands page. Every mutation writes an EvActivityLogEntry-
 * style record to AuditLog so the team has a paper trail.
 *
 * The full AI-driven extraction (Claude Opus 4.7 vision) lives in
 * packages/marketing-engine — this file orchestrates: resolve the
 * workspace the caller can edit, create the MwBrand row, hand the
 * explicit inputs + sample file refs to `extractBrandProfile`,
 * persist the resulting BrandProfile JSON, and flip the brand ACTIVE
 * once the admin approves.
 */

import { revalidatePath } from 'next/cache';
import { prisma, Prisma } from '@partnerradar/db';
import { auth } from '@/auth';
import {
  extractBrandProfile,
  placeholderBrandProfile,
  type BrandProfile,
  type BrandProfileStatus,
} from '@partnerradar/marketing-engine';

async function assertAdminInWorkspace(workspaceId: string) {
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

export interface CreateBrandInput {
  workspaceId: string;
  name: string;
  companyName: string;
  /** Picker hex values the admin entered directly. */
  primaryHex?: string;
  secondaryHex?: string;
  accentHex?: string;
  phone?: string;
  email?: string;
  website?: string;
  physicalAddress?: string;
  industry?: string;
  voiceDescriptors?: string[];
  dos?: string[];
  donts?: string[];
  /** Uploaded file IDs (R2 keys when wired; metadata refs for now). */
  sampleFiles?: Array<{
    fileId: string;
    contentType: 'flyer' | 'social' | 'brochure' | 'business-card' | 'web' | 'other';
  }>;
}

export async function createBrand(input: CreateBrandInput): Promise<{
  brandId: string;
  usedAi: boolean;
  notes: string[];
}> {
  const { session } = await assertAdminInWorkspace(input.workspaceId);
  if (!input.name.trim()) throw new Error('Brand name required');
  if (!input.companyName.trim()) throw new Error('Company name required');

  // Seed a row so we have an id to thread through the extractor.
  const seed = await prisma.mwBrand.create({
    data: {
      workspaceId: input.workspaceId,
      name: input.name.trim(),
      status: 'TRAINING',
      profile: placeholderBrandProfile({
        id: 'pending',
        workspaceId: input.workspaceId,
        name: input.name.trim(),
        companyName: input.companyName.trim(),
      }) as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  });

  // Run extractor — graceful without ANTHROPIC_API_KEY or samples.
  const { profile, usedAi, notes } = await extractBrandProfile({
    brandId: seed.id,
    workspaceId: input.workspaceId,
    brandName: input.name.trim(),
    companyName: input.companyName.trim(),
    explicit: {
      primaryHex: input.primaryHex,
      secondaryHex: input.secondaryHex,
      accentHex: input.accentHex,
      physicalAddress: input.physicalAddress,
      phone: input.phone,
      email: input.email,
      website: input.website,
      industry: input.industry,
      voiceDescriptors: input.voiceDescriptors,
      dos: input.dos,
      donts: input.donts,
    },
    samples: (input.sampleFiles ?? []).map((s, i) => ({
      id: `sample-${seed.id}-${i}`,
      fileId: s.fileId,
      contentType: s.contentType,
    })),
  });

  await prisma.$transaction([
    prisma.mwBrand.update({
      where: { id: seed.id },
      data: {
        profile: profile as unknown as Prisma.InputJsonValue,
      },
    }),
    ...(input.sampleFiles ?? []).map((s) =>
      prisma.mwTrainingSample.create({
        data: {
          brandId: seed.id,
          fileId: s.fileId,
          contentType: s.contentType,
        },
      }),
    ),
    prisma.auditLog.create({
      data: {
        userId: session.user.id,
        entityType: 'mw_brand',
        entityId: seed.id,
        action: 'create',
        diff: {
          name: input.name.trim(),
          workspaceId: input.workspaceId,
          sampleCount: input.sampleFiles?.length ?? 0,
          usedAi,
        } as Prisma.InputJsonValue,
      },
    }),
  ]);

  revalidatePath('/studio/brands');
  revalidatePath('/studio');
  return { brandId: seed.id, usedAi, notes };
}

export async function approveBrand(brandId: string): Promise<void> {
  const brand = await prisma.mwBrand.findUnique({
    where: { id: brandId },
    select: { id: true, workspaceId: true, profile: true },
  });
  if (!brand) throw new Error('NOT_FOUND');
  const { session } = await assertAdminInWorkspace(brand.workspaceId);

  const existingProfile = (brand.profile ?? {}) as Record<string, unknown>;
  const nextProfile = {
    ...existingProfile,
    status: 'ACTIVE' as BrandProfileStatus,
    updatedAt: new Date().toISOString(),
  };
  await prisma.$transaction([
    prisma.mwBrand.update({
      where: { id: brandId },
      data: {
        status: 'ACTIVE',
        profile: nextProfile as unknown as Prisma.InputJsonValue,
      },
    }),
    prisma.auditLog.create({
      data: {
        userId: session.user.id,
        entityType: 'mw_brand',
        entityId: brandId,
        action: 'approve',
      },
    }),
  ]);
  revalidatePath('/studio/brands');
  revalidatePath('/studio');
}

export async function archiveBrand(brandId: string): Promise<void> {
  const brand = await prisma.mwBrand.findUnique({
    where: { id: brandId },
    select: { id: true, workspaceId: true, isDefault: true, profile: true },
  });
  if (!brand) throw new Error('NOT_FOUND');
  const { session } = await assertAdminInWorkspace(brand.workspaceId);
  if (brand.isDefault) {
    throw new Error(
      'This brand is the workspace default. Set another brand as default before archiving.',
    );
  }

  const existingProfile = (brand.profile ?? {}) as Record<string, unknown>;
  const nextProfile = { ...existingProfile, status: 'ARCHIVED' as BrandProfileStatus };
  await prisma.$transaction([
    prisma.mwBrand.update({
      where: { id: brandId },
      data: {
        status: 'ARCHIVED',
        profile: nextProfile as unknown as Prisma.InputJsonValue,
      },
    }),
    prisma.auditLog.create({
      data: {
        userId: session.user.id,
        entityType: 'mw_brand',
        entityId: brandId,
        action: 'archive',
      },
    }),
  ]);
  revalidatePath('/studio/brands');
}

export async function setDefaultBrand(brandId: string): Promise<void> {
  const brand = await prisma.mwBrand.findUnique({
    where: { id: brandId },
    select: { id: true, workspaceId: true, status: true },
  });
  if (!brand) throw new Error('NOT_FOUND');
  if (brand.status !== 'ACTIVE') {
    throw new Error('Only an ACTIVE brand can be set as default. Approve the brand first.');
  }
  const { session } = await assertAdminInWorkspace(brand.workspaceId);
  await prisma.$transaction([
    prisma.mwBrand.updateMany({
      where: { workspaceId: brand.workspaceId, isDefault: true },
      data: { isDefault: false },
    }),
    prisma.mwBrand.update({
      where: { id: brandId },
      data: { isDefault: true },
    }),
    prisma.auditLog.create({
      data: {
        userId: session.user.id,
        entityType: 'mw_brand',
        entityId: brandId,
        action: 'set_default',
      },
    }),
  ]);
  revalidatePath('/studio/brands');
  revalidatePath('/studio');
}

/**
 * Read helper for the setup wizard and review pages. Returns the
 * BrandProfile as strongly-typed JSON so the UI doesn't have to
 * repeat the Json → BrandProfile cast everywhere.
 */
export async function loadBrandProfile(brandId: string): Promise<BrandProfile | null> {
  const brand = await prisma.mwBrand.findUnique({
    where: { id: brandId },
    select: { profile: true },
  });
  if (!brand) return null;
  return brand.profile as unknown as BrandProfile;
}
