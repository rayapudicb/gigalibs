import { createHash } from 'node:crypto';
import { JobDefinitionError } from './errors.js';
import type { JsonValue } from './types.js';

export const MAX_JOB_PAYLOAD_BYTES = 256 * 1024;
export const MAX_JOB_RESULT_BYTES = 64 * 1024;
export const MAX_ERROR_MESSAGE_LENGTH = 2_048;

const JOB_TYPE_PATTERN = /^[a-z][a-z0-9.-]{2,127}$/;

export function assertJobType(value: string): void {
  if (!JOB_TYPE_PATTERN.test(value)) {
    throw new JobDefinitionError(
      'Job type must be 3–128 lowercase characters containing only letters, digits, dots and hyphens.',
    );
  }
}

export function canonicalJson(
  value: unknown,
  maxBytes: number,
): { value: JsonValue; json: string; sha256: string } {
  const normalized = normalizeJson(value);
  const json = JSON.stringify(normalized);
  if (Buffer.byteLength(json, 'utf8') > maxBytes) {
    throw new JobDefinitionError(`JSON value exceeds the ${maxBytes} byte limit.`);
  }
  return {
    value: normalized,
    json,
    sha256: createHash('sha256').update(json).digest('hex'),
  };
}

export function boundedMessage(value: unknown): string {
  const message = value instanceof Error ? value.message : String(value);
  return message.slice(0, MAX_ERROR_MESSAGE_LENGTH);
}

function normalizeJson(value: unknown): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new JobDefinitionError('Job JSON cannot contain a non-finite number.');
    return value;
  }
  if (Array.isArray(value)) return value.map((entry) => normalizeJson(entry));
  if (typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new JobDefinitionError('Job JSON can contain only arrays and plain objects.');
    }
    const result: Record<string, JsonValue> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const entry = (value as Record<string, unknown>)[key];
      if (entry === undefined)
        throw new JobDefinitionError('Job JSON cannot contain undefined values.');
      result[key] = normalizeJson(entry);
    }
    return result;
  }
  throw new JobDefinitionError(`Job JSON cannot contain ${typeof value} values.`);
}
