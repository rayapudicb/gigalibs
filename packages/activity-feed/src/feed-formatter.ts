import { generateId } from '@gigalibs/crypto';
import type { ActivityFeedItem } from './types.js';

export class ActivityFeedFormatter {
  static createItem(
    actor: { id: string; name: string; avatarUrl?: string },
    verb: ActivityFeedItem['verb'],
    object: { type: string; id: string; title: string },
    tenantId: string,
  ): ActivityFeedItem {
    return {
      id: generateId(),
      tenantId,
      actor,
      verb,
      object,
      summary: `${actor.name} ${verb} ${object.type} "${object.title}"`,
      timestamp: new Date(),
    };
  }
}
