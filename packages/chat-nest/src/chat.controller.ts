import { Controller, Get, Param, Query } from '@nestjs/common';
import { ChatService } from './chat.service.js';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('channels/:channelId/messages')
  async getMessages(
    @Param('channelId') channelId: string,
    @Query('limit') limit?: number,
  ) {
    return this.chatService.getChannelMessages(channelId, limit ? Number(limit) : 50);
  }
}
