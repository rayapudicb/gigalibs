/** WI-OI-038 — scope predicates are bound parameters and scoped writes stay inside the caller's scope. */
import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { CmmsPrincipal } from './authorization.js';
import { assertWritableScope, scopePredicates } from './scope.js';

const base = {
  tenantId: 'tenant-a',
  subject: 'user-1',
  sessionId: 's',
  authVersion: 1,
  permissions: ['cmms:*'],
  roles: [],
  persona: 'TENANT_ADMIN',
} as const;
const place = '6d3f1a52-7f5b-4f2a-9a61-1f0b8c1d2e3f';
const flat = { ...base, departmentScope: { mode: 'ALL' }, placeScope: { mode: 'ALL' } } as CmmsPrincipal;
const scoped = {
  ...base,
  departmentScope: { mode: 'DEPARTMENTS', departmentIds: ['dept-a'] },
  placeScope: { mode: 'PLACES', placeIds: [place] },
} as CmmsPrincipal;

describe('CMMS scope', () => {
  it('adds no predicate for unscoped principals', () => {
    const values: unknown[] = ['tenant-a'];
    expect(scopePredicates(flat, values, 'a.')).toEqual([]);
    expect(values).toEqual(['tenant-a']);
  });

  it('binds department and place scope as parameters, never as SQL text', () => {
    const values: unknown[] = ['tenant-a'];
    expect(scopePredicates(scoped, values, 'w.')).toEqual([
      '(w.department_id IS NULL OR w.department_id = ANY($2::text[]))',
      'w.site_ref = ANY($3::uuid[])',
    ]);
    expect(values).toEqual(['tenant-a', ['dept-a'], [place]]);
  });

  it('fails closed for an empty department list, hiding even tenant-wide rows', () => {
    const values: unknown[] = ['tenant-a'];
    const empty = { ...scoped, departmentScope: { mode: 'DEPARTMENTS', departmentIds: [] } } as CmmsPrincipal;
    expect(scopePredicates(empty, values)).toEqual(['FALSE']);
    expect(values).toEqual(['tenant-a']);
  });

  it('keeps scoped writes inside the caller departments and places', () => {
    expect(() => assertWritableScope(flat, { departmentId: null, siteRef: null })).not.toThrow();
    expect(() => assertWritableScope(scoped, { departmentId: 'dept-a', siteRef: place })).not.toThrow();
    expect(() => assertWritableScope(scoped, { departmentId: null, siteRef: place })).toThrow(ForbiddenException);
    expect(() => assertWritableScope(scoped, { departmentId: 'dept-b', siteRef: place })).toThrow(ForbiddenException);
    expect(() => assertWritableScope(scoped, { departmentId: 'dept-a', siteRef: null })).toThrow(ForbiddenException);
  });
});
