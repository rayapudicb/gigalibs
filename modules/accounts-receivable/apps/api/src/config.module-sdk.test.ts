import { describe, expect, it } from 'vitest';
import { AUDIENCE, SCHEMA_CONTRACT_VERSION } from './config.module-sdk.js';

describe('AR module SDK config constants', () => {
  it('pins audience and schema contract for M-AR0', () => {
    expect(AUDIENCE).toBe('gigalibs-ar-api');
    expect(SCHEMA_CONTRACT_VERSION).toBe(16);
  });
});
