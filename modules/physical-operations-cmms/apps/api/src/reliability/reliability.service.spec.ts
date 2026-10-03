/**
 * WI-EAM-003 — Failure Mode Hierarchy & Job Plans Unit Tests
 *
 * Tests that validate the Zod contract schemas (the schema validation layer)
 * and the pure tree-building logic in ReliabilityService.
 */
import {
  CreateCmmsFailureCodeV1Schema,
  CreateCmmsJobPlanV1Schema,
  RecordCmmsFailureAttributionV1Schema,
  UpdateCmmsFailureCodeV1Schema,
} from '@gigalibs/contracts';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { parseInput } from '../common/command.js';

// ─── Failure Code Contract Validation ────────────────────────────────────────

describe('CreateCmmsFailureCodeV1Schema', () => {
  it('accepts a valid PROBLEM failure code', () => {
    const result = parseInput(CreateCmmsFailureCodeV1Schema, {
      type: 'PROBLEM',
      code: 'P-OVERHEAT',
      description: 'Overheating — equipment temperature exceeds rated limit',
    });
    expect(result.type).toBe('PROBLEM');
    expect(result.code).toBe('P-OVERHEAT');
  });

  it('accepts a CAUSE with optional parentCodeId', () => {
    const result = parseInput(CreateCmmsFailureCodeV1Schema, {
      type: 'CAUSE',
      code: 'C-COOLANT-LOSS',
      description: 'Coolant loss due to pipe failure',
      parentCodeId: null,
    });
    expect(result.type).toBe('CAUSE');
  });

  it('accepts a REMEDY type', () => {
    const result = parseInput(CreateCmmsFailureCodeV1Schema, {
      type: 'REMEDY',
      code: 'R-REPLACE-SEAL',
      description: 'Replace the bearing seal',
    });
    expect(result.type).toBe('REMEDY');
  });

  it('rejects an invalid type', () => {
    expect(() =>
      parseInput(CreateCmmsFailureCodeV1Schema, {
        type: 'UNKNOWN',
        code: 'X-001',
        description: 'Bad type',
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects missing description', () => {
    expect(() =>
      parseInput(CreateCmmsFailureCodeV1Schema, {
        type: 'PROBLEM',
        code: 'P-001',
      }),
    ).toThrow(BadRequestException);
  });

  it('uppercases the code identifier automatically', () => {
    const result = parseInput(CreateCmmsFailureCodeV1Schema, {
      type: 'PROBLEM',
      code: 'p-001-lower',
      description: 'Lower case code',
    });
    expect(result.code).toBe('P-001-LOWER');
  });
});

describe('UpdateCmmsFailureCodeV1Schema', () => {
  it('accepts partial update with expectedVersion', () => {
    const result = parseInput(UpdateCmmsFailureCodeV1Schema, {
      expectedVersion: 3,
      description: 'Updated description',
    });
    expect(result.expectedVersion).toBe(3);
    expect(result.description).toBe('Updated description');
  });

  it('rejects when expectedVersion is missing', () => {
    expect(() =>
      parseInput(UpdateCmmsFailureCodeV1Schema, {
        description: 'No version',
      }),
    ).toThrow(BadRequestException);
  });
});

// ─── Job Plan Contract Validation ─────────────────────────────────────────────

describe('CreateCmmsJobPlanV1Schema', () => {
  it('accepts a valid job plan with tasks', () => {
    const result = parseInput(CreateCmmsJobPlanV1Schema, {
      code: 'PM-TURBINE-QUARTERLY',
      title: 'Gas Turbine Quarterly Preventive Maintenance',
      estimatedDurationMinutes: 480,
      safetyGuidelines: 'Follow LOTO procedure LT-T-001 before opening turbine casing.',
      tasks: [
        { sequence: 1, label: 'Verify lockout/tagout', taskType: 'SAFETY_CHECK', required: true, estimatedMinutes: 30 },
        { sequence: 2, label: 'Inspect turbine blades', taskType: 'INSPECTION', required: true, estimatedMinutes: 90 },
        { sequence: 3, label: 'Lubricate bearing assemblies', taskType: 'LUBRICATION', required: true, estimatedMinutes: 60 },
      ],
    });
    expect(result.code).toBe('PM-TURBINE-QUARTERLY');
    expect(result.tasks).toHaveLength(3);
    expect(result.tasks[0]!.taskType).toBe('SAFETY_CHECK');
  });

  it('defaults tasks to empty array when omitted', () => {
    const result = parseInput(CreateCmmsJobPlanV1Schema, {
      code: 'QUICK-PLAN',
      title: 'Quick Maintenance Plan',
    });
    expect(result.tasks).toEqual([]);
    expect(result.estimatedDurationMinutes).toBe(60); // default
  });

  it('rejects invalid taskType', () => {
    expect(() =>
      parseInput(CreateCmmsJobPlanV1Schema, {
        code: 'BAD-PLAN',
        title: 'Plan with bad task type',
        tasks: [{ sequence: 1, label: 'Bad task', taskType: 'INVALID_TYPE', required: true, estimatedMinutes: 10 }],
      }),
    ).toThrow(BadRequestException);
  });
});

// ─── Failure Attribution Validation ───────────────────────────────────────────

describe('RecordCmmsFailureAttributionV1Schema', () => {
  it('accepts all three failure code IDs as nullable', () => {
    const result = parseInput(RecordCmmsFailureAttributionV1Schema, {
      expectedVersion: 1,
      failureProblemId: '550e8400-e29b-41d4-a716-446655440001',
      failureCauseId: '550e8400-e29b-41d4-a716-446655440002',
      failureRemedyId: '550e8400-e29b-41d4-a716-446655440003',
    });
    expect(result.failureProblemId).toBeDefined();
  });

  it('accepts all IDs as null (clearing attribution)', () => {
    const result = parseInput(RecordCmmsFailureAttributionV1Schema, {
      expectedVersion: 2,
      failureProblemId: null,
      failureCauseId: null,
      failureRemedyId: null,
    });
    expect(result.failureProblemId).toBeNull();
  });

  it('rejects when expectedVersion missing', () => {
    expect(() =>
      parseInput(RecordCmmsFailureAttributionV1Schema, {
        failureProblemId: null,
      }),
    ).toThrow(BadRequestException);
  });
});
