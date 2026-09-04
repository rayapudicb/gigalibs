import { Injectable } from '@nestjs/common';
import type { PresenceStatus, UserPresence } from './types.js';

@Injectable()
export class PresenceService {
  private readonly ttlSeconds = 60; // 1 min heartbeat window
  private readonly memoryPresence = new Map<string, UserPresence>();

  async setPresence(userId: string, tenantId: string, status: PresenceStatus = 'online'): Promise<void> {
    const presence: UserPresence = {
      userId,
      tenantId,
      status,
      lastSeenAt: new Date(),
    };
    this.memoryPresence.set(userId, presence);
  }

  async getPresence(userId: string): Promise<UserPresence | null> {
    const p = this.memoryPresence.get(userId);
    if (!p) return null;

    // Check TTL expiry
    const diff = (Date.now() - new Date(p.lastSeenAt).getTime()) / 1000;
    if (diff > this.ttlSeconds) {
      return {
        ...p,
        status: 'offline',
      };
    }
    return p;
  }

  async getOnlineUsers(tenantId: string): Promise<string[]> {
    const now = Date.now();
    const onlineUserIds: string[] = [];

    for (const p of this.memoryPresence.values()) {
      if (p.tenantId === tenantId && p.status === 'online') {
        const diff = (now - new Date(p.lastSeenAt).getTime()) / 1000;
        if (diff <= this.ttlSeconds) {
          onlineUserIds.push(p.userId);
        }
      }
    }

    return onlineUserIds;
  }
}
