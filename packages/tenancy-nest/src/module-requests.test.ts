import { describe, expect, it } from 'vitest';
import { openModuleRequests } from './module-requests.js';

const at = (iso: string) => new Date(iso);
const ana = { email: 'ana@example.com', name: 'Ana Admin' };

describe('openModuleRequests (WI-OI-147, QA-035)', () => {
  it('keeps the latest request per module and drops modules that are already on', () => {
    const open = openModuleRequests(
      [
        { resourceId: 'universal-orders', createdAt: at('2026-11-01T10:00:00Z'), user: ana },
        { resourceId: 'universal-orders', createdAt: at('2026-11-03T09:00:00Z'), user: { email: 'bo@example.com', name: null } },
        { resourceId: 'gigaops', createdAt: at('2026-11-02T08:00:00Z'), user: ana },
        { resourceId: 'asset-maintenance', createdAt: at('2026-11-02T07:00:00Z'), user: null },
      ],
      ['gigaops'],
    );
    expect(open).toEqual([
      { moduleKey: 'universal-orders', requestedAt: '2026-11-03T09:00:00.000Z', requestedBy: 'bo@example.com' },
      { moduleKey: 'asset-maintenance', requestedAt: '2026-11-02T07:00:00.000Z', requestedBy: null },
    ]);
  });

  it('ignores rows without a module key', () => {
    expect(openModuleRequests([{ resourceId: null, createdAt: at('2026-11-03T09:00:00Z'), user: ana }], [])).toEqual([]);
  });
});
