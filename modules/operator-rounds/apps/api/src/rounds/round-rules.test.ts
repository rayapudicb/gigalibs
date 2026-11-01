import { describe, expect, it } from 'vitest';
import type { CaptureRoundReadingV1, RoundCheckpointDraftV1 } from '@gigalibs/contracts';
import { classifyReading, scaledDecimal, validateCheckpointSet } from './round-rules.js';

const point: RoundCheckpointDraftV1 = {
  position: 1, label: 'Pump pressure', assetRef: '10000000-0000-4000-8000-000000000007', meterRef: '10000000-0000-4000-8000-000000000008', tagCode: 'NFC-01',
  proofMode: 'NFC', readingKind: 'NUMERIC', unitCode: 'bar', nominal: '4.200000',
  redLow: '3', amberLow: '4', amberHigh: '5', redHigh: '6', choices: [], branchRules: [],
  instructions: null, photoOnException: true,
};
const reading: CaptureRoundReadingV1 = {
  clientOperationId: '10000000-0000-4000-8000-000000000001', runId: '10000000-0000-4000-8000-000000000002',
  checkpointId: '10000000-0000-4000-8000-000000000003', routeRevision: 1, expectedRunVersion: 1,
  capturedAt: '2026-10-30T08:00:00Z', source: 'MANUAL', scannedTag: 'NFC-01', numericValue: '4.3', choiceValue: null, evidenceId: null,
  proofMethod: 'NFC',
};

describe('round publication and capture invariants', () => {
  it('compares exact decimal boundaries and refuses invalid precision', () => {
    expect(scaledDecimal('4.000001')).toBe(4_000_001n);
    expect(() => scaledDecimal('4.0000001')).toThrow('six places');
    expect(classifyReading(point, reading)).toBe('NORMAL');
    expect(classifyReading(point, { ...reading, numericValue: '3.999999' })).toBe('AMBER');
    expect(classifyReading(point, { ...reading, numericValue: '2.999999' })).toBe('RED');
  });
  it('refuses a tag from another asset and backward branches', () => {
    expect(() => classifyReading(point, { ...reading, scannedTag: 'NFC-02' })).toThrow('Scan the tag');
    expect(() => validateCheckpointSet([point, { ...point, position: 2, branchRules: [{ condition: 'ALWAYS', nextPosition: 1 }] }])).toThrow('move forward');
  });
  it('classifies the physical pass, flag and fail toggle',() => {
    const booleanPoint={...point,readingKind:'BOOLEAN' as const,unitCode:null,nominal:null,
      redLow:null,amberLow:null,amberHigh:null,redHigh:null,meterRef:null};
    expect(classifyReading(booleanPoint,{...reading,numericValue:null,choiceValue:'PASS'})).toBe('NORMAL');
    expect(classifyReading(booleanPoint,{...reading,numericValue:null,choiceValue:'FLAG'})).toBe('AMBER');
    expect(classifyReading(booleanPoint,{...reading,numericValue:null,choiceValue:'FAIL'})).toBe('RED');
  });
});
