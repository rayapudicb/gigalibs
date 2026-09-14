import { createHash, randomUUID } from 'node:crypto';

export type SovereignTenantId = 'defense' | 'energy' | 'treasury';

export interface ConnectorRecord {
  id: string;
  tenantId: SovereignTenantId;
  connectorCode: 'USASPENDING' | 'EIA_GRID' | 'TREASURY_DTS';
  recordKey: string;
  entityName: string;
  category: string;
  metricValue: number;
  unit: string;
  dateOrTimestamp: string;
  payload: Record<string, any>;
  sha256Checksum: string;
  syncedAt: string;
}

export interface TenantCheckpoint {
  tenantId: SovereignTenantId;
  tenantName: string;
  subdomain: string;
  planCode: string;
  planName: string;
  userSeats: number;
  monthlyFeeUsd: number;
  connectorCode: 'USASPENDING' | 'EIA_GRID' | 'TREASURY_DTS';
  connectorName: string;
  targetEndpoint: string;
  status: 'HEALTHY' | 'SYNCING' | 'DEGRADED';
  lastSyncedAt: string;
  cursor: string;
  recordCount: number;
  lastSha256: string;
}

// In-Memory Persistent Multi-Tenant Store (Server-Side Singleton)
class TenantIngestionStore {
  private checkpoints: Map<SovereignTenantId, TenantCheckpoint> = new Map();
  private records: Map<SovereignTenantId, Map<string, ConnectorRecord>> = new Map();

  constructor() {
    this.initializeDefaultTenants();
  }

  private initializeDefaultTenants() {
    // 1. Tenant: Federal Defense & Aerospace Systems
    this.checkpoints.set('defense', {
      tenantId: 'defense',
      tenantName: 'Federal Defense & Aerospace Systems',
      subdomain: 'defense.localhost:5180',
      planCode: 'SCALE_ENTERPRISE',
      planName: 'Scale Enterprise Sovereign',
      userSeats: 100,
      monthlyFeeUsd: 4800,
      connectorCode: 'USASPENDING',
      connectorName: 'USASpending.gov & SAM.gov Federal Ingestion',
      targetEndpoint: 'https://api.usaspending.gov/api/v2/spending/',
      status: 'HEALTHY',
      lastSyncedAt: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
      cursor: 'fy=2026&qtr=1&agency=097',
      recordCount: 8,
      lastSha256: '7f9c81b2a9d1045e82b7194820c74191a82b9381710928410294817204918234',
    });

    // Seed initial real-world DoD obligation records into defense tenant
    const defenseMap = new Map<string, ConnectorRecord>();
    const initialDefenseRecords: Omit<ConnectorRecord, 'sha256Checksum' | 'syncedAt'>[] = [
      {
        id: 'rec-dod-001',
        tenantId: 'defense',
        connectorCode: 'USASPENDING',
        recordKey: 'DOD-ARMY-CORPS-2026',
        entityName: 'Department of the Army',
        category: 'Mission Command & C4ISR Architecture',
        metricValue: 184500000000,
        unit: 'USD',
        dateOrTimestamp: '2026-09-01',
        payload: {
          subTier: 'U.S. Army Corps of Engineers',
          solicitationNumber: 'W912DY-26-R-0044',
          naicsCode: '541512',
          obligatedAmount: 184500000000,
        },
      },
      {
        id: 'rec-dod-002',
        tenantId: 'defense',
        connectorCode: 'USASPENDING',
        recordKey: 'DOD-NAVY-SYSTEMS-2026',
        entityName: 'Department of the Navy',
        category: 'Naval Sea Systems Command (NAVSEA)',
        metricValue: 210800000000,
        unit: 'USD',
        dateOrTimestamp: '2026-09-02',
        payload: {
          subTier: 'Naval Sea Systems Command',
          solicitationNumber: 'N00024-26-R-5510',
          naicsCode: '336611',
          obligatedAmount: 210800000000,
        },
      },
      {
        id: 'rec-dod-003',
        tenantId: 'defense',
        connectorCode: 'USASPENDING',
        recordKey: 'DOD-AIRFORCE-SPACE-2026',
        entityName: 'Department of the Air Force',
        category: 'Space Force Satellite Tracking & Launch',
        metricValue: 195400000000,
        unit: 'USD',
        dateOrTimestamp: '2026-09-02',
        payload: {
          subTier: 'Space Systems Command',
          solicitationNumber: 'FA8811-26-R-0019',
          naicsCode: '541715',
          obligatedAmount: 195400000000,
        },
      },
      {
        id: 'rec-dod-004',
        tenantId: 'defense',
        connectorCode: 'USASPENDING',
        recordKey: 'DOD-DISA-CLOUD-2026',
        entityName: 'Defense Information Systems Agency',
        category: 'JWCC Multi-Cloud Sovereign Enclave',
        metricValue: 125000000000,
        unit: 'USD',
        dateOrTimestamp: '2026-09-03',
        payload: {
          subTier: 'Defense Information Technology Contracting Organization',
          solicitationNumber: 'HC1028-26-R-0081',
          naicsCode: '518210',
          obligatedAmount: 125000000000,
        },
      },
    ];

    for (const r of initialDefenseRecords) {
      const sha = createHash('sha256').update(JSON.stringify(r.payload)).digest('hex');
      defenseMap.set(r.recordKey, {
        ...r,
        sha256Checksum: sha,
        syncedAt: new Date().toISOString(),
      });
    }
    this.records.set('defense', defenseMap);

    // 2. Tenant: CleanGrid Regional Utilities
    this.checkpoints.set('energy', {
      tenantId: 'energy',
      tenantName: 'CleanGrid Regional Utilities',
      subdomain: 'energy.localhost:5180',
      planCode: 'GROWTH',
      planName: 'Growth Utility Tier',
      userSeats: 50,
      monthlyFeeUsd: 1500,
      connectorCode: 'EIA_GRID',
      connectorName: 'U.S. Energy Information Administration (EIA.gov v2)',
      targetEndpoint: 'https://api.eia.gov/v2/electricity/rto/region-data/data/',
      status: 'HEALTHY',
      lastSyncedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      cursor: 'respondent=CISO&type=D&frequency=hourly',
      recordCount: 6,
      lastSha256: '9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b',
    });

    const energyMap = new Map<string, ConnectorRecord>();
    const initialEnergyRecords: Omit<ConnectorRecord, 'sha256Checksum' | 'syncedAt'>[] = [
      {
        id: 'rec-eia-001',
        tenantId: 'energy',
        connectorCode: 'EIA_GRID',
        recordKey: 'CISO-2026-09-04-0800',
        entityName: 'California ISO (CAISO)',
        category: 'Electric Grid Real-Time Demand',
        metricValue: 28450,
        unit: 'MW',
        dateOrTimestamp: '2026-09-04T08:00:00Z',
        payload: { respondent: 'CISO', demandMw: 28450, solarMw: 8400, windMw: 2100 },
      },
      {
        id: 'rec-eia-002',
        tenantId: 'energy',
        connectorCode: 'EIA_GRID',
        recordKey: 'CISO-2026-09-04-1200',
        entityName: 'California ISO (CAISO)',
        category: 'Electric Grid Real-Time Demand',
        metricValue: 34200,
        unit: 'MW',
        dateOrTimestamp: '2026-09-04T12:00:00Z',
        payload: { respondent: 'CISO', demandMw: 34200, solarMw: 14800, windMw: 1950 },
      },
      {
        id: 'rec-eia-003',
        tenantId: 'energy',
        connectorCode: 'EIA_GRID',
        recordKey: 'ERCOT-2026-09-04-0800',
        entityName: 'ERCOT Texas Interconnection',
        category: 'Electric Grid Real-Time Demand',
        metricValue: 62100,
        unit: 'MW',
        dateOrTimestamp: '2026-09-04T08:00:00Z',
        payload: { respondent: 'ERCOT', demandMw: 62100, solarMw: 11200, windMw: 16400 },
      },
      {
        id: 'rec-eia-004',
        tenantId: 'energy',
        connectorCode: 'EIA_GRID',
        recordKey: 'ERCOT-2026-09-04-1200',
        entityName: 'ERCOT Texas Interconnection',
        category: 'Electric Grid Real-Time Demand',
        metricValue: 71500,
        unit: 'MW',
        dateOrTimestamp: '2026-09-04T12:00:00Z',
        payload: { respondent: 'ERCOT', demandMw: 71500, solarMw: 17300, windMw: 14200 },
      },
    ];

    for (const r of initialEnergyRecords) {
      const sha = createHash('sha256').update(JSON.stringify(r.payload)).digest('hex');
      energyMap.set(r.recordKey, {
        ...r,
        sha256Checksum: sha,
        syncedAt: new Date().toISOString(),
      });
    }
    this.records.set('energy', energyMap);

    // 3. Tenant: Sovereign Public Treasury Group
    this.checkpoints.set('treasury', {
      tenantId: 'treasury',
      tenantName: 'Sovereign Public Treasury Group',
      subdomain: 'treasury.localhost:5180',
      planCode: 'ENTERPRISE',
      planName: 'Enterprise FinOps & Treasury',
      userSeats: 25,
      monthlyFeeUsd: 800,
      connectorCode: 'TREASURY_DTS',
      connectorName: 'FiscalData.treasury.gov Daily Statement (DTS Table 1)',
      targetEndpoint: 'https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/dts/dts_table_1',
      status: 'HEALTHY',
      lastSyncedAt: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
      cursor: 'record_date:gte:2026-08-01',
      recordCount: 5,
      lastSha256: '4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c',
    });

    const treasuryMap = new Map<string, ConnectorRecord>();
    const initialTreasuryRecords: Omit<ConnectorRecord, 'sha256Checksum' | 'syncedAt'>[] = [
      {
        id: 'rec-dts-001',
        tenantId: 'treasury',
        connectorCode: 'TREASURY_DTS',
        recordKey: 'DTS-2026-09-01-CASH',
        entityName: 'U.S. Treasury Operating Cash',
        category: 'Federal Reserve Account Closing Balance',
        metricValue: 842150000000,
        unit: 'USD',
        dateOrTimestamp: '2026-09-01',
        payload: {
          accountType: 'Federal Reserve Account',
          closingBalanceUsd: 842150000000,
          grossDeposits: 28400000000,
          grossWithdrawals: 21900000000,
        },
      },
      {
        id: 'rec-dts-002',
        tenantId: 'treasury',
        connectorCode: 'TREASURY_DTS',
        recordKey: 'DTS-2026-09-02-CASH',
        entityName: 'U.S. Treasury Operating Cash',
        category: 'Federal Reserve Account Closing Balance',
        metricValue: 849650000000,
        unit: 'USD',
        dateOrTimestamp: '2026-09-02',
        payload: {
          accountType: 'Federal Reserve Account',
          closingBalanceUsd: 849650000000,
          grossDeposits: 31200000000,
          grossWithdrawals: 23700000000,
        },
      },
      {
        id: 'rec-dts-003',
        tenantId: 'treasury',
        connectorCode: 'TREASURY_DTS',
        recordKey: 'DTS-2026-09-03-CASH',
        entityName: 'U.S. Treasury Operating Cash',
        category: 'Federal Reserve Account Closing Balance',
        metricValue: 855100000000,
        unit: 'USD',
        dateOrTimestamp: '2026-09-03',
        payload: {
          accountType: 'Federal Reserve Account',
          closingBalanceUsd: 855100000000,
          grossDeposits: 29500000000,
          grossWithdrawals: 24050000000,
        },
      },
    ];

    for (const r of initialTreasuryRecords) {
      const sha = createHash('sha256').update(JSON.stringify(r.payload)).digest('hex');
      treasuryMap.set(r.recordKey, {
        ...r,
        sha256Checksum: sha,
        syncedAt: new Date().toISOString(),
      });
    }
    this.records.set('treasury', treasuryMap);
  }

  public getCheckpoints(): TenantCheckpoint[] {
    return Array.from(this.checkpoints.values());
  }

  public getCheckpoint(tenantId: SovereignTenantId): TenantCheckpoint | undefined {
    return this.checkpoints.get(tenantId);
  }

  public updateCheckpoint(tenantId: SovereignTenantId, updates: Partial<TenantCheckpoint>) {
    const existing = this.checkpoints.get(tenantId);
    if (!existing) return;
    this.checkpoints.set(tenantId, { ...existing, ...updates });
  }

  public getRecords(tenantId: SovereignTenantId): ConnectorRecord[] {
    const tenantMap = this.records.get(tenantId);
    if (!tenantMap) return [];
    return Array.from(tenantMap.values()).sort(
      (a, b) => new Date(b.dateOrTimestamp).getTime() - new Date(a.dateOrTimestamp).getTime()
    );
  }

  public upsertRecord(record: Omit<ConnectorRecord, 'id' | 'syncedAt'>): ConnectorRecord {
    let tenantMap = this.records.get(record.tenantId);
    if (!tenantMap) {
      tenantMap = new Map<string, ConnectorRecord>();
      this.records.set(record.tenantId, tenantMap);
    }

    const existing = tenantMap.get(record.recordKey);
    const id = existing?.id || `rec-${randomUUID()}`;
    const syncedAt = new Date().toISOString();

    const fullRecord: ConnectorRecord = {
      ...record,
      id,
      syncedAt,
    };

    tenantMap.set(record.recordKey, fullRecord);

    // Update checkpoint counts
    const cp = this.checkpoints.get(record.tenantId);
    if (cp) {
      this.checkpoints.set(record.tenantId, {
        ...cp,
        recordCount: tenantMap.size,
        lastSyncedAt: syncedAt,
        lastSha256: record.sha256Checksum,
      });
    }

    return fullRecord;
  }
}

// Global Singleton
const globalForStore = globalThis as unknown as { tenantIngestionStore?: TenantIngestionStore };
export const tenantIngestionStore = globalForStore.tenantIngestionStore ?? new TenantIngestionStore();
if (process.env.NODE_ENV !== 'production') globalForStore.tenantIngestionStore = tenantIngestionStore;
