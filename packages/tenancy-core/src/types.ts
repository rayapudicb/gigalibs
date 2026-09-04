/**
 * @gigalibs/tenancy-core
 *
 * Enterprise Multi-Tenant & Database Isolation Types (Vitess & Aurora Grade).
 *
 * @module
 */

export type DbIsolationMode = 'DEDICATED_DATABASE' | 'SCHEMA_ISOLATED' | 'ROW_LEVEL_SECURITY';

export type TenantClusterStatus = 'ACTIVE' | 'MAINTENANCE' | 'PROVISIONING' | 'SUSPENDED' | 'CANCELLED';

export interface TenantMetrics {
  storageUsedGb: number;
  storageLimitGb: number;
  activePoolConnections: number;
  maxPoolConnections: number;
  avgLatencyMs: number;
  monthlyApiRequests: number;
  monthlyApiLimit: number;
}

export interface TenantBackupSnapshot {
  id: string;
  tenantId: string;
  name: string;
  createdAt: string;
  sizeMb: number;
  checksum: string;
  status: 'COMPLETED' | 'IN_PROGRESS';
}

export interface TenantProfile {
  id: string;
  slug: string;
  name: string;
  status: TenantClusterStatus;
  dbMode: DbIsolationMode;
  dbHost: string;
  dbName: string;
  region: string;
  customDomain?: string | null | undefined;
  plan?: string | null | undefined;
  features: string[];
  metrics: TenantMetrics;
  backups?: TenantBackupSnapshot[] | undefined;
  createdAt: string;
}
