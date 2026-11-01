import { describe, expect, it } from 'vitest';
import {
  CALIBRATION_TECHNICIAN_STATEMENT,
  CalibrationDefinitionV1Schema,
  SubmitCalibrationRecordV1Schema,
  calibrationNominal,
  evaluateCalibration,
  evaluateCalibrationPoint,
} from './calibration.js';

// WI-OI-134: the calibration math every client and the CMMS server share.
const transmitter = CalibrationDefinitionV1Schema.parse({
  inputLrv: 0, inputUrv: 100, inputUnit: 'psi', outputLrv: 4, outputUrv: 20, outputUnit: 'mA',
  toleranceValue: 0.5, testPoints: [0, 25, 50, 75, 100], intervalDays: 365,
});
const points = (values: number[]) => values.map((measuredOutput, position) => ({ position, measuredOutput }));

describe('calibration math', () => {
  it('maps test points to nominal input and ideal output (the spec example)', () => {
    expect(transmitter.testPoints.map((p) => calibrationNominal(transmitter, p))).toEqual([
      { input: 0, output: 4 }, { input: 25, output: 8 }, { input: 50, output: 12 }, { input: 75, output: 16 }, { input: 100, output: 20 },
    ]);
    expect(evaluateCalibrationPoint(transmitter, 'AS_FOUND', 2, 12.04)).toMatchObject({
      expectedOutput: 12, errorAbsolute: 0.04, errorPercentSpan: 0.25, withinTolerance: true,
    });
  });

  it('treats an error exactly at the tolerance as within it, and just beyond as outside', () => {
    expect(evaluateCalibrationPoint(transmitter, 'AS_FOUND', 2, 12.08).withinTolerance).toBe(true);
    expect(evaluateCalibrationPoint(transmitter, 'AS_FOUND', 2, 12.0801).withinTolerance).toBe(false);
    expect(evaluateCalibrationPoint(transmitter, 'AS_FOUND', 2, 11.92).errorPercentSpan).toBe(-0.5);
  });

  it('uses the applied input when the technician could not hit the nominal point', () => {
    expect(evaluateCalibrationPoint(transmitter, 'AS_FOUND', 2, 12.032, 50.2)).toMatchObject({
      appliedInput: 50.2, expectedOutput: 12.032, errorAbsolute: 0, withinTolerance: true,
    });
  });

  it('supports square-root transfer and absolute tolerance', () => {
    const flow = CalibrationDefinitionV1Schema.parse({ ...transmitter, transfer: 'SQUARE_ROOT', toleranceMode: 'ABSOLUTE', toleranceValue: 0.05 });
    expect(evaluateCalibrationPoint(flow, 'AS_FOUND', 1, 12.03)).toMatchObject({ expectedOutput: 12, errorAbsolute: 0.03, withinTolerance: true });
    expect(evaluateCalibrationPoint(flow, 'AS_FOUND', 1, 12.06).withinTolerance).toBe(false);
  });

  it('measures error against the span magnitude for a reverse-acting output', () => {
    const reverse = CalibrationDefinitionV1Schema.parse({ ...transmitter, outputLrv: 20, outputUrv: 4 });
    expect(evaluateCalibrationPoint(reverse, 'AS_FOUND', 1, 16.08)).toMatchObject({ expectedOutput: 16, errorPercentSpan: 0.5, withinTolerance: true });
  });

  it('derives PASS, ADJUSTED and FAIL', () => {
    expect(evaluateCalibration(transmitter, points([4, 8.01, 12.02, 16, 20]))).toMatchObject({
      asFoundResult: 'PASS', asLeftResult: null, overallResult: 'PASS', impactReviewRequired: false,
    });
    expect(evaluateCalibration(transmitter, points([4.2, 8.2, 12.2, 16.2, 20.2]), points([4, 8, 12.01, 16, 20]))).toMatchObject({
      asFoundResult: 'FAIL', asLeftResult: 'PASS', overallResult: 'ADJUSTED', impactReviewRequired: true,
    });
    expect(evaluateCalibration(transmitter, points([4.2, 8.2, 12.2, 16.2, 20.2]))).toMatchObject({ overallResult: 'FAIL' });
    expect(evaluateCalibration(transmitter, points([4.2, 8.2, 12.2, 16.2, 20.2]), points([4.2, 8, 12, 16, 20]))).toMatchObject({ overallResult: 'FAIL' });
    expect(evaluateCalibration(transmitter, points([4, 8, 12, 16, 20]), points([4.2, 8, 12, 16, 20]))).toMatchObject({ overallResult: 'FAIL' });
  });

  it('refuses a phase with the wrong number of points', () => {
    expect(() => evaluateCalibration(transmitter, points([4, 8, 12]))).toThrow('As-found needs 5 points.');
  });
});

describe('calibration contracts', () => {
  it('refuses unordered test points, an empty input range and a flat output range', () => {
    const issues = CalibrationDefinitionV1Schema.safeParse({ ...transmitter, testPoints: [0, 50, 25], inputUrv: 0, outputUrv: 4 });
    expect(issues.success).toBe(false);
    expect(issues.error?.issues.map((issue) => issue.path.join('.')).sort()).toEqual(['inputUrv', 'outputUrv', 'testPoints.2']);
  });

  it('requires the technician statement, ordered points and distinct standards', () => {
    const base = {
      clientOperationId: '6d3f1a52-7f5b-4f2a-9a61-1f0b8c1d2e3f', assetId: '6d3f1a52-7f5b-4f2a-9a61-1f0b8c1d2e31',
      profileId: '6d3f1a52-7f5b-4f2a-9a61-1f0b8c1d2e32', profileRevision: 1,
      standardIds: ['6d3f1a52-7f5b-4f2a-9a61-1f0b8c1d2e33'], startedAt: '2026-11-01T08:00:00Z', completedAt: '2026-11-01T08:10:00Z',
      asFound: points([4, 8, 12, 16, 20]), statement: CALIBRATION_TECHNICIAN_STATEMENT,
    };
    expect(SubmitCalibrationRecordV1Schema.safeParse(base).success).toBe(true);
    expect(SubmitCalibrationRecordV1Schema.safeParse({ ...base, statement: 'ok' }).success).toBe(false);
    expect(SubmitCalibrationRecordV1Schema.safeParse({ ...base, asFound: [...base.asFound].reverse() }).success).toBe(false);
    expect(SubmitCalibrationRecordV1Schema.safeParse({ ...base, standardIds: [base.standardIds[0], base.standardIds[0]] }).success).toBe(false);
    expect(SubmitCalibrationRecordV1Schema.safeParse({ ...base, completedAt: '2026-11-01T07:00:00Z' }).success).toBe(false);
  });
});
