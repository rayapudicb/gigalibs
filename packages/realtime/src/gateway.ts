import type { OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { logger } from '@gigalibs/logger';
import { Rooms, joinRooms } from './room-manager.js';

/**
 * Base WebSocket gateway all GigaLibs gateways extend.
 * Handles:
 *  - JWT auth on connection (reads token from handshake)
 *  - Joining tenant + user rooms automatically
 *  - Presence tracking (online/offline)
 *  - Error handling and logging
 */
export abstract class BaseGateway implements OnGatewayConnection, OnGatewayDisconnect {
  protected server!: Server;

  async handleConnection(client: Socket): Promise<void> {
    try {
      const user = await this.authenticate(client);
      if (!user) {
        client.emit('error', { code: 'AUTH_TOKEN_INVALID', message: 'Unauthorized' });
        client.disconnect();
        return;
      }

      // Store user context on the socket for later use
      client.data['userId'] = user.userId;
      client.data['tenantId'] = user.tenantId;

      // Automatically join standard rooms
      await joinRooms(client, [
        Rooms.user(user.userId),
        Rooms.tenant(user.tenantId),
      ]);

      logger.debug(
        { socketId: client.id, userId: user.userId, tenantId: user.tenantId },
        'Socket connected',
      );

      await this.onClientConnected(client, user);
    } catch (err) {
      logger.error({ err, socketId: client.id }, 'Socket connection error');
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket): Promise<void> {
    const { userId, tenantId } = client.data as { userId?: string; tenantId?: string };
    logger.debug({ socketId: client.id, userId, tenantId }, 'Socket disconnected');
    if (userId && tenantId) {
      await this.onClientDisconnected(client, { userId, tenantId });
    }
  }

  /**
   * Override to implement JWT authentication.
   * Should return { userId, tenantId } or null if auth fails.
   */
  protected abstract authenticate(
    client: Socket,
  ): Promise<{ userId: string; tenantId: string } | null>;

  /**
   * Called after successful connection + room join.
   */
  protected onClientConnected(
    _client: Socket,
    _user: { userId: string; tenantId: string },
  ): void | Promise<void> {/* override to add behaviour */}

  /**
   * Called on disconnect.
   */
  protected onClientDisconnected(
    _client: Socket,
    _user: { userId: string; tenantId: string },
  ): void | Promise<void> {/* override to add behaviour */}
}
