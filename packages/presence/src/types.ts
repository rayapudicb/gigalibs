export type PresenceStatus = 'online' | 'away' | 'offline';

export interface UserPresence {
  userId: string;
  tenantId: string;
  status: PresenceStatus;
  lastSeenAt: Date;
}
