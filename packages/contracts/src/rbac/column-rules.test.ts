import { describe, expect, it } from 'vitest';
import { type ColumnRule, resolveColumnAccess, visibleColumns } from './column-rules.js';

// WI-OI-120 (Phase 4, R9 column rules): field-level view/edit access.
const rules: ColumnRule[] = [
  { column: 'name' }, // open
  { column: 'salary', requiredToView: 'hr:comp:read', requiredToEdit: 'hr:comp:write' },
  { column: 'status', requiredToEdit: 'hr:status:write' }, // viewable by all, edit gated
];

describe('resolveColumnAccess', () => {
  it('opens unrestricted columns to everyone', () => {
    const access = resolveColumnAccess(rules, []);
    expect(access.find((a) => a.column === 'name')).toEqual({
      column: 'name',
      canView: true,
      canEdit: true,
    });
  });

  it('gates view and edit by permission; edit requires view', () => {
    const viewer = resolveColumnAccess(rules, ['hr:comp:read']);
    expect(viewer.find((a) => a.column === 'salary')).toEqual({
      column: 'salary',
      canView: true,
      canEdit: false,
    });

    const editor = resolveColumnAccess(rules, ['hr:comp:read', 'hr:comp:write']);
    expect(editor.find((a) => a.column === 'salary')).toEqual({
      column: 'salary',
      canView: true,
      canEdit: true,
    });

    const none = resolveColumnAccess(rules, []);
    expect(none.find((a) => a.column === 'salary')).toEqual({
      column: 'salary',
      canView: false,
      canEdit: false,
    });
  });

  it('never allows edit without view, even if the edit permission is held', () => {
    // Holds the edit permission but not the view permission for salary → still cannot edit.
    const access = resolveColumnAccess(rules, ['hr:comp:write']);
    expect(access.find((a) => a.column === 'salary')).toEqual({
      column: 'salary',
      canView: false,
      canEdit: false,
    });
  });

  it('a view-open, edit-gated column is visible but locked without the permission', () => {
    const access = resolveColumnAccess(rules, []);
    expect(access.find((a) => a.column === 'status')).toEqual({
      column: 'status',
      canView: true,
      canEdit: false,
    });
  });

  it('wildcards cover column permissions', () => {
    const access = resolveColumnAccess(rules, ['hr:*']);
    expect(access.find((a) => a.column === 'salary')).toEqual({
      column: 'salary',
      canView: true,
      canEdit: true,
    });
  });
});

describe('visibleColumns', () => {
  it('projects just the viewable column names', () => {
    expect(visibleColumns(rules, [])).toEqual(['name', 'status']);
    expect(visibleColumns(rules, ['hr:comp:read'])).toEqual(['name', 'salary', 'status']);
  });
});
