// WI-OI-120u (M-WF1, ADR-0033 D1): Workforce metadata windows. Edit here, then run
// `node scripts/generate-windows.mjs gigaops` and `pnpm modules:catalog`.
// Jobs & positions is held back (owner, 2026-10-13) in jobs-window.held.mjs until it does what the workbench's Jobs screen
// does; /gigaops/jobs stays on the workbench until then.
// A record type shown in two windows (working weeks, absences) has the same fields in both: its field rules are one set.
// Child tabs add and list; a record's actions (end, approve, withdraw) are on the window where it is the main record.

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

const ABSENCE_STATUSES = [
  ['REQUESTED', 'Requested'],
  ['APPROVED', 'Approved'],
  ['REJECTED', 'Rejected'],
  ['CANCELLED', 'Cancelled'],
];

const CLOSURE_STATUSES = [
  ['ACTIVE', 'Active'],
  ['WITHDRAWN', 'Withdrawn'],
];

const BOOKING_STATUSES = [
  ['DRAFT', 'Draft'],
  ['CONFIRMED', 'Confirmed'],
  ['DISPATCHED', 'Dispatched'],
  ['ON_SITE', 'On site'],
  ['COMPLETED', 'Completed'],
  ['CANCELLED', 'Cancelled'],
];

const TIME_HELP = "In the person's working time zone (that of their working week; UTC if they have none).";

export function windowSource(builderFor) {
  const { entity, field, values, lookup, tab, section, relationship, action, view, dictionary, window, REASON_REQUIRED, REASON_OPTIONAL } = builderFor({
    route: '/gigaops/resources',
    createWith: {
      'wf-resources': ['gigaops', 'wf-resources', 'workforce.resources.manage'],
      'wf-absence-types': ['gigaops', 'wf-absence-types', 'workforce.calendars.manage'],
      'wf-calendars': ['gigaops', 'wf-calendars', 'workforce.calendars.manage'],
    },
  });

  const RESOURCE_REF = lookup('resource-ref', 'wf-resources');
  const CAPABILITY_REF = lookup('capability-ref', 'wf-capabilities');
  const ABSENCE_TYPE_REF = lookup('absence-type-ref', 'wf-absence-types');
  const CALENDAR_REF = lookup('calendar-ref', 'wf-calendars');
  // Served by the platform (PLATFORM_LOOKUPS in @gigalibs/contracts), read as the signed-in user.
  const MEMBER_REF = lookup('member-ref', 'workspace-members');
  const SITE_REF = lookup('site-ref', 'workspace-sites');

  const windows = {};

  // ─── Record types shown in more than one window ─────────────────────────────────────────────────────────
  const WP = 'wf.availability-patterns';
  const patternFields = [
    field(WP, 'resource-id', 'Person', 'REFERENCE', { required: true, ref: 'resource-ref' }),
    field(WP, 'effective-from', 'Starts on', 'DATE', { required: true, defaultValue: { $default: 'TODAY' } }),
    field(WP, 'effective-to', 'First day without it', 'DATE', { help: 'Leave empty for a week with no end.' }),
    field(WP, 'time-zone', 'Time zone', 'TEXT', { required: true, help: 'Where the person works, for example Europe/London or America/Chicago.' }),
    field(WP, 'working-hours', 'Working hours', 'TEXT', {
      required: true,
      defaultValue: 'Mon-Fri 09:00-17:00',
      help: 'Days and hours, for example "Mon-Fri 09:00-17:00; Sat 10:00-14:00". An end before the start runs past midnight.',
    }),
    field(WP, 'weekly-hours', 'Hours a week', 'NUMBER', { readOnly: true, scale: 2 }),
    field(WP, 'created-at', 'Created at', 'DATETIME', { readOnly: true }),
  ];

  const WA = 'wf.absences';
  const absenceFields = [
    field(WA, 'resource-id', 'Person', 'REFERENCE', { required: true, ref: 'resource-ref' }),
    field(WA, 'absence-type-id', 'Absence type', 'REFERENCE', { required: true, ref: 'absence-type-ref' }),
    field(WA, 'starts-at', 'From', 'DATETIME', { required: true, help: TIME_HELP }),
    field(WA, 'ends-at', 'Until', 'DATETIME', { required: true, help: TIME_HELP }),
    field(WA, 'time-zone', 'Time zone', 'TEXT', { readOnly: true }),
    field(WA, 'status', 'Status', 'SELECT', { readOnly: true, ref: 'absence-statuses' }),
    field(WA, 'note', 'Note', 'TEXTAREA'),
    field(WA, 'decided-at', 'Decided at', 'DATETIME', { readOnly: true }),
    field(WA, 'decision-reason', 'Reason', 'TEXT', { readOnly: true }),
    field(WA, 'created-at', 'Requested at', 'DATETIME', { readOnly: true }),
  ];
  const patternColumns = [
    ['effective-from', 2],
    ['effective-to', 2],
    ['working-hours', 4],
    ['time-zone', 2],
    ['weekly-hours', 2],
  ];

  // ─── People, with their skills, working weeks and absences ──────────────────────────────────────────────
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

    ...patternFields,
    ...absenceFields,
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
      [entity(WR, 'Resources'), entity(WQ, 'Skills'), entity(WP, 'Working weeks'), entity(WA, 'Absences')],
      rf,
      [
        relationship('resource-skills', WR, WQ, 'resource-id'),
        relationship('resource-working-weeks', WR, WP, 'resource-id'),
        relationship('resource-absences', WR, WA, 'resource-id'),
      ],
      [
        values('resource-types', RESOURCE_TYPES),
        values('record-statuses', RECORD_STATUSES),
        values('proficiencies', PROFICIENCIES),
        values('qualification-statuses', QUALIFICATION_STATUSES),
        values('absence-statuses', ABSENCE_STATUSES),
        RESOURCE_REF,
        CAPABILITY_REF,
        MEMBER_REF,
        ABSENCE_TYPE_REF,
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
          tab('working-weeks', 'Working weeks', 1, WP, patternColumns, rf, { parent: 'resource-working-weeks' }),
          tab('absences', 'Absences', 1, WA, [
            ['absence-type-id', 3],
            ['starts-at', 3],
            ['ends-at', 3],
            ['time-zone', 2],
            ['status', 2],
            ['decision-reason', 3],
            ['note', 12],
          ], rf, { parent: 'resource-absences' }),
        ], { search: ['reference-code', 'display-name'], sort: 'display-name' }),
      ],
      [
        action(WR, 'deactivate', 'Deactivate', 'workforce.resources.manage', ['status', 'EQ', 'ACTIVE'], 'Deactivate this resource?', REASON_REQUIRED),
        action(WR, 'activate', 'Activate', 'workforce.resources.manage', ['status', 'EQ', 'INACTIVE'], 'Reactivate this resource?'),
      ],
    ),
    { route: '/gigaops/resources' },
  );

  // ─── Availability page: absences, own absences, working weeks, absence types, calendars, closures ───────
  const AVAILABILITY = { route: '/gigaops/availability' };

  windows['wf-absences'] = window(
    'wf-absences',
    'Absence requests',
    'Absence requests',
    "Everyone's absences, requests waiting for a decision first. Nobody decides their own.",
    'workforce:read',
    dictionary(
      'wf-absences',
      'Absence requests',
      WA,
      [entity(WA, 'Absences')],
      absenceFields,
      [],
      [values('absence-statuses', ABSENCE_STATUSES), RESOURCE_REF, ABSENCE_TYPE_REF],
      [
        view('absences', 'Absences', [
          tab('absence', 'Absence', 0, WA, [
            ['resource-id', 4],
            ['absence-type-id', 4],
            ['status', 4],
            ['starts-at', 4],
            ['ends-at', 4],
            ['time-zone', 4],
            ['decided-at', 4],
            ['decision-reason', 8],
            ['note', 12],
          ], absenceFields),
        ], { search: ['resource-id'] }),
      ],
      [
        action(WA, 'approve', 'Approve', 'workforce.absences.approve', ['status', 'EQ', 'REQUESTED'], 'Approve this absence?', REASON_OPTIONAL),
        action(WA, 'reject', 'Reject', 'workforce.absences.approve', ['status', 'EQ', 'REQUESTED'], 'Reject this absence?', REASON_REQUIRED),
        action(WA, 'cancel', 'Cancel', 'workforce.absences.request', ['status', 'IN', ['REQUESTED', 'APPROVED']], 'Cancel this absence? An approved one can be cancelled until it starts.', REASON_OPTIONAL),
      ],
    ),
    AVAILABILITY,
  );

  const WM = 'wf.my-absences';
  const myAbsenceFields = [
    field(WM, 'absence-type-id', 'Absence type', 'REFERENCE', { required: true, ref: 'absence-type-ref' }),
    field(WM, 'starts-at', 'From', 'DATETIME', { required: true, help: 'In your working time zone (that of your working week; UTC if you have none).' }),
    field(WM, 'ends-at', 'Until', 'DATETIME', { required: true, help: 'In your working time zone (that of your working week; UTC if you have none).' }),
    field(WM, 'time-zone', 'Time zone', 'TEXT', { readOnly: true }),
    field(WM, 'status', 'Status', 'SELECT', { readOnly: true, ref: 'absence-statuses' }),
    field(WM, 'note', 'Note', 'TEXTAREA'),
    field(WM, 'decided-at', 'Decided at', 'DATETIME', { readOnly: true }),
    field(WM, 'decision-reason', 'Reason', 'TEXT', { readOnly: true }),
    field(WM, 'created-at', 'Requested at', 'DATETIME', { readOnly: true }),
  ];
  windows['wf-my-absences'] = window(
    'wf-my-absences',
    'My absences',
    'My absences',
    'Your own absences: ask for time off and follow the decision. Someone else decides.',
    'workforce:read',
    dictionary(
      'wf-my-absences',
      'My absences',
      WM,
      [entity(WM, 'My absences')],
      myAbsenceFields,
      [],
      [values('absence-statuses', ABSENCE_STATUSES), ABSENCE_TYPE_REF],
      [
        view('my-absences', 'My absences', [
          tab('my-absence', 'Absence', 0, WM, [
            ['absence-type-id', 4],
            ['status', 4],
            ['time-zone', 4],
            ['starts-at', 6],
            ['ends-at', 6],
            ['decided-at', 4],
            ['decision-reason', 8],
            ['note', 12],
          ], myAbsenceFields),
        ]),
      ],
      [
        action(WM, 'cancel', 'Cancel', 'workforce.absences.request-own', ['status', 'IN', ['REQUESTED', 'APPROVED']], 'Cancel this absence? An approved one can be cancelled until it starts.', REASON_OPTIONAL),
      ],
    ),
    AVAILABILITY,
  );

  windows['wf-working-weeks'] = window(
    'wf-working-weeks',
    'Working weeks',
    'Working weeks',
    "Everyone's working weeks: the hours each person is available, from which date.",
    'workforce:read',
    dictionary(
      'wf-working-weeks',
      'Working weeks',
      WP,
      [entity(WP, 'Working weeks')],
      patternFields,
      [],
      [RESOURCE_REF],
      [
        view('working-weeks', 'Working weeks', [
          tab('working-week', 'Working week', 0, WP, [['resource-id', 4], ...patternColumns.map(([key]) => [key, 4])], patternFields),
        ], { search: ['resource-id'] }),
      ],
      [
        action(WP, 'end', 'End', 'workforce.availability.manage', ['effective-to', 'IS_NULL', null], 'End this working week so a new one can follow?', [
          { key: 'effective-to', label: 'First day without this week (YYYY-MM-DD)', type: 'DATE', required: true },
        ]),
      ],
    ),
    AVAILABILITY,
  );

  const WT = 'wf.absence-types';
  const typeFields = [
    field(WT, 'code', 'Code', 'TEXT', { required: true, help: 'Short code, for example VACATION. It cannot change later.' }),
    field(WT, 'name', 'Name', 'TEXT', { required: true }),
    field(WT, 'paid', 'Paid', 'BOOLEAN', { defaultValue: false }),
    field(WT, 'requires-approval', 'Needs approval', 'BOOLEAN', { defaultValue: true, help: 'Without it, a request is approved at once.' }),
    field(WT, 'status', 'Status', 'SELECT', { readOnly: true, ref: 'record-statuses' }),
  ];
  windows['wf-absence-types'] = window(
    'wf-absence-types',
    'Absence types',
    'Absence types',
    'The kinds of absence people can ask for, and whether each is paid and needs a decision.',
    'workforce:read',
    dictionary(
      'wf-absence-types',
      'Absence types',
      WT,
      [entity(WT, 'Absence types')],
      typeFields,
      [],
      [values('record-statuses', RECORD_STATUSES)],
      [
        view('absence-types', 'Absence types', [
          tab('absence-type', 'Absence type', 0, WT, [['code', 3], ['name', 5], ['paid', 2], ['requires-approval', 2], ['status', 3]], typeFields),
        ]),
      ],
      [
        action(WT, 'deactivate', 'Deactivate', 'workforce.calendars.manage', ['status', 'EQ', 'ACTIVE'], 'Deactivate this absence type? Nobody can ask for it after.'),
        action(WT, 'activate', 'Activate', 'workforce.calendars.manage', ['status', 'EQ', 'INACTIVE'], 'Reactivate this absence type?'),
      ],
    ),
    AVAILABILITY,
  );

  const WC = 'wf.calendars';
  const calendarFields = [
    field(WC, 'code', 'Code', 'TEXT', { required: true }),
    field(WC, 'name', 'Name', 'TEXT', { required: true }),
    field(WC, 'site-ref', 'Site', 'REFERENCE', { ref: 'site-ref', help: 'Leave empty for the calendar of the whole workspace.' }),
    field(WC, 'closure-count', 'Closures', 'INTEGER', { readOnly: true }),
  ];
  windows['wf-calendars'] = window(
    'wf-calendars',
    'Site calendars',
    'Site calendars',
    'The workspace calendar and one per site; their closures take working time away.',
    'workforce:read',
    dictionary(
      'wf-calendars',
      'Site calendars',
      WC,
      [entity(WC, 'Calendars')],
      calendarFields,
      [],
      [SITE_REF],
      [view('calendars', 'Calendars', [tab('calendar', 'Calendar', 0, WC, [['code', 3], ['name', 5], ['site-ref', 5], ['closure-count', 2]], calendarFields)])],
    ),
    AVAILABILITY,
  );

  const WX = 'wf.calendar-closures';
  const closureFields = [
    field(WX, 'calendar-id', 'Calendar', 'REFERENCE', { required: true, ref: 'calendar-ref' }),
    field(WX, 'closure-date', 'Date', 'DATE', { required: true }),
    field(WX, 'label', 'Label', 'TEXT', { required: true, help: 'For example New Year or Site shutdown.' }),
    field(WX, 'status', 'Status', 'SELECT', { readOnly: true, ref: 'closure-statuses' }),
  ];
  windows['wf-closures'] = window(
    'wf-closures',
    'Closures',
    'Closures',
    'Days a calendar closes; nobody on it is available then.',
    'workforce:read',
    dictionary(
      'wf-closures',
      'Closures',
      WX,
      [entity(WX, 'Closures')],
      closureFields,
      [],
      [values('closure-statuses', CLOSURE_STATUSES), CALENDAR_REF],
      [view('closures', 'Closures', [tab('closure', 'Closure', 0, WX, [['calendar-id', 4], ['closure-date', 3], ['label', 5], ['status', 2]], closureFields)], { search: ['label'] })],
      [action(WX, 'withdraw', 'Withdraw', 'workforce.calendars.manage', ['status', 'EQ', 'ACTIVE'], 'Withdraw this closure? The day becomes a working day again.')],
    ),
    AVAILABILITY,
  );

  // ─── Bookings: read only (made and moved on the dispatch board) ─────────────────────────────────────────
  const WB = 'wf.bookings';
  const bookingFields = [
    field(WB, 'requirement-title', 'Work', 'TEXT', { readOnly: true }),
    field(WB, 'resource-id', 'Person', 'REFERENCE', { readOnly: true, ref: 'resource-ref' }),
    field(WB, 'site-ref', 'Site', 'REFERENCE', { readOnly: true, ref: 'site-ref' }),
    field(WB, 'starts-at', 'From', 'DATETIME', { readOnly: true, help: TIME_HELP }),
    field(WB, 'ends-at', 'Until', 'DATETIME', { readOnly: true, help: TIME_HELP }),
    field(WB, 'time-zone', 'Time zone', 'TEXT', { readOnly: true }),
    field(WB, 'status', 'Status', 'SELECT', { readOnly: true, ref: 'booking-statuses' }),
    field(WB, 'override-reason', 'Booked despite', 'TEXT', { readOnly: true }),
    field(WB, 'cancel-reason', 'Cancelled because', 'TEXT', { readOnly: true }),
    field(WB, 'created-at', 'Booked at', 'DATETIME', { readOnly: true }),
  ];
  windows['wf-bookings'] = window(
    'wf-bookings',
    'Bookings',
    'Bookings',
    'Who is booked on which work, when and where. Bookings are made and moved on Scheduling & dispatch.',
    'workforce:read',
    dictionary(
      'wf-bookings',
      'Bookings',
      WB,
      [entity(WB, 'Bookings')],
      bookingFields,
      [],
      [values('booking-statuses', BOOKING_STATUSES), RESOURCE_REF, SITE_REF],
      [
        view('bookings', 'Bookings', [
          tab('booking', 'Booking', 0, WB, [
            ['requirement-title', 4],
            ['resource-id', 4],
            ['status', 4],
            ['starts-at', 4],
            ['ends-at', 4],
            ['time-zone', 4],
            ['site-ref', 4],
            ['override-reason', 4],
            ['cancel-reason', 4],
            ['created-at', 4],
          ], bookingFields),
        ], { search: ['requirement-title'], sort: 'starts-at' }),
      ],
    ),
    { route: '/gigaops/bookings' },
  );

  return windows;
}
