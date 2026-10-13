// WI-OI-120u (M-WF1, ADR-0033 D1): the Jobs & positions window, held back by the owner on 2026-10-13. It is not
// generated: it returns to windows.mjs in the follow-up that lets it revise job profiles, place people in positions (a
// window of its own, since a window has one level of child tabs) and pick a site. Until then /gigaops/jobs stays on
// the Workforce workbench. Its record adapters (wf.job-profiles, wf.positions) are registered and tested already.

const PROFILE_STATUSES = [
  ['ACTIVE', 'Active'],
  ['INACTIVE', 'Inactive'],
];

const POSITION_STATUSES = [
  ['OPEN', 'Open'],
  ['FILLED', 'Filled'],
  ['CLOSED', 'Closed'],
];

const WORKER_CATEGORIES = [
  ['FULL_TIME', 'Full time'],
  ['PART_TIME', 'Part time'],
  ['CONTRACTOR', 'Contractor'],
  ['TEMPORARY', 'Temporary'],
];

/** The window, from the builder `windows.mjs` receives (`builderFor({ route: '/gigaops/jobs', ... })`). */
export function jobsWindow({ entity, field, values, lookup, tab, section, relationship, action, view, dictionary, window, REASON_REQUIRED }) {
  const JOB_PROFILE_REF = lookup('job-profile-ref', 'wf-jobs');

  const JP = 'wf.job-profiles';
  const PS = 'wf.positions';

  const jf = [
    // Job profile fields
    field(JP, 'code', 'Code', 'TEXT', { required: true, help: 'Unique code identifying this job profile.' }),
    field(JP, 'status', 'Status', 'SELECT', { readOnly: true, ref: 'profile-statuses' }),
    field(JP, 'title', 'Title', 'TEXT', { required: true, help: 'Job profile title.' }),
    field(JP, 'description', 'Description', 'TEXTAREA'),
    field(JP, 'worker-category', 'Worker category', 'SELECT', { required: true, ref: 'worker-categories' }),
    field(JP, 'position-count', 'Open positions', 'INTEGER', { readOnly: true }),
    field(JP, 'created-at', 'Created at', 'DATETIME', { readOnly: true }),
    field(JP, 'updated-at', 'Updated at', 'DATETIME', { readOnly: true }),

    // Position child fields
    field(PS, 'code', 'Code', 'TEXT', { required: true }),
    field(PS, 'job-profile-id', 'Job profile', 'REFERENCE', { readOnly: true, ref: 'job-profile-ref' }),
    field(PS, 'title', 'Title', 'TEXT', { readOnly: true }),
    field(PS, 'site-ref', 'Site', 'TEXT'),
    field(PS, 'organization-unit-id', 'Department', 'TEXT'),
    field(PS, 'fte', 'FTE', 'NUMBER', { scale: 2 }),
    field(PS, 'effective-from', 'Effective from', 'DATE', { required: true }),
    field(PS, 'effective-to', 'Effective to', 'DATE'),
    field(PS, 'status', 'Status', 'SELECT', { readOnly: true, ref: 'position-statuses' }),
    field(PS, 'created-at', 'Created at', 'DATETIME', { readOnly: true }),
  ];

  return window(
    'wf-jobs',
    'Jobs \u0026 positions',
    'Jobs',
    'Job profiles and their staffing positions.',
    'workforce:read',
    dictionary(
      'wf-jobs',
      'Jobs \u0026 positions',
      JP,
      [
        entity(JP, 'Job profiles'),
        entity(PS, 'Positions'),
      ],
      jf,
      [
        relationship('job-positions', JP, PS, 'job-profile-id'),
      ],
      [
        values('profile-statuses', PROFILE_STATUSES),
        values('worker-categories', WORKER_CATEGORIES),
        values('position-statuses', POSITION_STATUSES),
        JOB_PROFILE_REF,
      ],
      [
        view('jobs', 'Jobs', [
          tab('job-profile', 'Job profile', 0, JP, [
            ['code', 3, 'main'],
            ['title', 5, 'main'],
            ['status', 2, 'main'],
            ['worker-category', 4, 'main'],
            ['description', 12, 'main'],
            ['position-count', 3, 'details'],
            ['created-at', 6, 'meta'],
            ['updated-at', 6, 'meta'],
          ], jf, {
            sections: [
              section('main', 'General information', 0),
              section('details', 'Details', 1),
              section('meta', 'Audit trail', 2),
            ],
          }),
          tab('positions', 'Positions', 1, PS, [
            ['code', 2],
            ['title', 3],
            ['site-ref', 2],
            ['organization-unit-id', 2],
            ['fte', 1],
            ['effective-from', 2],
            ['effective-to', 2],
            ['status', 2],
            ['created-at', 2],
          ], jf, { parent: 'job-positions' }),
        ], { search: ['code', 'title'], sort: 'code' }),
      ],
      [
        action(
          JP,
          'deactivate',
          'Deactivate',
          'workforce.jobs.manage',
          ['status', 'EQ', 'ACTIVE'],
          'Deactivate this job profile? Existing positions remain until closed.',
          REASON_REQUIRED,
        ),
        action(
          JP,
          'activate',
          'Activate',
          'workforce.jobs.manage',
          ['status', 'EQ', 'INACTIVE'],
          'Reactivate this job profile?',
        ),
      ],
    ),
    { route: '/gigaops/jobs' },
  );

}
