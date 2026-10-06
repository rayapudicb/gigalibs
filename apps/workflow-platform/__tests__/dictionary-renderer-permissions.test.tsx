import type { CompiledDictionaryManifestV1 } from '@gigalibs/contracts';
import { DictionaryRenderer } from '@gigalibs/configuration-react';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

// WI-OI-120e (U3.2, P1-24): the dictionary renderer denies by default. A field that names a read permission is shown
// only to a caller that passes that permission; it used to default to every permission ('*').
const field = (fieldKey: string, label: string, extra: Record<string, unknown> = {}) => ({
  fieldKey,
  entityKey: 'people',
  label,
  type: 'TEXT',
  required: false,
  readOnly: false,
  isSystemLocked: false,
  classification: 'INTERNAL',
  maskOnDisplay: false,
  ...extra,
});

const manifest = {
  manifestVersion: 1,
  packageKey: 'pkg-renderer-permissions',
  checksum: `sha256:${'0'.repeat(64)}`,
  compiledAt: '2026-10-05T00:00:00.000Z',
  entities: [],
  fields: [
    field('display_name', 'Display name'),
    field('salary_band', 'Salary band', { classification: 'RESTRICTED', readPermission: 'hr:salary:read' }),
  ],
  references: [],
  validationRules: [],
  relationships: [],
  views: [
    {
      viewKey: 'person',
      label: 'Person',
      device: 'ALL',
      tabs: [
        {
          tabKey: 'main',
          label: 'Main',
          position: 0,
          level: 0,
          sections: [{ sectionKey: 'details', label: 'Details', collapsible: false, defaultCollapsed: false, position: 0 }],
          fields: [
            { fieldKey: 'display_name', sectionKey: 'details', position: 0, colSpan: 12 },
            { fieldKey: 'salary_band', sectionKey: 'details', position: 1, colSpan: 12 },
          ],
        },
      ],
    },
  ],
  navigation: [],
  actions: [],
  messages: [],
} as unknown as CompiledDictionaryManifestV1;

const render = (permissions?: readonly string[]) =>
  renderToStaticMarkup(
    <DictionaryRenderer manifest={manifest} values={{}} onChange={() => undefined} {...(permissions ? { permissions } : {})} />,
  );

describe('DictionaryRenderer permissions', () => {
  it('hides a permission-gated field when the caller passes no permissions', () => {
    const html = render();
    expect(html).toContain('Display name');
    expect(html).not.toContain('Salary band');
  });

  it('hides it from a user without that permission and shows it to one who holds it', () => {
    expect(render(['people:read'])).not.toContain('Salary band');
    expect(render(['hr:salary:read'])).toContain('Salary band');
    expect(render(['*'])).toContain('Salary band');
  });

  it('shows it through the family wildcard, as every other check does (WI-OI-120q)', () => {
    expect(render(['hr:*'])).toContain('Salary band');
    expect(render(['hr.salary.read'])).toContain('Salary band');
    expect(render(['hr:salary'])).not.toContain('Salary band');
    expect(render(['hrx:*'])).not.toContain('Salary band');
  });
});
