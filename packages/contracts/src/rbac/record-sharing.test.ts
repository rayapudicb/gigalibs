import { describe, expect, it } from 'vitest';
import {
  CreateRecordShareSchema,
  type RecordShare,
  recordSharedForEdit,
  recordSharedForView,
  resolveRecordShareAccess,
} from './record-sharing.js';

// WI-OI-120 (Phase 4, R8 record sharing): the pure resolver turning a record's shares + who is asking into an access.
const shares: RecordShare[] = [
  { grantee: { kind: 'USER', id: 'ada' }, access: 'VIEW' },
  { grantee: { kind: 'ROLE', id: 'role-auditor' }, access: 'VIEW' },
  { grantee: { kind: 'USER', id: 'grace' }, access: 'EDIT' },
];

describe('resolveRecordShareAccess', () => {
  it('matches a direct user share', () => {
    expect(resolveRecordShareAccess(shares, { userId: 'ada', roleIds: [] })).toBe('VIEW');
    expect(resolveRecordShareAccess(shares, { userId: 'grace', roleIds: [] })).toBe('EDIT');
  });

  it('matches a role share', () => {
    expect(resolveRecordShareAccess(shares, { userId: 'bob', roleIds: ['role-auditor'] })).toBe(
      'VIEW',
    );
  });

  it('gives EDIT when any matching share is EDIT, regardless of order', () => {
    const mixed: RecordShare[] = [
      { grantee: { kind: 'ROLE', id: 'r1' }, access: 'EDIT' },
      { grantee: { kind: 'USER', id: 'x' }, access: 'VIEW' },
    ];
    expect(resolveRecordShareAccess(mixed, { userId: 'x', roleIds: ['r1'] })).toBe('EDIT');
  });

  it('returns null when nothing matches', () => {
    expect(
      resolveRecordShareAccess(shares, { userId: 'nobody', roleIds: ['role-other'] }),
    ).toBeNull();
    expect(resolveRecordShareAccess([], { userId: 'ada', roleIds: [] })).toBeNull();
  });

  it('view/edit convenience helpers', () => {
    expect(recordSharedForView(shares, { userId: 'ada', roleIds: [] })).toBe(true);
    expect(recordSharedForEdit(shares, { userId: 'ada', roleIds: [] })).toBe(false);
    expect(recordSharedForEdit(shares, { userId: 'grace', roleIds: [] })).toBe(true);
  });
});

describe('CreateRecordShareSchema', () => {
  it('accepts a well-formed share and rejects a bad grantee kind', () => {
    expect(
      CreateRecordShareSchema.safeParse({
        recordType: 'work-order',
        recordId: 'wo-1',
        grantee: { kind: 'USER', id: 'ada' },
        access: 'EDIT',
      }).success,
    ).toBe(true);
    expect(
      CreateRecordShareSchema.safeParse({
        recordType: 'work-order',
        recordId: 'wo-1',
        grantee: { kind: 'TEAM', id: 'x' },
        access: 'EDIT',
      }).success,
    ).toBe(false);
  });
});
