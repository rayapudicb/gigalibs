export class JobDefinitionError extends Error {
  override readonly name = 'JobDefinitionError';
}

export class JobIdempotencyConflictError extends Error {
  override readonly name = 'JobIdempotencyConflictError';
}

export class JobLeaseConflictError extends Error {
  override readonly name = 'JobLeaseConflictError';
}

export class NonRetryableJobError extends Error {
  override readonly name = 'NonRetryableJobError';

  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export class JobTimeoutError extends Error {
  override readonly name = 'JobTimeoutError';

  constructor(readonly timeoutMs: number) {
    super(`Job execution exceeded its ${timeoutMs} ms timeout.`);
  }
}
