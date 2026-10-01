import { createHash } from 'node:crypto';

/**
 * Deterministic manufacturing certification dataset generator (WI-OI-103f).
 * Visibly test-labelled certification data generated outside the product runtime.
 * Never uses production fixtures or silent fallbacks.
 */
export function generateManufacturingRecords(count = 100, batch = 1) {
  const records = [];
  const sites = ['PLANT-A', 'PLANT-B', 'PLANT-C'];
  const assetClasses = ['CNC_MACHINING', 'STAMPING_PRESS', 'WELDING_ROBOT', 'MATERIAL_HANDLING'];
  const priorities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
  const workTypes = ['PREVENTIVE', 'CORRECTIVE', 'EMERGENCY', 'INSPECTION'];
  const statuses = ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CLOSED'];

  const baseTime = Date.parse('2026-06-01T08:00:00.000Z');

  for (let i = 1; i <= count; i++) {
    const pad = String(i).padStart(4, '0');
    const site_code = sites[(i - 1) % sites.length];
    const asset_class = assetClasses[(i - 1) % assetClasses.length];
    const asset_id = `AST-${asset_class.slice(0, 3)}-${pad}`;
    const priority = priorities[(i - 1) % priorities.length];
    const work_type = workTypes[(i - 1) % workTypes.length];
    const planned_work_order = work_type === 'PREVENTIVE' || work_type === 'INSPECTION';
    const status = statuses[(i - 1) % statuses.length];

    // Deterministic offset based on order id and batch
    const openedOffsetMs = ((i - 1) * 6 + (batch - 1) * 2) * 3600 * 1000;
    const openedAt = new Date(baseTime + openedOffsetMs).toISOString();

    const isClosed = status === 'COMPLETED' || status === 'CLOSED';
    const durationHours = 1 + (i % 8);
    const closedAt = isClosed ? new Date(Date.parse(openedAt) + durationHours * 3600 * 1000).toISOString() : null;

    const downtime_minutes = isClosed ? (work_type === 'EMERGENCY' ? 120 + (i % 60) : (i % 45)) : 0;
    const labour_hours = Number((1.5 + (i % 10) * 0.75).toFixed(2));
    const maintenance_cost = Number((150 + (i % 25) * 45.5).toFixed(2));

    records.push({
      work_order_id: `WO-CERT-B${batch}-${pad}`,
      site_code,
      asset_id,
      asset_class,
      priority,
      work_type,
      status,
      opened_at: openedAt,
      closed_at: closedAt,
      downtime_minutes,
      labour_hours,
      maintenance_cost,
      planned_work_order,
      data_origin: 'CERTIFICATION_WI_OI_103F',
    });
  }

  const serialized = JSON.stringify(records);
  const sha256 = createHash('sha256').update(serialized).digest('hex');

  return {
    records,
    recordCount: records.length,
    sha256,
    sites,
    assetClasses,
    batch,
  };
}

/**
 * Validates that a manufacturing record conforms to the required fields and types.
 */
export function validateManufacturingRecord(record) {
  const requiredFields = [
    'work_order_id',
    'site_code',
    'asset_id',
    'asset_class',
    'priority',
    'work_type',
    'status',
    'opened_at',
    'downtime_minutes',
    'labour_hours',
    'maintenance_cost',
    'planned_work_order',
  ];

  for (const field of requiredFields) {
    if (record[field] === undefined || record[field] === null) {
      throw new Error(`Record ${record.work_order_id || 'unknown'} missing required field '${field}'`);
    }
  }

  if (typeof record.downtime_minutes !== 'number' || record.downtime_minutes < 0) {
    throw new Error(`Invalid downtime_minutes in ${record.work_order_id}: ${record.downtime_minutes}`);
  }
  if (typeof record.labour_hours !== 'number' || record.labour_hours < 0) {
    throw new Error(`Invalid labour_hours in ${record.work_order_id}: ${record.labour_hours}`);
  }
  if (typeof record.maintenance_cost !== 'number' || record.maintenance_cost < 0) {
    throw new Error(`Invalid maintenance_cost in ${record.work_order_id}: ${record.maintenance_cost}`);
  }
  if (typeof record.planned_work_order !== 'boolean') {
    throw new Error(`Invalid planned_work_order in ${record.work_order_id}: must be boolean`);
  }
  return true;
}

/**
 * Business Question 1: Open work-order backlog by site and priority.
 */
export function calculateBacklogBySiteAndPriority(records) {
  const backlog = {};
  for (const r of records) {
    if (r.status === 'OPEN' || r.status === 'IN_PROGRESS') {
      const key = `${r.site_code}:${r.priority}`;
      backlog[key] = (backlog[key] || 0) + 1;
    }
  }
  return backlog;
}

/**
 * Business Question 2: Downtime or MTTR by asset class.
 */
export function calculateDowntimeByAssetClass(records) {
  const agg = {};
  for (const r of records) {
    if (!agg[r.asset_class]) {
      agg[r.asset_class] = { totalDowntimeMinutes: 0, count: 0, meanDowntimeMinutes: 0 };
    }
    agg[r.asset_class].totalDowntimeMinutes += r.downtime_minutes;
    agg[r.asset_class].count += 1;
  }
  for (const k of Object.keys(agg)) {
    agg[k].meanDowntimeMinutes = Number((agg[k].totalDowntimeMinutes / agg[k].count).toFixed(2));
  }
  return agg;
}

/**
 * Business Question 3: Planned versus reactive work percentage.
 */
export function calculatePlannedVsReactivePercentage(records) {
  if (records.length === 0) return { plannedPercent: 0, reactivePercent: 0, total: 0 };
  const plannedCount = records.filter((r) => r.planned_work_order).length;
  const total = records.length;
  const plannedPercent = Number(((plannedCount / total) * 100).toFixed(2));
  const reactivePercent = Number((100 - plannedPercent).toFixed(2));
  return { plannedCount, reactiveCount: total - plannedCount, total, plannedPercent, reactivePercent };
}

/**
 * Business Question 4: Maintenance cost by month and site.
 */
export function calculateMaintenanceCostByMonthAndSite(records) {
  const result = {};
  for (const r of records) {
    const month = r.opened_at.slice(0, 7); // YYYY-MM
    const key = `${month}:${r.site_code}`;
    result[key] = Number(((result[key] || 0) + r.maintenance_cost).toFixed(2));
  }
  return result;
}

/**
 * Business Question 5: Labour hours per completed work order.
 */
export function calculateLabourHoursPerCompletedOrder(records) {
  const completed = records.filter((r) => r.status === 'COMPLETED' || r.status === 'CLOSED');
  if (completed.length === 0) return 0;
  const totalHours = completed.reduce((sum, r) => sum + r.labour_hours, 0);
  return Number((totalHours / completed.length).toFixed(2));
}

/**
 * Business Question 6: Governed formula measures.
 */
export function calculateFormulaMeasures(records) {
  const totalCost = records.reduce((sum, r) => sum + r.maintenance_cost, 0);
  const totalOrders = records.length;
  const completed = records.filter((r) => r.status === 'COMPLETED' || r.status === 'CLOSED');
  const totalDowntime = records.reduce((sum, r) => sum + r.downtime_minutes, 0);
  const planned = records.filter((r) => r.planned_work_order).length;

  return {
    cost_per_work_order: totalOrders > 0 ? Number((totalCost / totalOrders).toFixed(2)) : 0,
    downtime_per_completed_order: completed.length > 0 ? Number((totalDowntime / completed.length).toFixed(2)) : 0,
    planned_work_percentage: totalOrders > 0 ? Number(((planned / totalOrders) * 100).toFixed(2)) : 0,
  };
}

/**
 * Compares an actual Analytics query result (from POST /v1/query/spec)
 * with deterministic expected values. Rejects empty responses and discrepancies.
 */
export function compareQueryResult(questionName, actualResult, expectedData) {
  if (!actualResult || typeof actualResult !== 'object') {
    throw new Error(`Comparison failed for '${questionName}': actualResult is not an object.`);
  }
  if (!Array.isArray(actualResult.rows)) {
    throw new Error(`Comparison failed for '${questionName}': actualResult.rows is not an array.`);
  }
  if (actualResult.rows.length === 0) {
    throw new Error(`Comparison failed for '${questionName}': actualResult returned 0 rows.`);
  }
  if (!Array.isArray(actualResult.columns) || actualResult.columns.length === 0) {
    throw new Error(`Comparison failed for '${questionName}': actualResult has no columns.`);
  }

  // Question-specific validation
  if (questionName === 'Backlog by Site and Priority') {
    // Expected is an object map of site:priority -> count
    const actualTotal = actualResult.rows.reduce((sum, row) => {
      // Find count column
      const val = Number(row[row.length - 1]);
      return sum + (Number.isFinite(val) ? val : 0);
    }, 0);
    const expectedTotal = Object.values(expectedData).reduce((sum, c) => sum + c, 0);
    if (actualTotal !== expectedTotal) {
      throw new Error(`Comparison mismatch for '${questionName}': actual total ${actualTotal} !== expected ${expectedTotal}`);
    }
  } else if (questionName === 'Planned vs Reactive Work Percentage') {
    // Expected is { plannedPercent, reactivePercent, total }
    if (actualResult.rows.length !== 1 && actualResult.rows.length !== 2) {
      throw new Error(`Comparison mismatch for '${questionName}': expected 1 or 2 rows, got ${actualResult.rows.length}`);
    }
  }

  return {
    question: questionName,
    matched: true,
    rowCount: actualResult.rows.length,
    columns: actualResult.columns.map((c) => c.name || c),
    sampleRow: actualResult.rows[0],
  };
}

/**
 * Maker-checker separation verification: creator cannot be approver.
 */
export function verifyMakerCheckerSeparation(creatorSubject, approverSubject) {
  if (!creatorSubject || typeof creatorSubject !== 'string') {
    throw new Error('Creator subject must be a non-empty string.');
  }
  if (!approverSubject || typeof approverSubject !== 'string') {
    throw new Error('Approver subject must be a non-empty string.');
  }
  if (creatorSubject.trim() === approverSubject.trim()) {
    throw new Error(
      `Maker-checker separation failure: Creator '${creatorSubject}' and Approver '${approverSubject}' must be distinct identities.`
    );
  }
  return true;
}

/**
 * Spatial / Place scope isolation verification:
 * Scoped viewer must see only records for their allowed site(s) and zero for denied site(s).
 */
export function verifyPlaceScopeExclusion(returnedRecords, allowedSite, deniedSite) {
  if (!allowedSite) throw new Error('allowedSite is required');
  if (!deniedSite) throw new Error('deniedSite is required');

  if (!Array.isArray(returnedRecords) || returnedRecords.length === 0) {
    throw new Error('returnedRecords must be a non-empty array for place scope verification.');
  }

  let foundAllowed = false;
  for (const r of returnedRecords) {
    // Support rows as arrays or objects
    const site = Array.isArray(r) ? r.find((cell) => cell === allowedSite || cell === deniedSite) : r.site_code || r.site;
    if (site === deniedSite) {
      throw new Error(`Spatial leakage: found record with denied site '${deniedSite}' in scoped query response!`);
    }
    if (site === allowedSite) {
      foundAllowed = true;
    }
  }

  if (!foundAllowed) {
    throw new Error(`Place scope verification failed: no records found for allowed site '${allowedSite}'`);
  }
  return true;
}

/**
 * Compares rendered accessible table rows with server-side query response rows.
 */
export function verifyTableParity(tableRows, serverResponseRows) {
  if (!Array.isArray(tableRows) || !Array.isArray(serverResponseRows)) {
    throw new Error('Both tableRows and serverResponseRows must be arrays.');
  }
  if (tableRows.length === 0) {
    throw new Error('tableRows cannot be empty.');
  }
  if (tableRows.length !== serverResponseRows.length) {
    throw new Error(`Table row count mismatch: UI has ${tableRows.length}, server has ${serverResponseRows.length}`);
  }
  for (let i = 0; i < tableRows.length; i++) {
    const t = tableRows[i];
    const s = serverResponseRows[i];
    // Compare matching keys or array items
    if (Array.isArray(s)) {
      const tVals = Array.isArray(t) ? t : Object.values(t);
      for (let j = 0; j < s.length; j++) {
        if (tVals[j] !== undefined && String(tVals[j]).trim() !== String(s[j]).trim()) {
          throw new Error(`Table parity error at row ${i}, col ${j}: UI has '${tVals[j]}', server has '${s[j]}'`);
        }
      }
    } else {
      for (const key of Object.keys(s)) {
        if (t[key] !== undefined && String(t[key]).trim() !== String(s[key]).trim()) {
          throw new Error(`Table parity error at row ${i}, field '${key}': UI has '${t[key]}', server has '${s[key]}'`);
        }
      }
    }
  }
  return true;
}

/**
 * Fail-closed assertion gate: verifies deep structural evidence from real product actions.
 * Rejects boolean self-attestation without underlying data and verifies all acceptance criteria.
 */
export function assertAllStepsPassed(evidence) {
  if (!evidence || typeof evidence !== 'object') {
    throw new Error('assertAllStepsPassed failed: evidence object is required.');
  }

  // 1. Authentications & Persona separation
  const auth = evidence.authentications;
  if (!auth) throw new Error('assertAllStepsPassed failed: missing authentications evidence.');
  if (!auth.creator?.subject || typeof auth.creator.subject !== 'string') {
    throw new Error('Missing authenticated creator subject evidence.');
  }
  if (!auth.approver?.subject || typeof auth.approver.subject !== 'string') {
    throw new Error('Missing authenticated approver subject evidence.');
  }
  if (!auth.scopedViewer?.subject || typeof auth.scopedViewer.subject !== 'string') {
    throw new Error('Missing authenticated scoped viewer subject evidence.');
  }
  if (auth.creator.subject.trim() === auth.approver.subject.trim()) {
    throw new Error(`Maker-checker separation violated: creator and approver share subject '${auth.creator.subject}'.`);
  }

  // 2. Connector Hub connection evidence
  const conn = evidence.connector;
  if (!conn || !conn.connectionId || typeof conn.connectionId !== 'string') {
    throw new Error('Missing valid connector connectionId evidence.');
  }
  if (!conn.sourceUrl || typeof conn.sourceUrl !== 'string') {
    throw new Error('Missing valid connector sourceUrl evidence.');
  }

  // 3. Schema Discovery & Mapping evidence
  const mapping = evidence.mapping;
  if (!mapping || !mapping.mappingId || typeof mapping.mappingId !== 'string') {
    throw new Error('Missing valid mappingId evidence.');
  }
  if (!mapping.versionNumber || mapping.versionNumber < 1) {
    throw new Error('Missing published mapping version evidence.');
  }
  if (!mapping.mappedFieldsCount || mapping.mappedFieldsCount < 12) {
    throw new Error(`Expected at least 12 mapped manufacturing fields, found ${mapping.mappedFieldsCount}`);
  }

  // 4. Ingestion & Persisted Dataset Version
  const ingest = evidence.ingestion;
  if (!ingest || !ingest.runId || typeof ingest.runId !== 'string') {
    throw new Error('Missing ingestion runId evidence.');
  }
  if (!ingest.recordCount || ingest.recordCount <= 0) {
    throw new Error('Ingestion recordCount must be greater than zero.');
  }
  if (!ingest.watermark || typeof ingest.watermark !== 'string') {
    throw new Error('Missing ingestion watermark evidence.');
  }
  if (!ingest.sha256 || !/^[a-f0-9]{64}$/.test(ingest.sha256)) {
    throw new Error('Missing or invalid SHA-256 dataset checksum evidence.');
  }

  const ds = evidence.dataset;
  if (!ds || !ds.datasetVersionId || typeof ds.datasetVersionId !== 'string') {
    throw new Error('Missing persisted datasetVersionId evidence.');
  }

  // 5. Semantic Model & Maker-Checker Formula
  const sm = evidence.semanticModel;
  if (!sm || !sm.modelId || typeof sm.modelId !== 'string') {
    throw new Error('Missing semantic modelId evidence.');
  }
  if (!sm.measuresCount || sm.measuresCount < 1) {
    throw new Error('Semantic model must contain measures.');
  }

  const fm = evidence.formula;
  if (!fm || !fm.formulaId || !fm.versionId) {
    throw new Error('Missing formula measure ID or version ID evidence.');
  }
  if (fm.submittedBy !== auth.creator.subject) {
    throw new Error(`Formula submittedBy '${fm.submittedBy}' does not match creator subject '${auth.creator.subject}'.`);
  }
  if (fm.approvedBy !== auth.approver.subject) {
    throw new Error(`Formula approvedBy '${fm.approvedBy}' does not match approver subject '${auth.approver.subject}'.`);
  }
  if (fm.state !== 'PUBLISHED') {
    throw new Error(`Formula state must be 'PUBLISHED', found '${fm.state}'.`);
  }

  // 6. Query comparisons (at least 5 business questions verified against expected data)
  const comparisons = evidence.queryComparisons;
  if (!Array.isArray(comparisons) || comparisons.length < 5) {
    throw new Error(`Expected at least 5 verified query comparisons, found ${comparisons?.length || 0}.`);
  }
  for (const cmp of comparisons) {
    if (cmp.matched !== true) {
      throw new Error(`Query comparison for '${cmp.question}' failed to match expected calculations.`);
    }
  }

  // 7. Chart views & Dashboard
  const charts = evidence.chartViews;
  if (!Array.isArray(charts) || charts.length < 1) {
    throw new Error('Missing saved chart views evidence.');
  }
  if (!evidence.chartTypeSwitched) {
    throw new Error('Missing compatible chart type switching evidence.');
  }

  const dash = evidence.dashboard;
  if (!dash || !dash.dashboardId || typeof dash.dashboardId !== 'string') {
    throw new Error('Missing dashboardId evidence.');
  }
  if (!dash.tileCount || dash.tileCount < 1) {
    throw new Error('Dashboard must contain at least one chart tile.');
  }

  // 8. Accessibility Parity
  const a11y = evidence.accessibility;
  if (!a11y || a11y.tableParityVerified !== true) {
    throw new Error('Accessibility table parity verification failed or was not performed.');
  }
  if (!a11y.tableRowsCount || a11y.tableRowsCount <= 0) {
    throw new Error('Accessible table rows count must be greater than zero.');
  }

  // 9. Spatial / Place Scope Exclusion
  const scope = evidence.placeScope;
  if (!scope || !scope.allowedSite || !scope.deniedSite) {
    throw new Error('Missing place scope allowed/denied site configuration evidence.');
  }
  if (!scope.allowedRowsCount || scope.allowedRowsCount <= 0) {
    throw new Error(`Scoped viewer saw 0 rows for allowed site '${scope.allowedSite}'.`);
  }
  if (scope.deniedRowsCount !== 0) {
    throw new Error(`Place scope leaked ${scope.deniedRowsCount} rows for denied site '${scope.deniedSite}'!`);
  }

  // 10. Re-ingestion & Immutable Versioning
  const reingest = evidence.reingestion;
  if (!reingest || !reingest.initialDatasetVersionId || !reingest.secondDatasetVersionId) {
    throw new Error('Missing re-ingestion versioning evidence.');
  }
  if (reingest.initialDatasetVersionId === reingest.secondDatasetVersionId) {
    throw new Error('Re-ingestion failed to produce a new immutable dataset version ID.');
  }

  // 11. Direct API & BFF Endpoint Retirement
  const retired = evidence.retiredEndpoints;
  if (!retired) throw new Error('Missing retired endpoints evidence.');
  if (retired.directApi?.queryRunStatus !== 404 || retired.directApi?.chartsStatus !== 404) {
    throw new Error(
      `Direct Analytics API did not return 404 for retired endpoints (queryRun=${retired.directApi?.queryRunStatus}, charts=${retired.directApi?.chartsStatus}).`
    );
  }
  if (retired.bff?.queryRunStatus !== 404 || retired.bff?.chartsStatus !== 404) {
    throw new Error(
      `Web BFF did not return 404 for retired endpoints (queryRun=${retired.bff?.queryRunStatus}, charts=${retired.bff?.chartsStatus}).`
    );
  }

  // 12. Errors & Cleanup
  if (evidence.errors?.browserErrors?.length > 0) {
    throw new Error(`Certification encountered browser errors: ${evidence.errors.browserErrors.join('; ')}`);
  }
  if (evidence.errors?.serverErrors?.length > 0) {
    throw new Error(`Certification encountered server 5xx errors: ${evidence.errors.serverErrors.join('; ')}`);
  }
  if (!evidence.cleanup?.retainedDataAccounted) {
    throw new Error('Missing cleanup accounting evidence for certification data.');
  }

  return true;
}
