import { Injectable } from '@nestjs/common';
import { generateId } from '@gigalibs/crypto';
import type { SendNotificationDto, Notification } from '@gigalibs/contracts';

@Injectable()
export class NotificationsService {
  private notifications: Notification[] = [];

  async send(tenantId: string, dto: SendNotificationDto): Promise<Notification[]> {
    const createdList: Notification[] = dto.channels.map((channel) => ({
      id: generateId(),
      tenantId,
      userId: dto.userId,
      type: dto.type,
      title: dto.title,
      body: dto.body,
      data: dto.data,
      channel,
      status: 'pending',
      createdAt: new Date(),
    }));

    this.notifications.push(...createdList);
    return createdList;
  }

  async getUserNotifications(userId: string, limit = 20): Promise<Notification[]> {
    return this.notifications
      .filter((n) => n.userId === userId)
      .slice(-limit);
  }

  async markAsRead(notificationId: string): Promise<void> {
    const item = this.notifications.find((n) => n.id === notificationId);
    if (item) {
      item.status = 'read';
      item.readAt = new Date();
    }
  }
}
