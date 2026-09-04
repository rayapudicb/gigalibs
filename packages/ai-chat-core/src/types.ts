export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface AIMessage {
  role: MessageRole;
  content: string;
  name?: string;
  toolCalls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

export interface AIConversation {
  id: string;
  userId: string;
  tenantId?: string;
  title: string;
  model: string;
  systemPrompt?: string;
  messages: AIMessage[];
  createdAt: Date;
  updatedAt: Date;
}
