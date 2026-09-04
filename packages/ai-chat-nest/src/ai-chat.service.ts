import type { AIConversation, AIMessage } from '@gigalibs/ai-chat-core';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';

export const AI_CHAT_PROVIDER = Symbol('AI_CHAT_PROVIDER');
export const AI_CHAT_REPOSITORY = Symbol('AI_CHAT_REPOSITORY');

export interface StreamEvent {
  data: {
    token?: string;
    done?: boolean;
    error?: string;
    messageId?: string;
  };
}

export interface AIChatProvider {
  stream(request: {
    tenantId: string;
    userId: string;
    model: string;
    messages: readonly AIMessage[];
  }): AsyncIterable<string>;
}

export interface AIChatRepository {
  create(input: {
    tenantId: string;
    userId: string;
    title: string;
    model: string;
  }): Promise<AIConversation>;
  findAuthorized(input: {
    id: string;
    tenantId: string;
    userId: string;
  }): Promise<AIConversation | null>;
  appendMessage(input: {
    conversationId: string;
    tenantId: string;
    userId: string;
    messageId: string;
    message: AIMessage;
  }): Promise<void>;
  nextMessageId(): string;
}

@Injectable()
export class AIChatService {
  constructor(
    @Inject(AI_CHAT_PROVIDER) private readonly provider: AIChatProvider,
    @Inject(AI_CHAT_REPOSITORY) private readonly repository: AIChatRepository,
  ) {}

  createConversation(input: {
    tenantId: string;
    userId: string;
    title: string;
    model: string;
  }): Promise<AIConversation> {
    this.requireBoundedText(input.tenantId, 'Tenant ID', 128);
    this.requireBoundedText(input.userId, 'User ID', 128);
    this.requireBoundedText(input.title, 'Conversation title', 200);
    this.requireBoundedText(input.model, 'Provider model', 200);
    return this.repository.create(input);
  }

  async getConversation(input: {
    id: string;
    tenantId: string;
    userId: string;
  }): Promise<AIConversation> {
    const conversation = await this.repository.findAuthorized(input);
    if (!conversation) throw new NotFoundException(`Conversation '${input.id}' was not found.`);
    return conversation;
  }

  async *streamResponse(input: {
    conversationId: string;
    tenantId: string;
    userId: string;
    userPrompt: string;
  }): AsyncGenerator<StreamEvent> {
    this.requireBoundedText(input.userPrompt, 'Prompt', 32_768);
    const conversation = await this.getConversation({
      id: input.conversationId,
      tenantId: input.tenantId,
      userId: input.userId,
    });
    const userMessage: AIMessage = { role: 'user', content: input.userPrompt };
    await this.repository.appendMessage({
      conversationId: conversation.id,
      tenantId: input.tenantId,
      userId: input.userId,
      messageId: this.repository.nextMessageId(),
      message: userMessage,
    });

    const responseMessageId = this.repository.nextMessageId();
    let response = '';
    for await (const token of this.provider.stream({
      tenantId: input.tenantId,
      userId: input.userId,
      model: conversation.model,
      messages: [...conversation.messages, userMessage],
    })) {
      if (typeof token !== 'string' || token.length === 0 || token.length > 32_768) {
        throw new Error('The AI provider emitted an invalid stream token.');
      }
      response += token;
      if (response.length > 1_000_000) {
        throw new Error('The AI provider response exceeded the configured service boundary.');
      }
      yield { data: { token } };
    }
    if (!response) throw new Error('The AI provider completed without a response.');

    await this.repository.appendMessage({
      conversationId: conversation.id,
      tenantId: input.tenantId,
      userId: input.userId,
      messageId: responseMessageId,
      message: { role: 'assistant', content: response },
    });
    yield { data: { done: true, messageId: responseMessageId } };
  }

  private requireBoundedText(value: string, label: string, maxLength: number): void {
    if (!value.trim() || value.length > maxLength) {
      throw new Error(`${label} must contain between 1 and ${maxLength} characters.`);
    }
  }
}
