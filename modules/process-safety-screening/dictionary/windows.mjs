// WI-OI-120bw (SPEED S3; screen spec §2.1): SPEED's metadata windows. Edit here, then run
// `node scripts/generate-windows.mjs process-safety-screening` and `pnpm modules:catalog`.

const PROJECT_STATUSES = [['ACTIVE', 'Active'], ['ARCHIVED', 'Archived']];

export function windowSource(builderFor) {
  const { entity, field, values, lookup, tab, section, action, view, dictionary, window, REASON_REQUIRED } = builderFor({ route: '/speed' });
  // Sites and people are the workspace's own, served by the platform lookups (WI-OI-120u).
  const SITE_REF = lookup('site-ref', 'organization-units');
  const MEMBER_REF = lookup('member-ref', 'workspace-members');
  const windows = {};

  // Projects. A saved project changes only with a reason (FR-AUD-01); the window asks for one from S2, so until then a
  // saved project's fields are read-only here and its changes go through the API.
  const P = 'speed.projects';
  const SAVED = { field: 'status', operator: 'IS_NOT_NULL' };
  const pf = [
    field(P, 'code', 'Project code', 'TEXT', { required: true, help: 'Unique in your workspace.' }),
    field(P, 'name', 'Name', 'TEXT', { required: true }),
    field(P, 'site-unit-id', 'Site', 'REFERENCE', { required: true, ref: 'site-ref' }),
    field(P, 'owner-subject', 'Owner', 'REFERENCE', { ref: 'member-ref', defaultValue: { $default: 'CURRENT_USER' } }),
    field(P, 'notes', 'Notes', 'TEXTAREA'),
    field(P, 'status', 'Status', 'SELECT', { readOnly: true, ref: 'project-statuses' }),
    field(P, 'created-by', 'Created by', 'REFERENCE', { readOnly: true, ref: 'member-ref' }),
    field(P, 'created-at', 'Created', 'DATETIME', { readOnly: true }),
    field(P, 'updated-at', 'Last change', 'DATETIME', { readOnly: true }),
    field(P, 'archived-at', 'Archived', 'DATETIME', { readOnly: true }),
  ];
  windows['speed-projects'] = window('speed-projects', 'Projects', 'Projects', 'Process development projects and the routes screened in them.', 'speed:read',
    dictionary('speed-projects', 'Projects', P, [entity(P, 'Projects')], pf, [], [SITE_REF, MEMBER_REF, values('project-statuses', PROJECT_STATUSES)], [
      view('projects', 'Projects', [
        tab('project', 'Project', 0, P, [
          ['code', 3, 'main', { lockedWhen: SAVED }], ['name', 9, 'main', { lockedWhen: SAVED }],
          ['site-unit-id', 6, 'main', { lockedWhen: SAVED }], ['owner-subject', 6, 'main', { lockedWhen: SAVED }],
          ['notes', 12, 'main', { lockedWhen: SAVED }],
          ['status', 3, 'record'], ['created-by', 3, 'record'], ['created-at', 3, 'record'], ['updated-at', 3, 'record'],
        ], pf, { sections: [section('main', 'Project', 0), section('record', 'Record', 1)] }),
      ], { search: ['code', 'name'], sort: 'code' }),
    ], [
      action(P, 'archive', 'Archive', 'speed.routes.write', ['status', 'EQ', 'ACTIVE'],
        'Archive this project? It stays readable and can no longer change.', REASON_REQUIRED),
    ]));

  return windows;
}
