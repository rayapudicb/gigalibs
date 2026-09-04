import type { Server, Socket } from 'socket.io';

/**
 * Room naming conventions for Socket.IO.
 * All rooms follow a predictable naming pattern.
 */
export const Rooms = {
  /** Tenant-wide room — all users of a tenant */
  tenant: (tenantId: string) => `tenant:${tenantId}`,

  /** Per-user private room — for direct notifications/messages */
  user: (userId: string) => `user:${userId}`,

  /** Chat channel room */
  channel: (channelId: string) => `channel:${channelId}`,

  /** Direct message thread (sorted userId pair for uniqueness) */
  dm: (userId1: string, userId2: string) => {
    const sorted = [userId1, userId2].sort();
    return `dm:${sorted[0]}:${sorted[1]}`;
  },

  /** AI chat conversation */
  aiConversation: (conversationId: string) => `ai:conversation:${conversationId}`,

  /** Entity collaboration room (e.g. editing a ticket, a document) */
  entity: (resource: string, resourceId: string) => `entity:${resource}:${resourceId}`,
} as const;

/**
 * Join a socket to a set of rooms.
 */
export const joinRooms = async (socket: Socket, rooms: string[]): Promise<void> => {
  await socket.join(rooms);
};

/**
 * Broadcast to all sockets in a room except the sender.
 */
export const broadcastToRoom = <T>(
  io: Server,
  room: string,
  event: string,
  data: T,
  excludeSocketId?: string,
): void => {
  if (excludeSocketId) {
    io.to(room).except(excludeSocketId).emit(event, data);
  } else {
    io.to(room).emit(event, data);
  }
};

/**
 * Emit to a specific user (their private room).
 */
export const emitToUser = <T>(io: Server, userId: string, event: string, data: T): void => {
  io.to(Rooms.user(userId)).emit(event, data);
};

/**
 * Emit to all users in a tenant.
 */
export const emitToTenant = <T>(io: Server, tenantId: string, event: string, data: T): void => {
  io.to(Rooms.tenant(tenantId)).emit(event, data);
};
