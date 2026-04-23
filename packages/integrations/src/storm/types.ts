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

export interface StormCloudClient {
  createReferralPartner(payload: CreatePartnerPayload): Promise<{ stormCloudId: string }>;
  getAttributedRevenue(stormCloudId: string, since: Date): Promise<RevenueAttribution[]>;
  getAppointments(stormCloudId: string): Promise<ExternalAppointment[]>;
  getUser(email: string): Promise<{ stormCloudUserId: string } | null>;
  testConnection(): Promise<{ ok: boolean; message: string }>;
}
