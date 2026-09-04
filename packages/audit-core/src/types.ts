export interface ObjectDiff {
  field: string;
  before: unknown;
  after: unknown;
}

export interface AuditRecord {
  id: string;
  action: string;
  resource: string;
  resourceId?: string;
  userId?: string;
  tenantId?: string;
  changes?: ObjectDiff[];
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}
