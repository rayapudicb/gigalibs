export interface ActivityFeedItem {
  id: string;
  tenantId: string;
  actor: {
    id: string;
    name: string;
    avatarUrl?: string;
  };
  verb: 'created' | 'updated' | 'deleted' | 'commented' | 'approved' | 'rejected' | 'invited';
  object: {
    type: string; // e.g. 'invoice', 'ticket', 'user'
    id: string;
    title: string;
  };
  summary: string;
  timestamp: Date;
}
