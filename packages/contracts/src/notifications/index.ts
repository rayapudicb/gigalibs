import { z } from 'zod';

// ─── Notification Schemas ─────────────────────────────────────────────────────

export const NotificationChannelSchema = z.enum(['in_app', 'email', 'sms', 'push', 'webhook']);
export const NotificationStatusSchema = z.enum(['pending', 'sent', 'failed', 'read']);

export const NotificationSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  userId: z.string(),
  type: z.string(),        // e.g. 'invoice.paid', 'member.invited', 'comment.mention'
  title: z.string(),
  body: z.string(),
  data: z.record(z.string(), z.unknown()).optional(),   // extra payload (link, entityId, etc.)
  channel: NotificationChannelSchema,
  status: NotificationStatusSchema,
  readAt: z.date().optional(),
  createdAt: z.date(),
});

export const SendNotificationSchema = z.object({
  userId: z.string(),
  type: z.string(),
  title: z.string(),
  body: z.string(),
  channels: z.array(NotificationChannelSchema).min(1),
  data: z.record(z.string(), z.unknown()).optional(),
});

// ─── Inferred types ───────────────────────────────────────────────────────────

export type NotificationChannel = z.infer<typeof NotificationChannelSchema>;
export type NotificationStatus = z.infer<typeof NotificationStatusSchema>;
export type Notification = z.infer<typeof NotificationSchema>;
export type SendNotificationDto = z.infer<typeof SendNotificationSchema>;
