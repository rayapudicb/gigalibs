// WI-OI-120u (M-WF1, ADR-0033 D1): Workforce metadata windows. Edit here, then run
// `node scripts/generate-windows.mjs gigaops` and `pnpm modules:catalog`.
// Jobs & positions is held back (owner, 2026-10-13) in jobs-window.held.mjs until it does what the workbench's Jobs screen
// does; /gigaops/jobs stays on the workbench until then.

const RESOURCE_TYPES = [
  ['HUMAN', 'Human'],
  ['TEAM', 'Team'],
  ['POOL', 'Pool'],
];

const RECORD_STATUSES = [
  ['ACTIVE', 'Active'],
  ['INACTIVE', 'Inactive'],
];

const PROFICIENCIES = [
  ['STANDARD', 'Standard'],
  ['ADVANCED', 'Advanced'],
  ['EXPERT', 'Expert'],
  ['MASTER', 'Master'],
];

const QUALIFICATION_STATUSES = [
  ['ACTIVE', 'Active'],
  ['SUSPENDED', 'Suspended'],
  ['EXPIRED', 'Expired'],
  ['REVOKED', 'Revoked'],
];

export function windowSource(builderFor) {
  const { entity, field, values, lookup, tab, section, relationship, action, view, dictionary, window, REASON_REQUIRED } = builderFor({
    route: '/gigaops/resources',
    createWith: {
      'wf-resources': ['gigaops', 'wf-resources', 'workforce.resources.manage'],
    },
  });

  const RESOURCE_REF = lookup('resource-ref', 'wf-resources');
  const CAPABILITY_REF = lookup('capability-ref', 'wf-capabilities');
  // Served by the platform (PLATFORM_LOOKUPS in @gigalibs/contracts): the workspace's own members, read as the user.
  const MEMBER_REF = lookup('member-ref', 'workspace-members');

  const windows = {};

  // People (resources), with their skills (qualifications) as a child tab.
  const WR = 'wf.resources';
  const WQ = 'wf.resource-skills';

  const rf = [
    field(WR, 'reference-code', 'Reference code', 'TEXT', { required: true, help: 'Unique code identifying this person or resource. It cannot change later.' }),
    field(WR, 'display-name', 'Display name', 'TEXT', { required: true }),
    field(WR, 'resource-type', 'Type', 'SELECT', { required: true, ref: 'resource-types' }),
    // WI-OI-120n: linking a person to a login stays with workspace administrators (not delegable).
    field(WR, 'platform-user-id', 'Linked login', 'REFERENCE', {
      ref: 'member-ref',
      writePermission: 'workforce.resources.link',
      help: 'The workspace member who is this person: they then see their own jobs, punch time and request absence. Only administrators link or change a login.',
    }),
    field(WR, 'status', 'Status', 'SELECT', { readOnly: true, ref: 'record-statuses' }),
    field(WR, 'qualification-count', 'Skills', 'INTEGER', { readOnly: true }),
    field(WR, 'created-at', 'Created at', 'DATETIME', { readOnly: true }),
    field(WR, 'updated-at', 'Updated at', 'DATETIME', { readOnly: true }),

    // The parent link is set by the tab, not typed.
    field(WQ, 'resource-id', 'Resource', 'REFERENCE', { required: true, ref: 'resource-ref' }),
    field(WQ, 'capability-definition-id', 'Skill', 'REFERENCE', { required: true, ref: 'capability-ref', help: 'A skill or qualification defined under Skills & qualifications.' }),
    field(WQ, 'proficiency', 'Proficiency', 'SELECT', { ref: 'proficiencies' }),
    field(WQ, 'status', 'Status', 'SELECT', { readOnly: true, ref: 'qualification-statuses' }),
    field(WQ, 'valid-from', 'Valid from', 'DATE', { required: true }),
    field(WQ, 'expires-at', 'Expires', 'DATE'),
    field(WQ, 'issuing-authority', 'Issuing authority', 'TEXT'),
    field(WQ, 'evidence-reference', 'Evidence reference', 'TEXT'),
    field(WQ, 'created-at', 'Created at', 'DATETIME', { readOnly: true }),
  ];

  windows['wf-resources'] = window(
    'wf-resources',
    'Workforce resources',
    'People',
    'People, teams and resource pools in the workforce.',
    'workforce:read',
    dictionary(
      'wf-resources',
      'Workforce resources',
      WR,
      [entity(WR, 'Resources'), entity(WQ, 'Skills')],
      rf,
      [relationship('resource-skills', WR, WQ, 'resource-id')],
      [
        values('resource-types', RESOURCE_TYPES),
        values('record-statuses', RECORD_STATUSES),
        values('proficiencies', PROFICIENCIES),
        values('qualification-statuses', QUALIFICATION_STATUSES),
        RESOURCE_REF,
        CAPABILITY_REF,
        MEMBER_REF,
      ],
      [
        view('resources', 'Resources', [
          tab('resource', 'Resource', 0, WR, [
            ['reference-code', 3, 'main'],
            ['display-name', 5, 'main'],
            ['resource-type', 4, 'main'],
            ['status', 3, 'details'],
            ['platform-user-id', 5, 'details'],
            ['qualification-count', 2, 'details'],
            ['created-at', 6, 'meta'],
            ['updated-at', 6, 'meta'],
          ], rf, {
            sections: [
              section('main', 'General information', 0),
              section('details', 'Details', 1),
              section('meta', 'Audit trail', 2),
            ],
          }),
          tab('skills', 'Skills', 1, WQ, [
            ['capability-definition-id', 4],
            ['proficiency', 2],
            ['status', 2],
            ['valid-from', 2],
            ['expires-at', 2],
            ['issuing-authority', 3],
            ['evidence-reference', 3],
            ['created-at', 3],
          ], rf, { parent: 'resource-skills' }),
        ], { search: ['reference-code', 'display-name'], sort: 'display-name' }),
      ],
      [
        action(WR, 'deactivate', 'Deactivate', 'workforce.resources.manage', ['status', 'EQ', 'ACTIVE'], 'Deactivate this resource?', REASON_REQUIRED),
        action(WR, 'activate', 'Activate', 'workforce.resources.manage', ['status', 'EQ', 'INACTIVE'], 'Reactivate this resource?'),
      ],
    ),
    { route: '/gigaops/resources' },
  );

  return windows;
}
