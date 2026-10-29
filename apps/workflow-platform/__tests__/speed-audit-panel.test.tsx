import type { SpeedAuditPageV1, SpeedRouteV1 } from '@gigalibs/contracts';
import {
  AuditTrailView,
  actorLabel,
  auditRows,
  dayRange,
  isSystemActor,
} from '@gigalibs/process-safety-screening-web';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { speedText } from '../../../modules/process-safety-screening/domain/src/messages/index';

// WI-OI-120cc (SPEED; screen spec §3.3; FR-AUD-01, 02): the audit trail in the catalogue's words. TEST FIXTURE entries.

const t = speedText('en-US');
const routes = [{ id: 'r1', name: 'TEST FIXTURE route' }] as unknown as SpeedRouteV1[];
const page = (ownOnly: boolean): SpeedAuditPageV1 => ({
  items: [
    {
      id: 'e1',
      occurredAt: '2026-10-21T09:30:00.000Z',
      actor: 'u1',
      action: 'ROUTE_UPDATED',
      entityType: 'route',
      entityId: 'r1',
      changes: [
        { field: 'name', from: 'First', to: 'Second' },
        { field: 'notes', from: null, to: 'TEST FIXTURE note' },
      ],
      reason: 'Clearer name',
    },
    {
      id: 'e2',
      occurredAt: '2026-10-21T09:00:00.000Z',
      actor: 'u2',
      action: 'DOSSIER_DOWNLOADED',
      entityType: 'dossier',
      entityId: 'd1',
      changes: [],
      reason: null,
    },
  ],
  total: 2,
  page: 1,
  pageSize: 50,
  ownOnly,
});
const noop = () => undefined;
const render = (value: SpeedAuditPageV1 | null, notice: string | null = null) =>
  renderToStaticMarkup(
    <AuditTrailView
      page={value}
      routes={routes}
      names={{ u1: 'TEST FIXTURE Chemist', u2: 'TEST FIXTURE Reviewer' }}
      draft={{}}
      applied={{ routeId: 'r1', from: '2026-10-01' }}
      notice={notice}
      t={t}
      on={{ draft: noop, apply: noop, clear: noop, page: noop }}
    />,
  );

describe('SPEED audit trail page (WI-OI-120cc)', () => {
  it('shows one row per changed field with the people by name, and the spec’s columns', () => {
    const html = render(page(false));
    for (const column of [
      'timeUtc',
      'local',
      'user',
      'action',
      'record',
      'field',
      'change',
      'reason',
    ])
      expect(html).toContain(t(`speed.audit.${column}`));
    expect(html).toContain('First → Second');
    expect(html).toContain('— → TEST FIXTURE note');
    expect(html).toContain('TEST FIXTURE Chemist');
    expect(html).toContain('route · TEST FIXTURE route');
    expect(html).toContain('2026-10-21 09:30:00');
    expect(auditRows(page(false).items)).toHaveLength(3);
  });

  it('offers the CSV export with the applied filters, as a whole day range, to full readers only', () => {
    const html = render(page(false));
    expect(html).toContain(
      'href="/api/speed/v1/audit-events/export/csv?routeId=r1&amp;from=2026-10-01T00%3A00%3A00Z"',
    );
    const own = render(page(true));
    expect(own).not.toContain(t('speed.audit.exportCsv'));
    expect(own).toContain(t('speed.audit.ownOnly'));
    expect(dayRange({ to: '2026-10-21' })).toEqual({ to: '2026-10-21T23:59:59.999Z' });
  });

  it('explains a refusal in the catalogue’s words', () => {
    expect(render(null, 'SPEED_AUDIT_FORBIDDEN')).toContain(t('SPEED_AUDIT_FORBIDDEN'));
  });

  // WI-OI-120ce: SPEED's own work (the dossier worker) is not a member; the member lookup refused it with 400.
  it('names SPEED’s own work from the catalogue and keeps it out of the member lookup', () => {
    expect(isSystemActor('system:speed-dossier-worker')).toBe(true);
    expect(isSystemActor('u1')).toBe(false);
    expect(actorLabel('system:speed-dossier-worker', {}, t)).toBe(
      'SPEED dossier generator (automatic)',
    );
    expect(actorLabel('system:something-new', {}, t)).toBe('SPEED (automatic)');
    expect(actorLabel('u1', { u1: 'TEST FIXTURE Chemist' }, t)).toBe('TEST FIXTURE Chemist');
    const withWorker = page(false);
    const html = render({
      ...withWorker,
      items: [{ ...withWorker.items[1], id: 'e3', actor: 'system:speed-dossier-worker' }],
      total: 1,
    } as SpeedAuditPageV1);
    expect(html).toContain('SPEED dossier generator (automatic)');
    expect(html).not.toContain('system:speed-dossier-worker');
  });
});
