export type ChannelType = 'DIRECT' | 'GROUP' | 'PUBLIC';

export interface ChatMessage {
  id: string;
  channelId: string;
  senderId: string;
  content: string;
  attachments?: Array<{
    url: string;
    filename: string;
    contentType: string;
    size: number;
  }>;
  reactions?: Record<string, string[]>; // emoji -> list of userIds
  parentId?: string | null;            // for threaded replies
  editedAt?: Date | null;
  createdAt: Date;
}

export interface ReadReceipt {
  channelId: string;
  userId: string;
  lastReadMessageId: string;
  readAt: Date;
}
