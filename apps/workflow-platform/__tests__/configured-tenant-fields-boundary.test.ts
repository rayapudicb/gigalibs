import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve('apps/workflow-platform/components/settings/ConfiguredTenantFields.tsx'),
  'utf8',
);

describe('ConfiguredTenantFields TP-1 boundary', () => {
  it('uses only the server-resolved current-runtime endpoint', () => {
    expect(source).toContain('/api/control/configuration/runtime/manifest/current?');
    expect(source).not.toContain("environmentKey: 'local-uat'");
    expect(source).not.toContain("cohortKey: 'all-users'");
  });

  it('models every reviewed visible UI state', () => {
    for (const state of [
      'loading',
      'absent',
      'denied',
      'invalid-scope',
      'retryable-error',
      'ready',
      'saving',
      'conflict',
      'saved',
    ]) {
      expect(source).toContain(`kind: '${state}'`);
    }
  });

  it('cancels stale loads and exposes retry, focus and live announcements', () => {
    expect(source).toContain('new AbortController()');
    expect(source).toContain('loadSequence.current');
    expect(source).toContain('aria-live=');
    expect(source).toContain('announcement.current?.focus()');
    expect(source).toContain("state.kind === 'conflict' ? 'Reload latest values' : 'Retry'");
  });
});
