import { z } from "zod";
import { LeadStatuses, Roles } from "./constants";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export const adminUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(Roles)
});

export const leadUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  status: z.enum(LeadStatuses).optional(),
  optInCommercial: z.boolean().optional(),
  ageConfirmed: z.boolean().optional(),
  followUpAllowed: z.boolean().optional(),
  aiEnabled: z.boolean().optional(),
  notes: z.string().max(8000).nullable().optional(),
  source: z.string().max(120).optional()
});

export const sendMessageSchema = z.object({
  conversationId: z.string().min(1),
  text: z.string().max(4000).optional(),
  mediaAssetId: z.string().optional(),
  sensitive: z.boolean().default(false)
}).refine((value) => Boolean(value.text || value.mediaAssetId), {
  message: "Mensaje o imagen requerida"
});

export const campaignSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  segment: z.record(z.unknown()).default({ optInCommercial: true }),
  message: z.string().min(1).max(4000),
  imageId: z.string().optional(),
  link: z.string().url().optional().or(z.literal("")),
  startAt: z.string().optional(),
  sendTime: z.string().default("10:00"),
  dailyLimit: z.number().int().min(1).max(500).default(50),
  pauseSeconds: z.number().int().min(30).max(3600).default(90),
  sensitive: z.boolean().default(false)
});

export const automationSchema = z.object({
  name: z.string().min(2),
  trigger: z.string().min(1),
  conditions: z.record(z.unknown()).default({}),
  delaySeconds: z.number().int().min(0).default(0),
  action: z.string().min(1),
  actionPayload: z.record(z.unknown()).default({}),
  executionLimit: z.number().int().min(1).default(1),
  segment: z.record(z.unknown()).default({}),
  priority: z.number().int().default(0),
  sensitive: z.boolean().default(false),
  allowRepeat: z.boolean().default(false)
});

export const purchaseSchema = z.object({
  leadId: z.string().min(1),
  amount: z.number().nonnegative(),
  paymentMethod: z.string().min(1),
  plan: z.string().min(1),
  notes: z.string().optional(),
  receiptAssetId: z.string().optional()
});
