export class ChatMessageProcessor {
  /**
   * Toggle a reaction on a message. Returns updated reactions map.
   */
  static toggleReaction(
    currentReactions: Record<string, string[]> = {},
    emoji: string,
    userId: string,
  ): Record<string, string[]> {
    const updated = { ...currentReactions };
    const userList = updated[emoji] ? [...updated[emoji]] : [];

    const existingIndex = userList.indexOf(userId);
    if (existingIndex > -1) {
      userList.splice(existingIndex, 1);
      if (userList.length === 0) {
        delete updated[emoji];
      } else {
        updated[emoji] = userList;
      }
    } else {
      userList.push(userId);
      updated[emoji] = userList;
    }

    return updated;
  }

  /**
   * Sanitize text message content and parse mentions.
   */
  static extractMentions(content: string): string[] {
    const mentionRegex = /@([a-zA-Z0-9_-]+)/g;
    const matches = content.match(mentionRegex);
    if (!matches) return [];
    return Array.from(new Set(matches.map((m) => m.substring(1))));
  }
}
