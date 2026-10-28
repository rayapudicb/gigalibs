import { describe, expect, it } from 'vitest';
import { defineDocumentGraph } from './transition-runner.js';
import {
  DocumentIdempotencyConflictError,
  executeTransactionalDocumentAction,
  type TransactionalDocumentActionInput,
  type TransactionalDocumentActionStore,
} from './transactional-action.js';
import type { VersionedDocument } from './types.js';

interface Document extends VersionedDocument {
  readonly id: string;
  readonly tenantId: string;
}

interface State {
  document: Document;
  audit: string[];
  outbox: string[];
  outcomes: Record<string, { requestHash: string; result: Document }>;
}

const request: TransactionalDocumentActionInput = {
  tenantId: 'tenant-1',
  actorId: 'clerk-1',
  documentId: 'receipt-1',
  action: 'completeIt',
  expectedVersion: 1,
  idempotencyKey: 'complete-1',
  requestHash: 'sha256:validated-payload-1',
};

function fixture() {
  let committed: State = {
    document: { id: 'receipt-1', tenantId: 'tenant-1', status: 'DRAFT', version: 1 },
    audit: [],
    outbox: [],
    outcomes: {},
  };
  let failOutbox = false;
  const key = (input: TransactionalDocumentActionInput) => `${input.action}:${input.idempotencyKey}`;
  const store: TransactionalDocumentActionStore<State, Document, Document> = {
    withTransaction: async (operation) => {
      const transaction = structuredClone(committed);
      const result = await operation(transaction);
      committed = transaction;
      return result;
    },
    lockDocument: async (transaction, input) => {
      if (transaction.document.tenantId !== input.tenantId || transaction.document.id !== input.documentId) {
        throw new Error('Document not found in tenant.');
      }
      return transaction.document;
    },
    authorize: async (_transaction, context) => {
      if (context.actorId === 'revoked') throw new Error('Document action denied.');
    },
    findOutcome: async (transaction, input) => transaction.outcomes[key(input)] ?? null,
    graph: (transaction) => defineDocumentGraph<Document>({
      completeIt: {
        from: ['DRAFT'],
        to: 'COMPLETED',
        effect: async (context) => {
          transaction.document = { ...context.document, status: 'COMPLETED', version: context.document.version + 1 };
          return transaction.document;
        },
      },
    }),
    appendAudit: async (transaction, context) => { transaction.audit.push(context.action); },
    appendOutbox: async (transaction, context) => {
      if (failOutbox) throw new Error('Outbox unavailable.');
      transaction.outbox.push(context.action);
    },
    storeOutcome: async (transaction, input, result) => {
      transaction.outcomes[key(input)] = { requestHash: input.requestHash, result };
    },
  };
  return {
    store,
    snapshot: () => structuredClone(committed),
    failNextOutbox: () => { failOutbox = true; },
    restoreOutbox: () => { failOutbox = false; },
  };
}

describe('transactional document actions', () => {
  it('returns the stored result on an exact replay without a second effect, audit or event', async () => {
    const { store, snapshot } = fixture();
    const first = await executeTransactionalDocumentAction(request, store);
    const replay = await executeTransactionalDocumentAction(request, store);
    expect(replay).toEqual(first);
    expect(snapshot()).toMatchObject({
      document: { status: 'COMPLETED', version: 2 },
      audit: ['completeIt'],
      outbox: ['completeIt'],
    });
  });

  it('rejects a changed payload and rechecks authorization before returning an old result', async () => {
    const { store } = fixture();
    await executeTransactionalDocumentAction(request, store);
    await expect(executeTransactionalDocumentAction({ ...request, requestHash: 'sha256:other' }, store))
      .rejects.toBeInstanceOf(DocumentIdempotencyConflictError);
    await expect(executeTransactionalDocumentAction({ ...request, actorId: 'revoked' }, store))
      .rejects.toThrow('Document action denied.');
  });

  it('rolls back document effects and audit if the local outbox write fails', async () => {
    const { store, snapshot, failNextOutbox, restoreOutbox } = fixture();
    failNextOutbox();
    await expect(executeTransactionalDocumentAction(request, store)).rejects.toThrow('Outbox unavailable.');
    expect(snapshot()).toMatchObject({
      document: { status: 'DRAFT', version: 1 },
      audit: [],
      outbox: [],
      outcomes: {},
    });
    restoreOutbox();
    await expect(executeTransactionalDocumentAction(request, store)).resolves.toMatchObject({ status: 'COMPLETED' });
  });
});
