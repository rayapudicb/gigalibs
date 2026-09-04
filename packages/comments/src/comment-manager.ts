import { generateId } from '@gigalibs/crypto';
import type { CommentItem } from './types.js';

export class CommentManager {
  /**
   * Parse @username mentions from text
   */
  static extractMentions(text: string): string[] {
    const regex = /@([a-zA-Z0-9_-]+)/g;
    const matches = text.match(regex);
    if (!matches) return [];
    return Array.from(new Set(matches.map((m) => m.substring(1))));
  }

  static createComment(input: {
    tenantId: string;
    resource: string;
    resourceId: string;
    authorId: string;
    content: string;
    parentId?: string | null;
  }): CommentItem {
    return {
      id: generateId(),
      tenantId: input.tenantId,
      resource: input.resource,
      resourceId: input.resourceId,
      authorId: input.authorId,
      content: input.content,
      parentId: input.parentId ?? null,
      mentions: this.extractMentions(input.content),
      reactions: {},
      createdAt: new Date(),
    };
  }
}
