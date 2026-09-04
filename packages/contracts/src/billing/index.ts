import { z } from 'zod';

// ─── Billing Schemas ─────────────────────────────────────────────────────────

export const BillingIntervalSchema = z.enum(['day', 'week', 'month', 'year']);
export const SubscriptionStatusSchema = z.enum([
  'trialing', 'active', 'past_due', 'cancelled', 'unpaid', 'incomplete',
]);
export const InvoiceStatusSchema = z.enum(['draft', 'open', 'paid', 'void', 'uncollectible']);

export const PlanSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  price: z.number(),               // in smallest currency unit (e.g. paise, cents)
  currency: z.string().length(3),  // ISO 4217 e.g. 'INR', 'USD'
  interval: BillingIntervalSchema,
  intervalCount: z.number().int().default(1),
  features: z.array(z.string()),
  limits: z.record(z.string(), z.number()).optional(),   // e.g. { seats: 10, storage_gb: 5 }
  isActive: z.boolean().default(true),
  trialDays: z.number().int().default(0),
});

export const SubscriptionSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  planId: z.string(),
  status: SubscriptionStatusSchema,
  currentPeriodStart: z.date(),
  currentPeriodEnd: z.date(),
  trialStart: z.date().optional(),
  trialEnd: z.date().optional(),
  cancelledAt: z.date().optional(),
  createdAt: z.date(),
});

export const InvoiceLineItemSchema = z.object({
  description: z.string(),
  quantity: z.number(),
  unitAmount: z.number(),
  amount: z.number(),
});

export const InvoiceSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  number: z.string(),
  status: InvoiceStatusSchema,
  currency: z.string().length(3),
  subtotal: z.number(),
  tax: z.number().default(0),
  total: z.number(),
  lineItems: z.array(InvoiceLineItemSchema),
  dueDate: z.date().optional(),
  paidAt: z.date().optional(),
  createdAt: z.date(),
});

// ─── Inferred types ───────────────────────────────────────────────────────────

export type BillingInterval = z.infer<typeof BillingIntervalSchema>;
export type SubscriptionStatus = z.infer<typeof SubscriptionStatusSchema>;
export type InvoiceStatus = z.infer<typeof InvoiceStatusSchema>;
export type Plan = z.infer<typeof PlanSchema>;
export type Subscription = z.infer<typeof SubscriptionSchema>;
export type Invoice = z.infer<typeof InvoiceSchema>;
export type InvoiceLineItem = z.infer<typeof InvoiceLineItemSchema>;
