import { describe, expect, it } from 'vitest';
import { DocumentGuardRefusedError, DocumentTransitionRefusedError, DocumentVersionConflictError } from './errors.js';
import { defineDocumentGraph, DocumentLifecycleRunner } from './transition-runner.js';
import type { VersionedDocument } from './types.js';

interface Receipt extends VersionedDocument {
  readonly id: string;
}

describe('DocumentLifecycleRunner', () => {
  const graph = defineDocumentGraph<Receipt>({
    complete: {
      from: ['DRAFT'],
      to: 'COMPLETED',
      guards: [
        (ctx) => {
          if (ctx.actorId === 'blocked') throw new DocumentGuardRefusedError(ctx.action, 'Period is closed.');
        },
      ],
      effect: async (ctx) => ({ id: ctx.documentId, status: 'COMPLETED' as const, version: ctx.document.version + 1 }),
    },
    void: {
      from: ['DRAFT', 'COMPLETED'],
      to: 'VOIDED',
      effect: async () => ({ status: 'VOIDED' as const }),
    },
  });

  const runner = new DocumentLifecycleRunner(graph);

  it('runs an allowed transition through guards and effect', async () => {
    const doc: Receipt = { id: 'r1', status: 'DRAFT', version: 2 };
    const result = await runner.run({
      tenantId: 't1',
      actorId: 'user-1',
      documentId: 'r1',
      action: 'complete',
      expectedVersion: 2,
      document: doc,
    });
    expect(result).toEqual({ id: 'r1', status: 'COMPLETED', version: 3 });
  });

  it('refuses unknown actions', async () => {
    const doc: Receipt = { id: 'r1', status: 'DRAFT', version: 1 };
    await expect(
      runner.run({ tenantId: 't', actorId: 'u', documentId: 'r1', action: 'reverse', expectedVersion: 1, document: doc }),
    ).rejects.toBeInstanceOf(DocumentTransitionRefusedError);
  });

  it('refuses disallowed from-status', async () => {
    const doc: Receipt = { id: 'r1', status: 'COMPLETED', version: 1 };
    await expect(
      runner.run({ tenantId: 't', actorId: 'u', documentId: 'r1', action: 'complete', expectedVersion: 1, document: doc }),
    ).rejects.toBeInstanceOf(DocumentTransitionRefusedError);
  });

  it('refuses stale expectedVersion', async () => {
    const doc: Receipt = { id: 'r1', status: 'DRAFT', version: 5 };
    await expect(
      runner.run({ tenantId: 't', actorId: 'u', documentId: 'r1', action: 'complete', expectedVersion: 4, document: doc }),
    ).rejects.toBeInstanceOf(DocumentVersionConflictError);
  });

  it('surfaces guard refusal', async () => {
    const doc: Receipt = { id: 'r1', status: 'DRAFT', version: 1 };
    await expect(
      runner.run({ tenantId: 't', actorId: 'blocked', documentId: 'r1', action: 'complete', expectedVersion: 1, document: doc }),
    ).rejects.toMatchObject({ code: 'DOCUMENT_GUARD_REFUSED', reason: 'Period is closed.' });
  });
});
