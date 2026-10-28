import { DocumentLifecycleRunner } from './transition-runner.js';
import type { DocumentTransitionGraph, TransitionContext, VersionedDocument } from './types.js';

/** A reused key with a different request must never replay the earlier result. */
export class DocumentIdempotencyConflictError extends Error {
  readonly code = 'DOCUMENT_IDEMPOTENCY_CONFLICT';

  constructor() {
    super('This document action key was already used with different input.');
    this.name = 'DocumentIdempotencyConflictError';
  }
}

export interface TransactionalDocumentActionInput {
  readonly tenantId: string;
  readonly actorId: string;
  readonly documentId: string;
  readonly action: string;
  readonly expectedVersion: number;
  /** Scoped to tenant, document and action by the owning module's unique constraint. */
  readonly idempotencyKey: string;
  /** Hash of the canonical, validated request including action parameters. */
  readonly requestHash: string;
}

export interface StoredDocumentActionOutcome<TResult> {
  readonly requestHash: string;
  readonly result: TResult;
}

/**
 * The owning module supplies all persistence through one tenant-bound database transaction. The document query
 * must lock the row, and the outcome table needs a unique key on tenant, document, action and idempotency key.
 * Audit, outbox and outcome writes use the same transaction handle as the transition's local effects. External
 * calls belong to an after-commit relay, never to these callbacks (ADR-0033 D2/D3).
 */
export interface TransactionalDocumentActionStore<TTransaction, TDoc extends VersionedDocument, TResult> {
  readonly withTransaction: <T>(operation: (transaction: TTransaction) => Promise<T>) => Promise<T>;
  readonly lockDocument: (
    transaction: TTransaction,
    input: TransactionalDocumentActionInput,
  ) => Promise<TDoc>;
  readonly authorize: (
    transaction: TTransaction,
    context: TransitionContext<TDoc>,
  ) => Promise<void>;
  readonly findOutcome: (
    transaction: TTransaction,
    input: TransactionalDocumentActionInput,
  ) => Promise<StoredDocumentActionOutcome<TResult> | null>;
  readonly graph: (transaction: TTransaction) => DocumentTransitionGraph<TDoc>;
  readonly appendAudit: (
    transaction: TTransaction,
    context: TransitionContext<TDoc>,
    result: TResult,
  ) => Promise<void>;
  readonly appendOutbox: (
    transaction: TTransaction,
    context: TransitionContext<TDoc>,
    result: TResult,
  ) => Promise<void>;
  readonly storeOutcome: (
    transaction: TTransaction,
    input: TransactionalDocumentActionInput,
    result: TResult,
  ) => Promise<void>;
}

/**
 * Coordinates a document's local ACID boundary. The graph remains document-specific; the module decides its guards,
 * row locking, reversal effects, event shape and posting policy. A replay is authorized again before returning its
 * stored result, so a revoked actor cannot use an old key to read a protected action outcome.
 */
export async function executeTransactionalDocumentAction<
  TTransaction,
  TDoc extends VersionedDocument,
  TResult,
>(
  input: TransactionalDocumentActionInput,
  store: TransactionalDocumentActionStore<TTransaction, TDoc, TResult>,
): Promise<TResult> {
  if (!input.tenantId || !input.actorId || !input.documentId || !input.action ||
      !input.idempotencyKey || !input.requestHash) {
    throw new Error('A document action needs verified scope, action, idempotency key and request hash.');
  }

  return store.withTransaction(async (transaction) => {
    const document = await store.lockDocument(transaction, input);
    const context: TransitionContext<TDoc> = {
      tenantId: input.tenantId,
      actorId: input.actorId,
      documentId: input.documentId,
      action: input.action,
      expectedVersion: input.expectedVersion,
      document,
    };
    await store.authorize(transaction, context);

    const previous = await store.findOutcome(transaction, input);
    if (previous) {
      if (previous.requestHash !== input.requestHash) throw new DocumentIdempotencyConflictError();
      return previous.result;
    }

    const result = await new DocumentLifecycleRunner(store.graph(transaction)).run(context) as TResult;
    await store.appendAudit(transaction, context, result);
    await store.appendOutbox(transaction, context, result);
    await store.storeOutcome(transaction, input, result);
    return result;
  });
}
