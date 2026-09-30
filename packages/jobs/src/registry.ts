import { JobDefinitionError } from './errors.js';
import type { JobDefinition } from './types.js';
import { assertJobType } from './validation.js';

export class JobRegistry {
  readonly #definitions = new Map<string, JobDefinition<unknown>>();

  register<TPayload>(definition: JobDefinition<TPayload>): void {
    validateDefinition(definition);
    const key = definitionKey(definition.type, definition.version);
    if (this.#definitions.has(key)) {
      throw new JobDefinitionError(`Job definition '${key}' is already registered.`);
    }
    this.#definitions.set(key, Object.freeze({ ...definition }) as JobDefinition<unknown>);
  }

  resolve(type: string, version: number): JobDefinition<unknown> {
    const definition = this.#definitions.get(definitionKey(type, version));
    if (!definition)
      throw new JobDefinitionError(`Job definition '${type}@${version}' is not registered.`);
    return definition;
  }

  list(): readonly JobDefinition<unknown>[] {
    return [...this.#definitions.values()];
  }
}

function definitionKey(type: string, version: number): string {
  return `${type}@${version}`;
}

function validateDefinition<TPayload>(definition: JobDefinition<TPayload>): void {
  assertJobType(definition.type);
  if (!Number.isSafeInteger(definition.version) || definition.version < 1) {
    throw new JobDefinitionError('Job definition version must be a positive safe integer.');
  }
  if (
    !Number.isSafeInteger(definition.maxAttempts) ||
    definition.maxAttempts < 1 ||
    definition.maxAttempts > 25
  ) {
    throw new JobDefinitionError('Job maxAttempts must be between 1 and 25.');
  }
  if (
    !Number.isSafeInteger(definition.timeoutMs) ||
    definition.timeoutMs < 100 ||
    definition.timeoutMs > 3_600_000
  ) {
    throw new JobDefinitionError('Job timeoutMs must be between 100 and 3600000.');
  }
  if (
    !Number.isSafeInteger(definition.backoff.baseMs) ||
    !Number.isSafeInteger(definition.backoff.maxMs) ||
    definition.backoff.baseMs < 100 ||
    definition.backoff.maxMs < definition.backoff.baseMs ||
    definition.backoff.maxMs > 86_400_000
  ) {
    throw new JobDefinitionError('Job backoff must be bounded between 100 ms and 24 hours.');
  }
}
