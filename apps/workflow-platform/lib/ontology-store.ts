import { createHash } from 'node:crypto';
import type { SovereignTenantId } from './tenant-ingestion-store';

export type EntityType = 'PARTY' | 'AGREEMENT' | 'TRANSACTION' | 'ASSET';

export interface PartyEntity {
  id: string;
  code: string;
  tenantId: SovereignTenantId;
  name: string;
  category: 'SUPPLIER' | 'CUSTOMER' | 'FEDERAL_AGENCY' | 'REGIONAL_OPERATOR';
  taxId: string;
  country: string;
  riskTier: 'LOW' | 'MEDIUM' | 'HIGH';
  creditScore: number;
  activeAgreementsCount: number;
  totalTransactionVolumeUsd: number;
}

export interface AgreementEntity {
  id: string;
  code: string;
  tenantId: SovereignTenantId;
  title: string;
  partyCode: string;
  type: 'MASTER_SERVICES_AGREEMENT' | 'PROCUREMENT_CONTRACT' | 'POWER_PURCHASE_AGREEMENT' | 'TREASURY_ACCOUNT_ACCORD';
  status: 'ACTIVE' | 'DISPUTED' | 'EXPIRING_SOON';
  effectiveDate: string;
  expirationDate: string;
  totalValueUsd: number;
  paymentTerms: string;
  governingLaw: string;
  slaCommitment: string;
}

export interface TransactionEntity {
  id: string;
  code: string;
  tenantId: SovereignTenantId;
  partyCode: string;
  agreementCode: string;
  type: 'INVOICE' | 'DISBURSEMENT' | 'BUDGET_OBLIGATION' | 'TELEMETRY_READING';
  amountUsd: number;
  status: 'RECONCILED' | 'PENDING_MATCH' | 'DISCREPANCY_FLAGGED';
  date: string;
  discrepancyAmountUsd?: number;
  fipsSha256Checksum: string;
}

export interface AssetEntity {
  id: string;
  code: string;
  tenantId: SovereignTenantId;
  name: string;
  category: 'CLOUD_GPU_CLUSTER' | 'GRID_SUBSTATION' | 'FEDERAL_DATA_CENTER' | 'TREASURY_RESERVE_NODE';
  partyCode: string;
  agreementCode: string;
  operationalStatus: 'OPTIMAL' | 'DEGRADED' | 'MAINTENANCE';
  location: string;
  telemetryMetric: string;
  metricValue: string;
}

export interface OntologyEdge {
  id: string;
  sourceId: string;
  targetId: string;
  relationType:
    | 'PARTY_SIGNS_AGREEMENT'
    | 'AGREEMENT_GOVERNS_TRANSACTION'
    | 'TRANSACTION_FUNDS_ASSET'
    | 'PARTY_OPERATES_ASSET';
  label: string;
}

export interface Party360View {
  party: PartyEntity;
  agreements: AgreementEntity[];
  transactions: TransactionEntity[];
  assets: AssetEntity[];
  stats: {
    totalCommittedContractUsd: number;
    totalBilledUsd: number;
    disputedAmountUsd: number;
    matchDefectRatePercent: number;
    activeAssetCount: number;
    complianceScore: number;
  };
}

class OntologyStore {
  private parties: Map<string, PartyEntity> = new Map();
  private agreements: Map<string, AgreementEntity> = new Map();
  private transactions: Map<string, TransactionEntity> = new Map();
  private assets: Map<string, AssetEntity> = new Map();
  private edges: OntologyEdge[] = [];

  constructor() {
    this.seedOntologyGraph();
  }

  private hash(data: any): string {
    return createHash('sha256').update(typeof data === 'string' ? data : JSON.stringify(data)).digest('hex');
  }

  private seedOntologyGraph() {
    // ==========================================
    // 1. TENANT: DEFENSE (Federal & Aerospace)
    // ==========================================
    const lockheed: PartyEntity = {
      id: 'pty-def-001',
      code: 'LOCKHEED_MARTIN_DISA',
      tenantId: 'defense',
      name: 'Lockheed Martin Space & Cyber Systems',
      category: 'SUPPLIER',
      taxId: 'US-52-0941820',
      country: 'USA (Defense Industrial Base)',
      riskTier: 'LOW',
      creditScore: 840,
      activeAgreementsCount: 2,
      totalTransactionVolumeUsd: 125000000000,
    };
    this.parties.set(lockheed.id, lockheed);

    const jwccContract: AgreementEntity = {
      id: 'agr-def-001',
      code: 'AGR-JWCC-CLOUD-2026',
      tenantId: 'defense',
      title: 'Joint Warfighting Cloud Capability (JWCC) Multi-Cloud Task Order',
      partyCode: lockheed.code,
      type: 'PROCUREMENT_CONTRACT',
      status: 'ACTIVE',
      effectiveDate: '2026-01-15',
      expirationDate: '2029-01-14',
      totalValueUsd: 125000000000,
      paymentTerms: 'NET30_FAR_COMPLIANT',
      governingLaw: 'Federal Acquisition Regulation (FAR Subpart 16.5)',
      slaCommitment: '99.999% Zero-Egress Sovereign Enclave',
    };
    this.agreements.set(jwccContract.id, jwccContract);

    const invDod: TransactionEntity = {
      id: 'txn-def-001',
      code: 'INV-DOD-DISA-SEP2026',
      tenantId: 'defense',
      partyCode: lockheed.code,
      agreementCode: jwccContract.code,
      type: 'INVOICE',
      amountUsd: 4800000000,
      status: 'DISCREPANCY_FLAGGED',
      discrepancyAmountUsd: 45000000, // Price creep detected
      date: '2026-09-02',
      fipsSha256Checksum: this.hash({ inv: 'INV-DOD-DISA-SEP2026', amount: 4800000000 }),
    };
    this.transactions.set(invDod.id, invDod);

    const dgxCluster: AssetEntity = {
      id: 'ast-def-001',
      code: 'AST-DGX-H100-ENCLAVE',
      tenantId: 'defense',
      name: 'NVIDIA DGX H100 Sovereign AI Processing Cluster',
      category: 'CLOUD_GPU_CLUSTER',
      partyCode: lockheed.code,
      agreementCode: jwccContract.code,
      operationalStatus: 'OPTIMAL',
      location: 'Fort Meade IL5/IL6 Facility',
      telemetryMetric: 'GPU Thermal & Compute Utilization',
      metricValue: '78.4% Load • 58°C Avg',
    };
    this.assets.set(dgxCluster.id, dgxCluster);

    // ==========================================
    // 2. TENANT: ENERGY (CleanGrid Regional Utilities)
    // ==========================================
    const caiso: PartyEntity = {
      id: 'pty-en-002',
      code: 'CAISO_GRID_OPERATOR',
      tenantId: 'energy',
      name: 'California Independent System Operator (CAISO)',
      category: 'REGIONAL_OPERATOR',
      taxId: 'US-68-0419201',
      country: 'USA (Western Interconnection)',
      riskTier: 'LOW',
      creditScore: 820,
      activeAgreementsCount: 1,
      totalTransactionVolumeUsd: 485000000,
    };
    this.parties.set(caiso.id, caiso);

    const caisoPpa: AgreementEntity = {
      id: 'agr-en-002',
      code: 'AGR-CAISO-PPA-2026',
      tenantId: 'energy',
      title: 'Western Regional Energy Market Balancing Agreement & Tariffs',
      partyCode: caiso.code,
      type: 'POWER_PURCHASE_AGREEMENT',
      status: 'ACTIVE',
      effectiveDate: '2026-03-01',
      expirationDate: '2031-02-28',
      totalValueUsd: 485000000,
      paymentTerms: 'HOURLY_MARKET_CLEARING',
      governingLaw: 'FERC Electric Tariff Rule 21',
      slaCommitment: 'Grid Frequency Tolerance 60Hz ± 0.05Hz',
    };
    this.agreements.set(caisoPpa.id, caisoPpa);

    const gridTxn: TransactionEntity = {
      id: 'txn-en-002',
      code: 'TXN-EIA-GRID-CISO-HOUR12',
      tenantId: 'energy',
      partyCode: caiso.code,
      agreementCode: caisoPpa.code,
      type: 'TELEMETRY_READING',
      amountUsd: 1420000,
      status: 'RECONCILED',
      date: '2026-09-04',
      fipsSha256Checksum: this.hash({ caisoDemandMw: 31250, hour: 12 }),
    };
    this.transactions.set(gridTxn.id, gridTxn);

    const substation: AssetEntity = {
      id: 'ast-en-002',
      code: 'AST-CA-NORTH-500KV',
      tenantId: 'energy',
      name: 'Northern California 500kV Intertie Substation',
      category: 'GRID_SUBSTATION',
      partyCode: caiso.code,
      agreementCode: caisoPpa.code,
      operationalStatus: 'OPTIMAL',
      location: 'Sacramento Valley Intertie Node',
      telemetryMetric: 'Grid Load Throughput',
      metricValue: '31,250 MW Real-Time Demand',
    };
    this.assets.set(substation.id, substation);

    // ==========================================
    // 3. TENANT: TREASURY (Sovereign Public FinOps)
    // ==========================================
    const fedReserve: PartyEntity = {
      id: 'pty-tr-003',
      code: 'FED_RESERVE_NY',
      tenantId: 'treasury',
      name: 'Federal Reserve Bank of New York (Treasury Fiscal Agent)',
      category: 'FEDERAL_AGENCY',
      taxId: 'US-13-5819200',
      country: 'USA (Federal Reserve System)',
      riskTier: 'LOW',
      creditScore: 900,
      activeAgreementsCount: 1,
      totalTransactionVolumeUsd: 748400000000,
    };
    this.parties.set(fedReserve.id, fedReserve);

    const tgaAccord: AgreementEntity = {
      id: 'agr-tr-003',
      code: 'AGR-TGA-OPERATING-ACCORD',
      tenantId: 'treasury',
      title: 'Treasury General Account (TGA) Central Bank Clearing Accord',
      partyCode: fedReserve.code,
      type: 'TREASURY_ACCOUNT_ACCORD',
      status: 'ACTIVE',
      effectiveDate: '2025-10-01',
      expirationDate: '2030-09-30',
      totalValueUsd: 748400000000,
      paymentTerms: 'REAL_TIME_GROSS_SETTLEMENT_RTGS',
      governingLaw: 'Federal Reserve Act 12 U.S.C. § 391',
      slaCommitment: 'Continuous Clearing with FIPS 140-3 HSM Signatures',
    };
    this.agreements.set(tgaAccord.id, tgaAccord);

    const dtsDisbursement: TransactionEntity = {
      id: 'txn-tr-003',
      code: 'TXN-TREAS-DTS-TABLE1-0902',
      tenantId: 'treasury',
      partyCode: fedReserve.code,
      agreementCode: tgaAccord.code,
      type: 'DISBURSEMENT',
      amountUsd: 3700000000,
      status: 'RECONCILED',
      date: '2026-09-02',
      fipsSha256Checksum: this.hash({ dtsClosingBal: 748400000000 }),
    };
    this.transactions.set(dtsDisbursement.id, dtsDisbursement);

    const treasuryVaultNode: AssetEntity = {
      id: 'ast-tr-003',
      code: 'AST-TREAS-VAULT-HSM-01',
      tenantId: 'treasury',
      name: 'FIPS 140-3 Hardware Security Enclave & Ledger Node',
      category: 'TREASURY_RESERVE_NODE',
      partyCode: fedReserve.code,
      agreementCode: tgaAccord.code,
      operationalStatus: 'OPTIMAL',
      location: 'Treasury Depository Secure Vault',
      telemetryMetric: 'HSM Cryptographic Signature Velocity',
      metricValue: '12,450 Signatures/sec • 100% Verified',
    };
    this.assets.set(treasuryVaultNode.id, treasuryVaultNode);

    // ==========================================
    // EDGES / RELATIONSHIPS
    // ==========================================
    this.edges = [
      // Defense
      { id: 'edg-1', sourceId: lockheed.id, targetId: jwccContract.id, relationType: 'PARTY_SIGNS_AGREEMENT', label: 'Signs Master Task Order' },
      { id: 'edg-2', sourceId: jwccContract.id, targetId: invDod.id, relationType: 'AGREEMENT_GOVERNS_TRANSACTION', label: 'Governs Billing Terms' },
      { id: 'edg-3', sourceId: invDod.id, targetId: dgxCluster.id, relationType: 'TRANSACTION_FUNDS_ASSET', label: 'Funds Dedicated GPU Enclave' },
      { id: 'edg-4', sourceId: lockheed.id, targetId: dgxCluster.id, relationType: 'PARTY_OPERATES_ASSET', label: 'Operates Facility' },
      // Energy
      { id: 'edg-5', sourceId: caiso.id, targetId: caisoPpa.id, relationType: 'PARTY_SIGNS_AGREEMENT', label: 'Executes Tariff Accord' },
      { id: 'edg-6', sourceId: caisoPpa.id, targetId: gridTxn.id, relationType: 'AGREEMENT_GOVERNS_TRANSACTION', label: 'Governs Hourly Clearing' },
      { id: 'edg-7', sourceId: gridTxn.id, targetId: substation.id, relationType: 'TRANSACTION_FUNDS_ASSET', label: 'Clears Load Settlement' },
      { id: 'edg-8', sourceId: caiso.id, targetId: substation.id, relationType: 'PARTY_OPERATES_ASSET', label: 'Manages Grid Dispatch' },
      // Treasury
      { id: 'edg-9', sourceId: fedReserve.id, targetId: tgaAccord.id, relationType: 'PARTY_SIGNS_AGREEMENT', label: 'Clears Master Depository' },
      { id: 'edg-10', sourceId: tgaAccord.id, targetId: dtsDisbursement.id, relationType: 'AGREEMENT_GOVERNS_TRANSACTION', label: 'Regulates DTS Disbursements' },
      { id: 'edg-11', sourceId: dtsDisbursement.id, targetId: treasuryVaultNode.id, relationType: 'TRANSACTION_FUNDS_ASSET', label: 'Funds Secure Ledger Enclave' },
      { id: 'edg-12', sourceId: fedReserve.id, targetId: treasuryVaultNode.id, relationType: 'PARTY_OPERATES_ASSET', label: 'Hosts Custody Agent' },
    ];
  }

  public getEntities(tenantId?: SovereignTenantId) {
    const filter = (item: { tenantId: SovereignTenantId }) => !tenantId || item.tenantId === tenantId;
    return {
      parties: Array.from(this.parties.values()).filter(filter),
      agreements: Array.from(this.agreements.values()).filter(filter),
      transactions: Array.from(this.transactions.values()).filter(filter),
      assets: Array.from(this.assets.values()).filter(filter),
      edges: this.edges,
    };
  }

  public getParty360(partyIdOrCode: string): Party360View | undefined {
    const party = Array.from(this.parties.values()).find(
      (p) => p.id === partyIdOrCode || p.code === partyIdOrCode,
    );
    if (!party) return undefined;

    const agreements = Array.from(this.agreements.values()).filter((a) => a.partyCode === party.code);
    const transactions = Array.from(this.transactions.values()).filter((t) => t.partyCode === party.code);
    const assets = Array.from(this.assets.values()).filter((a) => a.partyCode === party.code);

    const totalCommittedContractUsd = agreements.reduce((acc, a) => acc + a.totalValueUsd, 0);
    const totalBilledUsd = transactions.reduce((acc, t) => acc + t.amountUsd, 0);
    const disputedAmountUsd = transactions.reduce((acc, t) => acc + (t.discrepancyAmountUsd || 0), 0);
    const flaggedCount = transactions.filter((t) => t.status === 'DISCREPANCY_FLAGGED').length;
    const matchDefectRatePercent = transactions.length > 0 ? Number(((flaggedCount / transactions.length) * 100).toFixed(1)) : 0;

    return {
      party,
      agreements,
      transactions,
      assets,
      stats: {
        totalCommittedContractUsd,
        totalBilledUsd,
        disputedAmountUsd,
        matchDefectRatePercent,
        activeAssetCount: assets.length,
        complianceScore: party.riskTier === 'LOW' ? 98 : party.riskTier === 'MEDIUM' ? 84 : 62,
      },
    };
  }
}

// Global singleton
const globalForOntology = globalThis as unknown as { ontologyStore?: OntologyStore };
export const ontologyStore = globalForOntology.ontologyStore ?? new OntologyStore();
if (process.env.NODE_ENV !== 'production') {
  globalForOntology.ontologyStore = ontologyStore;
}
