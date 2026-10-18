import {
  DocumentGuardRefusedError,
  DocumentTransitionRefusedError,
  DocumentVersionConflictError,
} from './errors.js';
import type {
  DocumentTransitionGraph,
  TransitionContext,
  VersionedDocument,
} from './types.js';

/**
 * ADR-0033 F1: shared transition runner. Each document type supplies its own graph; guards encode
 * period locks, approvals and module invariants. Idempotency and outbox writes stay in the module
 * transaction (wired in F1.2+).
 */
export class DocumentLifecycleRunner<TDoc extends VersionedDocument> {
  constructor(private readonly graph: DocumentTransitionGraph<TDoc>) {}

  assertAllowed(document: TDoc, action: string): TransitionContext<TDoc> {
    const definition = this.graph[action];
    if (!definition) {
      throw new DocumentTransitionRefusedError(action, document.status, `Unknown document action "${action}".`);
    }
    if (!definition.from.includes(document.status)) {
      throw new DocumentTransitionRefusedError(action, document.status);
    }
    return {
      tenantId: '',
      actorId: '',
      documentId: '',
      action,
      expectedVersion: document.version,
      document,
    };
  }

  async run(
    context: Omit<TransitionContext<TDoc>, 'action'> & { readonly action: string },
  ): Promise<Awaited<ReturnType<NonNullable<DocumentTransitionGraph<TDoc>[string]>['effect']>>> {
    const { document, expectedVersion, action } = context;
    if (document.version !== expectedVersion) {
      throw new DocumentVersionConflictError(expectedVersion, document.version);
    }

    const definition = this.graph[action];
    if (!definition) {
      throw new DocumentTransitionRefusedError(action, document.status, `Unknown document action "${action}".`);
    }
    if (!definition.from.includes(document.status)) {
      throw new DocumentTransitionRefusedError(action, document.status);
    }

    if (definition.guards) {
      for (const guard of definition.guards) {
        try {
          await guard(context);
        } catch (error) {
          if (error instanceof DocumentGuardRefusedError) throw error;
          const reason = error instanceof Error ? error.message : String(error);
          throw new DocumentGuardRefusedError(action, reason);
        }
      }
    }

    return definition.effect(context);
  }
}

/** Type-safe helper to define a graph without widening status strings. */
export function defineDocumentGraph<TDoc extends VersionedDocument>(
  graph: DocumentTransitionGraph<TDoc>,
): DocumentTransitionGraph<TDoc> {
  return graph;
}
