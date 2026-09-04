export type NotificationChannel = 'IN_APP' | 'EMAIL' | 'SMS' | 'PUSH' | 'WEBHOOK';

export interface NotificationPayload {
  id: string;
  tenantId: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown> | undefined;
  channels: NotificationChannel[];
  createdAt: Date;
}

export interface NotificationDeliveryResult {
  channel: NotificationChannel;
  success: boolean;
  error?: string | undefined;
}
