import { generateId } from '@gigalibs/crypto';
import type { Tag } from './types.js';

const PALETTE = ['#ef4444', '#f97316', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];

export class TagManager {
  static generateColor(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % PALETTE.length;
    return PALETTE[index] ?? '#3b82f6';
  }

  static createTag(tenantId: string, name: string, category?: string, color?: string): Tag {
    const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');
    return {
      id: generateId(),
      tenantId,
      name: name.trim(),
      slug,
      color: color ?? this.generateColor(name),
      category,
    };
  }
}
