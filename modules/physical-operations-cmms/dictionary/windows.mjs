// WI-OI-120t (M-CM1, ADR-0033 D1): CMMS metadata windows. Edit here, then run
// `node scripts/generate-windows.mjs physical-operations-cmms` and `pnpm modules:catalog`.

const WO_TYPES = [
  ['REACTIVE', 'Reactive'],
  ['PREVENTIVE', 'Preventive'],
  ['INSPECTION', 'Inspection'],
  ['EMERGENCY', 'Emergency'],
];

const PRIORITIES = [
  ['LOW', 'Low'],
  ['MEDIUM', 'Medium'],
  ['HIGH', 'High'],
  ['EMERGENCY', 'Emergency'],
];

const WO_STATUSES = [
  ['OPEN', 'Open'],
  ['IN_PROGRESS', 'In progress'],
  ['ON_HOLD', 'On hold'],
  ['COMPLETED', 'Completed'],
  ['CANCELLED', 'Cancelled'],
];

const TASK_STATUSES = [
  ['PENDING', 'Pending'],
  ['DONE', 'Done'],
  ['FAILED', 'Failed'],
  ['NOT_APPLICABLE', 'Not applicable'],
];

const TIME_CATEGORIES = [
  ['REGULAR', 'Regular'],
  ['OVERTIME', 'Overtime'],
  ['TRAVEL', 'Travel'],
];

const TRIGGER_SOURCES = [
  ['MANUAL', 'Manual'],
  ['PM_SCHEDULE', 'PM schedule'],
  ['METER_TRIGGER', 'Meter trigger'],
];

const REQUEST_STATUSES = [
  ['PENDING', 'Pending'],
  ['ACCEPTED', 'Accepted'],
  ['REJECTED', 'Rejected'],
  ['CANCELLED', 'Cancelled'],
];

export function windowSource(builderFor) {
  const {
    entity,
    field,
    values,
    lookup,
    tab,
    section,
    relationship,
    action,
    view,
    dictionary,
    window,
    REASON_REQUIRED,
    REASON_OPTIONAL,
  } = builderFor({
    route: '/cmms/work-orders',
    createWith: {
      'cmms-work-orders': ['physical-operations-cmms', 'cmms-work-orders', 'cmms.work-orders.write'],
      'cmms-requests': ['physical-operations-cmms', 'cmms-requests', 'cmms.requests.create'],
    },
  });

  const ASSET_REF = lookup('asset-ref', 'cmms-assets');
  const PART_REF = lookup('part-ref', 'cmms-parts');
  const WORK_ORDER_REF = lookup('work-order-ref', 'cmms-work-orders');
  const REQUEST_REF = lookup('request-ref', 'cmms-requests');

  const windows = {};

  // 1. Work orders with child tabs: tasks, labour, parts, notes, history
  const WO = 'cmms.work-orders';
  const WT = 'cmms.work-order-tasks';
  const WL = 'cmms.work-order-labour';
  const WP = 'cmms.work-order-parts';
  const WN = 'cmms.work-order-notes';
  const WH = 'cmms.work-order-history';

  const wof = [
    // Header fields
    field(WO, 'wo-number', 'WO number', 'TEXT', { readOnly: true }),
    field(WO, 'title', 'Title', 'TEXT', { required: true, help: 'Brief description of the maintenance work required.' }),
    field(WO, 'description', 'Description', 'TEXTAREA'),
    field(WO, 'type', 'Type', 'SELECT', { required: true, ref: 'work-order-types' }),
    field(WO, 'priority', 'Priority', 'SELECT', { required: true, ref: 'priorities' }),
    field(WO, 'status', 'Status', 'SELECT', { readOnly: true, ref: 'work-order-statuses' }),
    field(WO, 'asset-id', 'Asset', 'REFERENCE', { ref: 'asset-ref' }),
    field(WO, 'assigned-to', 'Assigned technician', 'TEXT', { help: 'Login of the technician assigned to execute this work order.' }),
    field(WO, 'due-at', 'Due date', 'DATETIME'),
    field(WO, 'estimated-hours', 'Estimated hours', 'NUMBER', { scale: 1 }),
    field(WO, 'requires-signature', 'Requires signature', 'BOOLEAN'),
    field(WO, 'trigger-source', 'Trigger source', 'SELECT', { readOnly: true, ref: 'trigger-sources' }),
    field(WO, 'started-at', 'Started at', 'DATETIME', { readOnly: true }),
    field(WO, 'completed-at', 'Completed at', 'DATETIME', { readOnly: true }),
    field(WO, 'completion-notes', 'Completion notes', 'TEXTAREA', { readOnly: true }),
    field(WO, 'created-by', 'Created by', 'TEXT', { readOnly: true }),
    field(WO, 'created-at', 'Created at', 'DATETIME', { readOnly: true }),

    // Tasks fields
    field(WT, 'work-order-id', 'Work order', 'REFERENCE', { readOnly: true, ref: 'work-order-ref' }),
    field(WT, 'position', 'Position', 'INTEGER', { readOnly: true }),
    field(WT, 'label', 'Task description', 'TEXT', { required: true }),
    field(WT, 'required', 'Required', 'BOOLEAN'),
    field(WT, 'status', 'Status', 'SELECT', { ref: 'task-statuses' }),
    field(WT, 'result-value', 'Result value', 'NUMBER', { scale: 2 }),
    field(WT, 'notes', 'Notes', 'TEXTAREA'),
    field(WT, 'completed-by', 'Completed by', 'TEXT', { readOnly: true }),
    field(WT, 'completed-at', 'Completed at', 'DATETIME', { readOnly: true }),

    // Labour fields
    field(WL, 'work-order-id', 'Work order', 'REFERENCE', { readOnly: true, ref: 'work-order-ref' }),
    field(WL, 'worker-ref', 'Technician', 'TEXT', { required: true }),
    field(WL, 'hours', 'Hours', 'NUMBER', { required: true, scale: 2 }),
    field(WL, 'hourly-rate', 'Hourly rate', 'NUMBER', { scale: 2 }),
    field(WL, 'currency-code', 'Currency', 'TEXT'),
    field(WL, 'time-category', 'Category', 'SELECT', { ref: 'time-categories' }),
    field(WL, 'performed-on', 'Date performed', 'DATE', { required: true }),
    field(WL, 'notes', 'Notes', 'TEXTAREA'),
    field(WL, 'created-at', 'Logged at', 'DATETIME', { readOnly: true }),

    // Parts fields
    field(WP, 'work-order-id', 'Work order', 'REFERENCE', { readOnly: true, ref: 'work-order-ref' }),
    field(WP, 'part-id', 'Part', 'REFERENCE', { required: true, ref: 'part-ref' }),
    field(WP, 'part-number', 'Part number', 'TEXT', { readOnly: true }),
    field(WP, 'part-name', 'Part name', 'TEXT', { readOnly: true }),
    field(WP, 'quantity', 'Quantity', 'NUMBER', { required: true, scale: 2 }),
    field(WP, 'unit-cost', 'Unit cost', 'NUMBER', { readOnly: true, scale: 2 }),
    field(WP, 'currency-code', 'Currency', 'TEXT', { readOnly: true }),
    field(WP, 'storeroom-id', 'Storeroom', 'TEXT'),
    field(WP, 'bin-location', 'Bin location', 'TEXT'),
    field(WP, 'created-at', 'Issued at', 'DATETIME', { readOnly: true }),

    // Notes fields
    field(WN, 'work-order-id', 'Work order', 'REFERENCE', { readOnly: true, ref: 'work-order-ref' }),
    field(WN, 'body', 'Note', 'TEXTAREA', { required: true }),
    field(WN, 'actor-subject', 'Author', 'TEXT', { readOnly: true }),
    field(WN, 'occurred-at', 'Posted at', 'DATETIME', { readOnly: true }),

    // History fields
    field(WH, 'work-order-id', 'Work order', 'REFERENCE', { readOnly: true, ref: 'work-order-ref' }),
    field(WH, 'event-type', 'Event', 'TEXT', { readOnly: true }),
    field(WH, 'from-status', 'From status', 'TEXT', { readOnly: true }),
    field(WH, 'to-status', 'To status', 'TEXT', { readOnly: true }),
    field(WH, 'actor-subject', 'User', 'TEXT', { readOnly: true }),
    field(WH, 'occurred-at', 'Occurred at', 'DATETIME', { readOnly: true }),
  ];

  windows['cmms-work-orders'] = window(
    'cmms-work-orders',
    'Maintenance work orders',
    'Work orders',
    'Raise, execute and complete maintenance work with evidence.',
    'cmms:read',
    dictionary(
      'cmms-work-orders',
      'Maintenance work orders',
      WO,
      [
        entity(WO, 'Work orders'),
        entity(WT, 'Tasks'),
        entity(WL, 'Labour'),
        entity(WP, 'Parts'),
        entity(WN, 'Notes'),
        entity(WH, 'History'),
      ],
      wof,
      [
        relationship('work-order-tasks', WO, WT, 'work-order-id'),
        relationship('work-order-labour', WO, WL, 'work-order-id'),
        relationship('work-order-parts', WO, WP, 'work-order-id'),
        relationship('work-order-notes', WO, WN, 'work-order-id'),
        relationship('work-order-history', WO, WH, 'work-order-id'),
      ],
      [
        values('work-order-types', WO_TYPES),
        values('priorities', PRIORITIES),
        values('work-order-statuses', WO_STATUSES),
        values('task-statuses', TASK_STATUSES),
        values('time-categories', TIME_CATEGORIES),
        values('trigger-sources', TRIGGER_SOURCES),
        ASSET_REF,
        PART_REF,
        WORK_ORDER_REF,
      ],
      [
        view('work-orders', 'Work orders', [
          tab('work-order', 'Work order', 0, WO, [
            ['wo-number', 3, 'main'],
            ['title', 6, 'main'],
            ['status', 3, 'main'],
            ['type', 3, 'main'],
            ['priority', 3, 'main'],
            ['asset-id', 6, 'main'],
            ['description', 12, 'main'],
            ['assigned-to', 4, 'planning'],
            ['due-at', 4, 'planning'],
            ['estimated-hours', 4, 'planning'],
            ['requires-signature', 4, 'planning'],
            ['trigger-source', 4, 'planning'],
            ['started-at', 4, 'execution'],
            ['completed-at', 4, 'execution'],
            ['completion-notes', 12, 'execution'],
            ['created-by', 6, 'meta'],
            ['created-at', 6, 'meta'],
          ], wof, {
            sections: [
              section('main', 'General information', 0),
              section('planning', 'Planning & Assignment', 1),
              section('execution', 'Execution status', 2),
              section('meta', 'Audit trail', 3),
            ],
          }),
          tab('tasks', 'Tasks', 1, WT, [
            ['position', 1],
            ['label', 5],
            ['required', 2],
            ['status', 2],
            ['result-value', 2],
            ['notes', 6],
            ['completed-by', 3],
            ['completed-at', 3],
          ], wof, { parent: 'work-order-tasks' }),
          tab('labour', 'Labour', 1, WL, [
            ['worker-ref', 3],
            ['hours', 2],
            ['time-category', 2],
            ['performed-on', 2],
            ['hourly-rate', 3],
            ['currency-code', 2],
            ['notes', 6],
            ['created-at', 4],
          ], wof, { parent: 'work-order-labour' }),
          tab('parts', 'Parts', 1, WP, [
            ['part-id', 4],
            ['part-number', 3],
            ['part-name', 3],
            ['quantity', 2],
            ['unit-cost', 2],
            ['currency-code', 2],
            ['storeroom-id', 3],
            ['bin-location', 3],
            ['created-at', 2],
          ], wof, { parent: 'work-order-parts' }),
          tab('notes', 'Notes', 1, WN, [
            ['body', 8],
            ['actor-subject', 2],
            ['occurred-at', 2],
          ], wof, { parent: 'work-order-notes' }),
          tab('history', 'History', 1, WH, [
            ['event-type', 3],
            ['from-status', 2],
            ['to-status', 2],
            ['actor-subject', 2],
            ['occurred-at', 3],
          ], wof, { parent: 'work-order-history' }),
        ], { search: ['wo-number', 'title'], sort: 'wo-number' }),
      ],
      [
        action(
          WO,
          'start',
          'Start work',
          'cmms.work-orders.execute-own',
          ['status', 'EQ', 'OPEN'],
          'Start work on this work order?',
        ),
        action(
          WO,
          'hold',
          'Put on hold',
          'cmms.work-orders.execute-own',
          ['status', 'EQ', 'IN_PROGRESS'],
          'Put this work order on hold?',
          REASON_REQUIRED,
        ),
        action(
          WO,
          'resume',
          'Resume work',
          'cmms.work-orders.execute-own',
          ['status', 'EQ', 'ON_HOLD'],
          'Resume work on this work order?',
        ),
        action(
          WO,
          'complete',
          'Complete work',
          'cmms.work-orders.execute-own',
          ['status', 'EQ', 'IN_PROGRESS'],
          'Complete this work order? All required tasks must be recorded.',
          REASON_OPTIONAL,
        ),
        action(
          WO,
          'cancel',
          'Cancel',
          'cmms.work-orders.execute-own',
          ['status', 'IN', ['OPEN', 'IN_PROGRESS', 'ON_HOLD']],
          'Cancel this work order? This cannot be undone.',
          REASON_REQUIRED,
        ),
      ],
    ),
  );

  // 2. Maintenance requests
  const REQ = 'cmms.maintenance-requests';
  const reqf = [
    field(REQ, 'request-number', 'Request number', 'TEXT', { readOnly: true }),
    field(REQ, 'title', 'Title', 'TEXT', { required: true, help: 'Summary of the issue or maintenance request.' }),
    field(REQ, 'description', 'Description', 'TEXTAREA'),
    field(REQ, 'priority', 'Priority', 'SELECT', { required: true, ref: 'priorities' }),
    field(REQ, 'status', 'Status', 'SELECT', { readOnly: true, ref: 'request-statuses' }),
    field(REQ, 'asset-id', 'Asset', 'REFERENCE', { ref: 'asset-ref' }),
    field(REQ, 'requester-name', 'Requester name', 'TEXT'),
    field(REQ, 'requester-email', 'Requester email', 'TEXT'),
    field(REQ, 'requester-phone', 'Requester phone', 'TEXT'),
    field(REQ, 'requester-subject', 'Requester login', 'TEXT', { readOnly: true }),
    field(REQ, 'rejection-reason', 'Rejection reason', 'TEXTAREA', { readOnly: true }),
    field(REQ, 'converted-wo-id', 'Work order', 'REFERENCE', { readOnly: true, ref: 'work-order-ref' }),
    field(REQ, 'triaged-by', 'Triaged by', 'TEXT', { readOnly: true }),
    field(REQ, 'triaged-at', 'Triaged at', 'DATETIME', { readOnly: true }),
    field(REQ, 'created-at', 'Submitted at', 'DATETIME', { readOnly: true }),
  ];

  windows['cmms-requests'] = window(
    'cmms-requests',
    'Maintenance requests',
    'Requests',
    'Intake, track and triage maintenance requests.',
    'cmms:read',
    dictionary(
      'cmms-requests',
      'Maintenance requests',
      REQ,
      [entity(REQ, 'Maintenance requests')],
      reqf,
      [],
      [
        values('request-statuses', REQUEST_STATUSES),
        values('priorities', PRIORITIES),
        ASSET_REF,
        WORK_ORDER_REF,
      ],
      [
        view('requests', 'Maintenance requests', [
          tab('request', 'Request', 0, REQ, [
            ['request-number', 3, 'main'],
            ['title', 6, 'main'],
            ['priority', 3, 'main'],
            ['status', 3, 'main'],
            ['asset-id', 5, 'main'],
            ['requester-name', 4, 'main'],
            ['description', 12, 'details'],
            ['requester-email', 6, 'contact'],
            ['requester-phone', 6, 'contact'],
            ['converted-wo-id', 4, 'triage'],
            ['rejection-reason', 8, 'triage'],
            ['triaged-by', 4, 'triage'],
            ['triaged-at', 4, 'triage'],
            ['created-at', 4, 'triage'],
          ], reqf, {
            sections: [
              section('main', 'General information', 0),
              section('details', 'Issue description', 1),
              section('contact', 'Contact information', 2),
              section('triage', 'Triage resolution', 3),
            ],
          }),
        ], { search: ['request-number', 'title', 'requester-name'], sort: 'request-number' }),
      ],
      [
        action(
          REQ,
          'accept',
          'Accept into work order',
          'cmms.requests.write',
          ['status', 'EQ', 'PENDING'],
          'Accept this request and generate a work order?',
        ),
        action(
          REQ,
          'reject',
          'Reject request',
          'cmms.requests.write',
          ['status', 'EQ', 'PENDING'],
          'Reject this request? A reason is required.',
          REASON_REQUIRED,
        ),
        action(
          REQ,
          'cancel',
          'Cancel request',
          'cmms.requests.create',
          ['status', 'EQ', 'PENDING'],
          'Cancel this request? This cannot be undone.',
          REASON_OPTIONAL,
        ),
      ],
    ),
    { route: '/cmms/requests' },
  );

  return windows;
}
