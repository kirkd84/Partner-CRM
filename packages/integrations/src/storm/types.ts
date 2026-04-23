import { z } from 'zod';

export const CreatePartnerPayload = z.object({
  externalId: z.string(), // partner.publicId
  companyName: z.string(),
  partnerType: z.string(),
  address: z.string().optional(),
  marketCode: z.string(),
  primaryContact: z
    .object({
      name: z.string(),
      email: z.string().email().optional(),
      phone: z.string().optional(),
    })
    .optional(),
  metadata: z
    .object({
      activatedAt: z.string().datetime(),
      activatedBy: z.string(),
      notes: z.string().optional(),
    })
    .optional(),
});
export type CreatePartnerPayload = z.infer<typeof CreatePartnerPayload>;

export const RevenueAttribution = z.object({
  stormCloudProjectId: z.string(),
  amount: z.number().positive(),
  earnedOn: z.string().datetime(),
});
export type RevenueAttribution = z.infer<typeof RevenueAttribution>;

export const ExternalAppointment = z.object({
  externalId: z.string(),
  title: z.string(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  location: z.string().optional(),
});
export type ExternalAppointment = z.infer<typeof ExternalAppointment>;

export const StormProject = z.object({
  id: z.string(), // Storm project code like P1160
  name: z.string(),
  primaryContact: z.string(),
  address: z.string(),
  city: z.string(),
  state: z.string(),
  market: z.string(),
  arOutstanding: z.number(),
  status: z.string(), // "Lead" / "Inspected" / "Contract" / "Install Scheduled" / "Installed" / "Supplement" / "Reinspect"
  lastTouchedAt: z.string().datetime(),
  installDate: z.string().datetime().nullable(),
  salesReps: z.array(z.string()),
  revenue: z.number(),
  expenses: z.number(),
  insuranceTotal: z.number(),
  timeInStatus: z.string(), // human string "8 days", "3 weeks"
  supplementer: z.string().nullable(),
});
export type StormProject = z.infer<typeof StormProject>;

export const PartnerStats = z.object({
  mtd: z.object({ revenue: z.number(), projects: z.number() }),
  ytd: z.object({ revenue: z.number(), projects: z.number() }),
  lastYear: z.object({ revenue: z.number(), projects: z.number() }),
  lifetime: z.object({ revenue: z.number(), projects: z.number() }),
});
export type PartnerStats = z.infer<typeof PartnerStats>;

export interface StormCloudClient {
  createReferralPartner(payload: CreatePartnerPayload): Promise<{ stormCloudId: string }>;
  getAttributedRevenue(stormCloudId: string, since: Date): Promise<RevenueAttribution[]>;
  getAppointments(stormCloudId: string): Promise<ExternalAppointment[]>;
  listProjects(stormCloudId: string): Promise<StormProject[]>;
  getPartnerStats(stormCloudId: string): Promise<PartnerStats>;
  getUser(email: string): Promise<{ stormCloudUserId: string } | null>;
  testConnection(): Promise<{ ok: boolean; message: string }>;
}
