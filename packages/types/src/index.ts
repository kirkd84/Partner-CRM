/**
 * Shared Zod schemas + TS types. Used by apps/web, apps/mobile, packages/api.
 * Always import the Zod schema here, then `z.infer<typeof schema>` for the TS type —
 * that way one change cascades to validator + type.
 *
 * We also re-export the Prisma enums so clients don't have to depend on
 * @prisma/client directly.
 */
import { z } from 'zod';
import {
  Role,
  PartnerStage,
  PartnerType,
  LeadSource,
  ActivityType,
  TaskPriority,
  ExpenseApproval,
  AppointmentSource,
  ScrapeSource,
  ScrapedLeadStatus,
  MessageKind,
  SmsConsentMethod,
  RouteStartMode,
  MapApp,
  ToneTrainingStatus,
} from '@partnerradar/db';

export {
  Role,
  PartnerStage,
  PartnerType,
  LeadSource,
  ActivityType,
  TaskPriority,
  ExpenseApproval,
  AppointmentSource,
  ScrapeSource,
  ScrapedLeadStatus,
  MessageKind,
  SmsConsentMethod,
  RouteStartMode,
  MapApp,
  ToneTrainingStatus,
};

// ── Auth ─────────────────────────────────────────────────────
export const LoginInput = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof LoginInput>;

export const SessionUser = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  role: z.nativeEnum(Role),
  avatarColor: z.string(),
  markets: z.array(z.string()),
});
export type SessionUser = z.infer<typeof SessionUser>;

// ── Partners ─────────────────────────────────────────────────
export const PartnerCreateInput = z.object({
  companyName: z.string().min(1).max(200),
  partnerType: z.nativeEnum(PartnerType),
  customType: z.string().max(100).optional(),
  marketId: z.string().cuid(),
  address: z.string().max(200).optional(),
  addressLine2: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
  state: z.string().length(2).optional(),
  zip: z.string().max(10).optional(),
  website: z.string().url().optional().or(z.literal('')),
  notes: z.string().max(5000).optional(),
  assignedRepId: z.string().cuid().optional(),
});
export type PartnerCreateInput = z.infer<typeof PartnerCreateInput>;

export const PartnerFiltersInput = z.object({
  search: z.string().optional(),
  stage: z.array(z.nativeEnum(PartnerStage)).optional(),
  partnerType: z.array(z.nativeEnum(PartnerType)).optional(),
  assignedRepId: z.string().cuid().optional().nullable(),
  marketId: z.string().cuid().optional(),
  tags: z.array(z.string()).optional(),
  hasPhone: z.boolean().optional(),
  hasEmail: z.boolean().optional(),
  archivedOnly: z.boolean().optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(200).default(50),
});
export type PartnerFiltersInput = z.infer<typeof PartnerFiltersInput>;

export const PartnerStageChangeInput = z.object({
  partnerId: z.string().cuid(),
  stage: z.nativeEnum(PartnerStage),
  note: z.string().max(2000).optional(),
});
export type PartnerStageChangeInput = z.infer<typeof PartnerStageChangeInput>;

// ── Contacts ─────────────────────────────────────────────────
export const ContactPhone = z.object({
  number: z.string(),
  label: z.string().optional(),
  primary: z.boolean().default(false),
});
export const ContactEmail = z.object({
  address: z.string().email(),
  label: z.string().optional(),
  primary: z.boolean().default(false),
  unsubscribedAt: z.string().datetime().nullable().optional(),
});
export const ContactCreateInput = z.object({
  partnerId: z.string().cuid(),
  name: z.string().min(1).max(120),
  title: z.string().max(120).optional(),
  phones: z.array(ContactPhone).default([]),
  emails: z.array(ContactEmail).default([]),
  isPrimary: z.boolean().default(false),
  notes: z.string().max(2000).optional(),
});
export type ContactCreateInput = z.infer<typeof ContactCreateInput>;

// ── Tasks / Appointments / Activities ────────────────────────
export const TaskCreateInput = z.object({
  partnerId: z.string().cuid().optional(),
  assigneeId: z.string().cuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  dueAt: z.string().datetime().optional(),
  priority: z.nativeEnum(TaskPriority).default('NORMAL'),
});
export type TaskCreateInput = z.infer<typeof TaskCreateInput>;

export const AppointmentCreateInput = z.object({
  partnerId: z.string().cuid().optional(),
  type: z.string().min(1).max(60),
  title: z.string().min(1).max(200),
  location: z.string().max(400).optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  allDay: z.boolean().default(false),
  notes: z.string().max(2000).optional(),
});
export type AppointmentCreateInput = z.infer<typeof AppointmentCreateInput>;

export const ActivityCreateInput = z.object({
  partnerId: z.string().cuid(),
  type: z.nativeEnum(ActivityType),
  body: z.string().max(5000).optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type ActivityCreateInput = z.infer<typeof ActivityCreateInput>;

// ── Expenses ─────────────────────────────────────────────────
export const ExpenseCreateInput = z.object({
  partnerId: z.string().cuid(),
  amount: z.number().positive(),
  description: z.string().min(1).max(300),
  category: z.enum(['Meal', 'Gift', 'Event', 'Travel', 'Other']),
  occurredOn: z.string().datetime(),
  receiptFileId: z.string().cuid().optional(),
});
export type ExpenseCreateInput = z.infer<typeof ExpenseCreateInput>;

// ── Users / Admin ────────────────────────────────────────────
export const UserCreateInput = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120),
  role: z.nativeEnum(Role),
  marketIds: z.array(z.string().cuid()).min(1),
});
export type UserCreateInput = z.infer<typeof UserCreateInput>;

// ── Pipeline stage labels (UI-friendly) ──────────────────────
export const STAGE_LABELS: Record<PartnerStage, string> = {
  NEW_LEAD: 'New Lead',
  RESEARCHED: 'Researched',
  INITIAL_CONTACT: 'Initial Contact',
  MEETING_SCHEDULED: 'Meeting Scheduled',
  IN_CONVERSATION: 'In Conversation',
  PROPOSAL_SENT: 'Proposal Sent',
  ACTIVATED: 'Activated',
  INACTIVE: 'Inactive',
};

export const STAGE_COLORS: Record<PartnerStage, string> = {
  NEW_LEAD: '#9ca3af',
  RESEARCHED: '#f97316',
  INITIAL_CONTACT: '#f59e0b',
  MEETING_SCHEDULED: '#3b82f6',
  IN_CONVERSATION: '#a855f7',
  PROPOSAL_SENT: '#ec4899',
  ACTIVATED: '#10b981',
  INACTIVE: '#94a3b8',
};

export const PARTNER_TYPE_LABELS: Record<PartnerType, string> = {
  REALTOR: 'Realtor',
  PROPERTY_MANAGER: 'Property Manager',
  INSURANCE_AGENT: 'Insurance Agent',
  MORTGAGE_BROKER: 'Mortgage Broker',
  HOME_INSPECTOR: 'Home Inspector',
  PUBLIC_ADJUSTER: 'Public Adjuster',
  REAL_ESTATE_ATTORNEY: 'Real Estate Attorney',
  HVAC: 'HVAC',
  PLUMBING: 'Plumbing',
  ELECTRICAL: 'Electrical',
  LANDSCAPER: 'Landscaper',
  GENERAL_CONTRACTOR: 'General Contractor',
  RESTORATION_MITIGATION: 'Restoration / Mitigation',
  FACILITIES_MANAGER_COMMERCIAL: 'Facilities Manager (Commercial)',
  OTHER: 'Other',
};

export const ORDERED_STAGES: PartnerStage[] = [
  'NEW_LEAD',
  'RESEARCHED',
  'INITIAL_CONTACT',
  'MEETING_SCHEDULED',
  'IN_CONVERSATION',
  'PROPOSAL_SENT',
  'ACTIVATED',
  'INACTIVE',
];
