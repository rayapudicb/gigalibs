import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { BaseGateway, RealtimeEvents, Rooms, broadcastToRoom } from '@gigalibs/realtime';
import { verifyJwt } from '@gigalibs/auth-core';
import { ChatService } from './chat.service.js';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/chat',
})
export class ChatGateway extends BaseGateway {
  @WebSocketServer()
  override server!: Server;

  constructor(private readonly chatService: ChatService) {
    super();
  }

  protected async authenticate(client: Socket): Promise<{ userId: string; tenantId: string } | null> {
    const token = client.handshake.auth?.['token'] || client.handshake.headers?.['authorization']?.replace('Bearer ', '');
    if (!token) return null;

    const secret = process.env['JWT_ACCESS_SECRET'] ?? 'default-secret-32-chars-minimum-key';
    const payload = verifyJwt(token, secret);
    if (!payload || !payload.sub) return null;

    return {
      userId: payload.sub,
      tenantId: payload.tid ?? 'default',
    };
  }

  @SubscribeMessage(RealtimeEvents.CHAT_MESSAGE)
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { channelId: string; content: string; attachments?: any[] },
  ) {
    const userId = client.data['userId'] as string;
    const message = await this.chatService.saveMessage({
      channelId: data.channelId,
      senderId: userId,
      content: data.content,
      attachments: data.attachments,
    });

    broadcastToRoom(this.server, Rooms.channel(data.channelId), RealtimeEvents.CHAT_MESSAGE, message);
    return message;
  }

  @SubscribeMessage(RealtimeEvents.CHAT_TYPING_START)
  handleTypingStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { channelId: string },
  ) {
    const userId = client.data['userId'] as string;
    broadcastToRoom(
      this.server,
      Rooms.channel(data.channelId),
      RealtimeEvents.CHAT_TYPING_START,
      { channelId: data.channelId, userId },
      client.id,
    );
  }
}
