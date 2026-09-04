import type { AIMessage } from './types.js';

export class ContextWindowManager {
  /**
   * Rough token estimation (~4 characters per token in English).
   */
  static estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Trims conversation history to fit within maxTokens, preserving the system message.
   */
  static trimHistory(
    messages: AIMessage[],
    maxTokens = 4096,
  ): AIMessage[] {
    if (messages.length === 0) return [];

    let systemMessage: AIMessage | undefined;
    let nonSystemMessages = messages;

    if (messages[0]?.role === 'system') {
      systemMessage = messages[0];
      nonSystemMessages = messages.slice(1);
    }

    let tokenCount = systemMessage ? this.estimateTokens(systemMessage.content) : 0;
    const keptMessages: AIMessage[] = [];

    // Keep most recent messages first
    for (let i = nonSystemMessages.length - 1; i >= 0; i--) {
      const msg = nonSystemMessages[i];
      if (!msg) continue;
      const msgTokens = this.estimateTokens(msg.content);

      if (tokenCount + msgTokens > maxTokens) {
        break;
      }

      tokenCount += msgTokens;
      keptMessages.unshift(msg);
    }

    return systemMessage ? [systemMessage, ...keptMessages] : keptMessages;
  }
}
