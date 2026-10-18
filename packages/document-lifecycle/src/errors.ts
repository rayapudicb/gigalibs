/** The document's status does not allow this action. */
export class DocumentTransitionRefusedError extends Error {
  readonly code = 'DOCUMENT_TRANSITION_REFUSED' as const;

  constructor(
    readonly action: string,
    readonly fromStatus: string,
    message?: string,
  ) {
    super(message ?? `Action "${action}" is not allowed from status "${fromStatus}".`);
    this.name = 'DocumentTransitionRefusedError';
  }
}

/** If-Match / expectedVersion did not match the loaded document. */
export class DocumentVersionConflictError extends Error {
  readonly code = 'DOCUMENT_VERSION_CONFLICT' as const;

  constructor(
    readonly expectedVersion: number,
    readonly actualVersion: number,
  ) {
    super('The document was changed by someone else; reload it and try again.');
    this.name = 'DocumentVersionConflictError';
  }
}

/** A registered guard rejected the transition (period lock, approval, budget, etc.). */
export class DocumentGuardRefusedError extends Error {
  readonly code = 'DOCUMENT_GUARD_REFUSED' as const;

  constructor(
    readonly action: string,
    readonly reason: string,
  ) {
    super(reason);
    this.name = 'DocumentGuardRefusedError';
  }
}
