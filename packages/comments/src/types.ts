export interface CommentItem {
  id: string;
  tenantId: string;
  resource: string; // e.g. 'invoice', 'task', 'user'
  resourceId: string;
  authorId: string;
  content: string;
  parentId?: string | null; // threaded reply
  mentions: string[];
  reactions: Record<string, string[]>;
  createdAt: Date;
  updatedAt?: Date | null;
}
