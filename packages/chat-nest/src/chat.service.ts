import { Injectable } from '@nestjs/common';
import { generateId } from '@gigalibs/crypto';
import type { ChatMessage } from '@gigalibs/chat-core';

@Injectable()
export class ChatService {
  private messages: ChatMessage[] = [];

  async saveMessage(input: {
    channelId: string;
    senderId: string;
    content: string;
    attachments?: any[];
  }): Promise<ChatMessage> {
    const msg: ChatMessage = {
      id: generateId(),
      channelId: input.channelId,
      senderId: input.senderId,
      content: input.content,
      attachments: input.attachments,
      reactions: {},
      createdAt: new Date(),
    };
    this.messages.push(msg);
    return msg;
  }

  async getChannelMessages(channelId: string, limit = 50): Promise<ChatMessage[]> {
    return this.messages
      .filter((m) => m.channelId === channelId)
      .slice(-limit);
  }
}
