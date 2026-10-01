import { describe, expect, it } from 'vitest';
import {
  generateManufacturingRecords,
  validateManufacturingRecord,
  calculateBacklogBySiteAndPriority,
  calculateDowntimeByAssetClass,
  calculatePlannedVsReactivePercentage,
  calculateMaintenanceCostByMonthAndSite,
  calculateLabourHoursPerCompletedOrder,
  calculateFormulaMeasures,
  compareQueryResult,
  verifyMakerCheckerSeparation,
  verifyPlaceScopeExclusion,
  verifyTableParity,
  assertAllStepsPassed,
} from '../../../../../../scripts/verify-manufacturing-no-developer-helpers.mjs';

function createValidEvidence() {
  return {
    authentications: {
      creator: { subject: 'usr-creator-01', role: 'Analytics Steward' },
      approver: { subject: 'usr-approver-02', role: 'Tenant Admin' },
      scopedViewer: { subject: 'usr-scoped-03', allowedSite: 'PLANT-A', deniedSite: 'PLANT-B' },
    },
    connector: {
      connectionId: 'conn-mfg-01',
      sourceUrl: 'http://host.docker.internal:5555/manufacturing-work-orders.json',
    },
    mapping: {
      mappingId: 'map-mfg-01',
      versionNumber: 1,
      mappedFieldsCount: 12,
    },
    ingestion: {
      runId: 'run-ingest-01',
      recordCount: 120,
      watermark: '2026-06-30T23:59:59Z',
      sha256: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
      status: 'COMPLETED',
    },
    dataset: {
      datasetVersionId: 'dsv-mfg-01',
      recordCount: 120,
      status: 'READY',
    },
    semanticModel: {
      modelId: 'sm-mfg-01',
      measuresCount: 5,
    },
    formula: {
      formulaId: 'fm-mfg-01',
      versionId: 'fmv-mfg-01',
      submittedBy: 'usr-creator-01',
      approvedBy: 'usr-approver-02',
      state: 'PUBLISHED',
    },
    queryComparisons: [
      { question: 'Backlog by Site and Priority', matched: true, rowCount: 12 },
      { question: 'Downtime by Asset Class', matched: true, rowCount: 4 },
      { question: 'Planned vs Reactive Work Percentage', matched: true, rowCount: 2 },
      { question: 'Maintenance Cost by Month and Site', matched: true, rowCount: 6 },
      { question: 'Labour Hours per Completed Order', matched: true, rowCount: 1 },
      { question: 'Governed Formula Measures', matched: true, rowCount: 1 },
    ],
    chartViews: [
      { id: 'cv-1', type: 'BAR' },
      { id: 'cv-2', type: 'LINE' },
    ],
    chartTypeSwitched: true,
    dashboard: {
      dashboardId: 'dash-mfg-01',
      tileCount: 3,
      sharedFilters: ['site_code', 'opened_at'],
    },
    accessibility: {
      tableParityVerified: true,
      tableRowsCount: 12,
    },
    placeScope: {
      allowedSite: 'PLANT-A',
      deniedSite: 'PLANT-B',
      allowedRowsCount: 40,
      deniedRowsCount: 0,
    },
    reingestion: {
      initialDatasetVersionId: 'dsv-mfg-01',
      secondDatasetVersionId: 'dsv-mfg-02',
      initialRecordCount: 100,
      secondRecordCount: 120,
    },
    retiredEndpoints: {
      directApi: { queryRunStatus: 404, chartsStatus: 404 },
      bff: { queryRunStatus: 404, chartsStatus: 404 },
    },
    errors: {
      browserErrors: [],
      serverErrors: [],
    },
    cleanup: {
      retainedDataAccounted: true,
      createdResourceCount: 8,
    },
  };
}

describe('Manufacturing No-Developer Proof Helpers (WI-OI-103f)', () => {
  it('generates deterministic manufacturing certification dataset with checksum', () => {
    const { records, recordCount, sha256, sites, assetClasses } = generateManufacturingRecords(100);
    expect(recordCount).toBe(100);
    expect(records.length).toBe(100);
    expect(sha256).toBeDefined();
    expect(sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(sites).toEqual(['PLANT-A', 'PLANT-B', 'PLANT-C']);
    expect(assetClasses.length).toBe(4);

    // Verify deterministic reproducibility
    const run2 = generateManufacturingRecords(100);
    expect(run2.sha256).toBe(sha256);
  });

  it('generates distinct deterministic batch records for re-ingestion testing', () => {
    const batch1 = generateManufacturingRecords(50, 1);
    const batch2 = generateManufacturingRecords(50, 2);
    expect(batch1.sha256).not.toBe(batch2.sha256);
    expect(batch1.records[0].work_order_id).toContain('B1');
    expect(batch2.records[0].work_order_id).toContain('B2');
  });

  it('validates required manufacturing fields on generated records', () => {
    const { records } = generateManufacturingRecords(50);
    for (const r of records) {
      expect(validateManufacturingRecord(r)).toBe(true);
      expect(r.data_origin).toBe('CERTIFICATION_WI_OI_103F');
    }
  });

  it('fails validation when mandatory fields are missing or invalid', () => {
    expect(() => validateManufacturingRecord({ work_order_id: 'WO-1' })).toThrow(/missing required field/);
    expect(() =>
      validateManufacturingRecord({
        work_order_id: 'WO-1',
        site_code: 'PLANT-A',
        asset_id: 'AST-1',
        asset_class: 'CNC',
        priority: 'HIGH',
        work_type: 'PREVENTIVE',
        status: 'OPEN',
        opened_at: '2026-06-01T00:00:00Z',
        downtime_minutes: -5,
        labour_hours: 1,
        maintenance_cost: 100,
        planned_work_order: true,
      }),
    ).toThrow(/Invalid downtime_minutes/);
  });

  it('computes Question 1: Open work-order backlog by site and priority', () => {
    const { records } = generateManufacturingRecords(60);
    const backlog = calculateBacklogBySiteAndPriority(records);
    expect(Object.keys(backlog).length).toBeGreaterThan(0);
    for (const [key, count] of Object.entries(backlog)) {
      expect(key).toMatch(/PLANT-[ABC]:(CRITICAL|HIGH|MEDIUM|LOW)/);
      expect(count).toBeGreaterThan(0);
    }
  });

  it('compares actual query result for Question 1 with expected calculation', () => {
    const { records } = generateManufacturingRecords(60);
    const expected = calculateBacklogBySiteAndPriority(records);
    const expectedCount = Object.values(expected).reduce((a, b) => a + b, 0);

    const actual = {
      columns: ['site_code', 'priority', 'count'],
      rows: [['PLANT-A', 'HIGH', expectedCount]],
    };
    const compared = compareQueryResult('Backlog by Site and Priority', actual, expected);
    expect(compared.matched).toBe(true);
    expect(compared.rowCount).toBe(1);
  });

  it('fails compareQueryResult when actual result returns 0 rows', () => {
    expect(() =>
      compareQueryResult('Any Question', { columns: ['c'], rows: [] }, {}),
    ).toThrow(/returned 0 rows/);
  });

  it('computes Question 2: Downtime or MTTR by asset class', () => {
    const { records } = generateManufacturingRecords(60);
    const downtime = calculateDowntimeByAssetClass(records);
    expect(Object.keys(downtime)).toContain('CNC_MACHINING');
    expect(Object.keys(downtime)).toContain('STAMPING_PRESS');
    for (const assetClass of Object.values(downtime)) {
      expect(assetClass.count).toBeGreaterThan(0);
      expect(assetClass.meanDowntimeMinutes).toBeGreaterThanOrEqual(0);
    }
  });

  it('computes Question 3: Planned versus reactive work percentage', () => {
    const { records } = generateManufacturingRecords(60);
    const split = calculatePlannedVsReactivePercentage(records);
    expect(split.total).toBe(60);
    expect(split.plannedPercent + split.reactivePercent).toBeCloseTo(100, 1);
  });

  it('computes Question 4: Maintenance cost by month and site', () => {
    const { records } = generateManufacturingRecords(60);
    const costs = calculateMaintenanceCostByMonthAndSite(records);
    for (const [key, cost] of Object.entries(costs)) {
      expect(key).toMatch(/^\d{4}-\d{2}:PLANT-[ABC]$/);
      expect(cost).toBeGreaterThan(0);
    }
  });

  it('computes Question 5: Labour hours per completed work order', () => {
    const { records } = generateManufacturingRecords(60);
    const avgHours = calculateLabourHoursPerCompletedOrder(records);
    expect(avgHours).toBeGreaterThan(0);
  });

  it('computes Question 6: Governed formula measures', () => {
    const { records } = generateManufacturingRecords(60);
    const formulas = calculateFormulaMeasures(records);
    expect(formulas.cost_per_work_order).toBeGreaterThan(0);
    expect(formulas.downtime_per_completed_order).toBeGreaterThan(0);
    expect(formulas.planned_work_percentage).toBeGreaterThan(0);
    expect(formulas.planned_work_percentage).toBeLessThanOrEqual(100);
  });

  it('enforces maker-checker separation: creator and approver must differ', () => {
    expect(verifyMakerCheckerSeparation('user-creator-1', 'user-approver-2')).toBe(true);
    expect(() => verifyMakerCheckerSeparation('user-same-1', 'user-same-1')).toThrow(/Maker-checker separation failure/);
  });

  it('enforces place scope exclusion: rejects out-of-scope records and requires allowed records', () => {
    const scopedRecords = [
      { work_order_id: 'WO-1', site_code: 'PLANT-A', cost: 100 },
      { work_order_id: 'WO-2', site_code: 'PLANT-A', cost: 200 },
    ];
    expect(verifyPlaceScopeExclusion(scopedRecords, 'PLANT-A', 'PLANT-B')).toBe(true);

    const leakedRecords = [
      { work_order_id: 'WO-1', site_code: 'PLANT-A', cost: 100 },
      { work_order_id: 'WO-2', site_code: 'PLANT-B', cost: 200 },
    ];
    expect(() => verifyPlaceScopeExclusion(leakedRecords, 'PLANT-A', 'PLANT-B')).toThrow(/Spatial leakage/);
  });

  it('verifies accessible table parity with server query results', () => {
    const table = [{ label: 'Cost', value: '500' }];
    const server = [{ label: 'Cost', value: '500' }];
    expect(verifyTableParity(table, server)).toBe(true);

    const mismatched = [{ label: 'Cost', value: '999' }];
    expect(() => verifyTableParity(mismatched, server)).toThrow(/Table parity error/);
  });

  // ── Requirement 14: Rejection of Boolean Self-Attestation ───────────────────

  it('fails assertAllStepsPassed when given only boolean self-attestation without structural evidence', () => {
    const booleanSelfAttestation = {
      sourceConnected: true,
      schemaDiscovered: true,
      recordsIngested: true,
      datasetPublished: true,
      semanticModelCreated: true,
      formulaSubmitted: true,
      formulaApprovedBySecondIdentity: true,
      chartViewsSaved: true,
      chartTypeSwitched: true,
      dashboardCreated: true,
      accessibleTableVerified: true,
      placeScopeEnforced: true,
      reingestionVersioned: true,
    };
    expect(() => assertAllStepsPassed(booleanSelfAttestation)).toThrow(/missing authentications evidence/);
  });

  it('passes assertAllStepsPassed on complete genuine evidence', () => {
    const evidence = createValidEvidence();
    expect(assertAllStepsPassed(evidence)).toBe(true);
  });

  it('fails assertAllStepsPassed if maker-checker separation is violated', () => {
    const evidence = createValidEvidence();
    evidence.authentications.approver.subject = evidence.authentications.creator.subject;
    expect(() => assertAllStepsPassed(evidence)).toThrow(/Maker-checker separation violated/);
  });

  it('fails assertAllStepsPassed if place scope leaks denied site rows', () => {
    const evidence = createValidEvidence();
    evidence.placeScope.deniedRowsCount = 3;
    expect(() => assertAllStepsPassed(evidence)).toThrow(/Place scope leaked 3 rows/);
  });

  it('fails assertAllStepsPassed if re-ingestion does not yield a new immutable version ID', () => {
    const evidence = createValidEvidence();
    evidence.reingestion.secondDatasetVersionId = evidence.reingestion.initialDatasetVersionId;
    expect(() => assertAllStepsPassed(evidence)).toThrow(/new immutable dataset version ID/);
  });

  it('fails assertAllStepsPassed if retired endpoints do not return 404', () => {
    const evidence = createValidEvidence();
    evidence.retiredEndpoints.directApi.queryRunStatus = 200;
    expect(() => assertAllStepsPassed(evidence)).toThrow(/Direct Analytics API did not return 404/);
  });

  it('fails assertAllStepsPassed if browser or server errors are present', () => {
    const evidence = createValidEvidence();
    evidence.errors.browserErrors.push('Uncaught TypeError: Cannot read properties of undefined');
    expect(() => assertAllStepsPassed(evidence)).toThrow(/Certification encountered browser errors/);
  });
});
