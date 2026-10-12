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

const INTERVAL_UNITS = [
  ['DAY', 'Day(s)'],
  ['WEEK', 'Week(s)'],
  ['MONTH', 'Month(s)'],
  ['YEAR', 'Year(s)'],
];

const READING_TYPES = [
  ['GAUGE', 'Gauge (continuous)'],
  ['COUNTER', 'Counter (cumulative)'],
];

const PART_CATEGORIES = [
  ['MECHANICAL', 'Mechanical'],
  ['ELECTRICAL', 'Electrical'],
  ['HYDRAULIC', 'Hydraulic'],
  ['PNEUMATIC', 'Pneumatic'],
  ['SAFETY', 'Safety'],
  ['CONSUMABLE', 'Consumable'],
  ['OTHER', 'Other'],
];

const MOVEMENT_TYPES = [
  ['RECEIPT', 'Receipt'],
  ['ISSUE', 'Issue'],
  ['RETURN', 'Return'],
  ['ADJUSTMENT', 'Adjustment'],
  ['CYCLE_COUNT', 'Cycle count'],
];

const CURRENCIES = [
  ['USD', 'USD'],
  ['EUR', 'EUR'],
  ['GBP', 'GBP'],
];

const ASSET_STATUSES = [
  ['OPERATIONAL', 'Operational'],
  ['UNDER_MAINTENANCE', 'Under maintenance'],
  ['OFFLINE', 'Offline'],
  ['DECOMMISSIONED', 'Decommissioned'],
];

const CRITICALITIES = [
  ['LOW', 'Low'],
  ['MEDIUM', 'Medium'],
  ['HIGH', 'High'],
  ['CRITICAL', 'Critical'],
];

const SPACE_TYPES = [
  ['SITE', 'Site'],
  ['BUILDING', 'Building'],
  ['FLOOR', 'Floor'],
  ['ROOM', 'Room'],
  ['ZONE', 'Zone'],
];

const SPEC_DATA_TYPES = [
  ['NUMBER', 'Number'],
  ['TEXT', 'Text'],
  ['BOOLEAN', 'Boolean'],
  ['DATE', 'Date'],
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
      'cmms-schedules': ['physical-operations-cmms', 'cmms-schedules', 'cmms.pm.write'],
      'cmms-meters': ['physical-operations-cmms', 'cmms-meters', 'cmms.meters.write'],
      'cmms-parts': ['physical-operations-cmms', 'cmms-parts', 'cmms.parts.write'],
      'cmms-assets': ['physical-operations-cmms', 'cmms-assets', 'cmms.assets.write'],
      'cmms-spaces': ['physical-operations-cmms', 'cmms-spaces', 'cmms.assets.write'],
      'cmms-classifications': ['physical-operations-cmms', 'cmms-classifications', 'cmms.assets.write'],
    },
  });

  const ASSET_REF = lookup('asset-ref', 'cmms-assets');
  const PART_REF = lookup('part-ref', 'cmms-parts');
  const WORK_ORDER_REF = lookup('work-order-ref', 'cmms-work-orders');
  const REQUEST_REF = lookup('request-ref', 'cmms-requests');
  const SPACE_REF = lookup('space-ref', 'cmms-spaces');
  const CLASSIFICATION_REF = lookup('classification-ref', 'cmms-classifications');

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

  // 3. Preventive maintenance schedules (Slice 3)
  const PMS = 'cmms.pm-schedules';
  const pmsf = [
    field(PMS, 'name', 'Schedule name', 'TEXT', { required: true, help: 'Descriptive title for this preventive maintenance schedule.' }),
    field(PMS, 'description', 'Description', 'TEXTAREA'),
    field(PMS, 'asset-id', 'Asset', 'REFERENCE', { required: true, ref: 'asset-ref' }),
    field(PMS, 'is-active', 'Active', 'BOOLEAN', { default: true }),
    field(PMS, 'interval-count', 'Frequency count', 'NUMBER', { required: true, default: 1 }),
    field(PMS, 'interval-unit', 'Frequency unit', 'SELECT', { required: true, ref: 'interval-units', default: 'MONTH' }),
    field(PMS, 'time-zone', 'Time zone', 'TEXT', { default: 'UTC' }),
    field(PMS, 'next-due-at', 'Next due date', 'DATETIME', { required: true }),
    field(PMS, 'last-generated-at', 'Last generated at', 'DATETIME', { readOnly: true }),
    field(PMS, 'overdue', 'Overdue', 'BOOLEAN', { readOnly: true }),
    field(PMS, 'wo-title', 'Work order title', 'TEXT', { required: true }),
    field(PMS, 'wo-description', 'Work order description', 'TEXTAREA'),
    field(PMS, 'wo-priority', 'Priority', 'SELECT', { required: true, ref: 'priorities', default: 'MEDIUM' }),
    field(PMS, 'estimated-hours', 'Estimated hours', 'NUMBER'),
    field(PMS, 'requires-signature', 'Requires signature', 'BOOLEAN', { default: false }),
  ];

  windows['cmms-schedules'] = window(
    'cmms-schedules',
    'Preventive maintenance schedules',
    'PM Schedules',
    'Manage recurring maintenance schedules and trigger preventive work orders.',
    'cmms:read',
    dictionary(
      'cmms-schedules',
      'Preventive maintenance schedules',
      PMS,
      [entity(PMS, 'Preventive schedules')],
      pmsf,
      [],
      [
        values('interval-units', INTERVAL_UNITS),
        values('priorities', PRIORITIES),
        ASSET_REF,
      ],
      [
        view('schedules', 'PM Schedules', [
          tab('schedule', 'Schedule', 0, PMS, [
            ['name', 6, 'main'],
            ['asset-id', 6, 'main'],
            ['is-active', 3, 'main'],
            ['interval-count', 3, 'cadence'],
            ['interval-unit', 3, 'cadence'],
            ['time-zone', 3, 'cadence'],
            ['next-due-at', 3, 'cadence'],
            ['last-generated-at', 4, 'cadence'],
            ['overdue', 2, 'cadence'],
            ['description', 12, 'main'],
            ['wo-title', 6, 'work-order'],
            ['wo-priority', 3, 'work-order'],
            ['estimated-hours', 3, 'work-order'],
            ['requires-signature', 3, 'work-order'],
            ['wo-description', 12, 'work-order'],
          ], pmsf, {
            sections: [
              section('main', 'Schedule information', 0),
              section('cadence', 'Recurrence & Scheduling', 1),
              section('work-order', 'Generated work order template', 2),
            ],
          }),
        ], { search: ['name', 'wo-title'], sort: 'next-due-at' }),
      ],
      [
        action(
          PMS,
          'generate',
          'Generate work order',
          'cmms.pm.write',
          ['is-active', 'EQ', true],
          'Generate a work order for the current occurrence and advance the schedule?',
        ),
      ],
    ),
    { route: '/cmms/schedules' },
  );

  // 4. Meters and readings (Slice 3)
  const MTR = 'cmms.meters';
  const MRD = 'cmms.meter-readings';
  const mtrf = [
    field(MTR, 'name', 'Meter name', 'TEXT', { required: true, help: 'Tag or identifier for this asset sensor.' }),
    field(MTR, 'description', 'Description', 'TEXTAREA'),
    field(MTR, 'asset-id', 'Asset', 'REFERENCE', { required: true, ref: 'asset-ref' }),
    field(MTR, 'unit', 'Unit', 'TEXT', { required: true, help: 'e.g. hours, psi, celsius, km' }),
    field(MTR, 'reading-type', 'Reading type', 'SELECT', { required: true, ref: 'reading-types', default: 'GAUGE' }),
    field(MTR, 'last-reading-value', 'Latest value', 'NUMBER', { readOnly: true }),
    field(MTR, 'last-reading-at', 'Latest reading at', 'DATETIME', { readOnly: true }),
    field(MTR, 'min-threshold', 'Min threshold', 'NUMBER'),
    field(MTR, 'max-threshold', 'Max threshold', 'NUMBER'),
  ];
  const mrdf = [
    field(MRD, 'meter-id', 'Meter ID', 'TEXT', { readOnly: true }),
    field(MRD, 'value', 'Reading value', 'NUMBER', { required: true }),
    field(MRD, 'read-at', 'Timestamp', 'DATETIME', { required: true }),
    field(MRD, 'notes', 'Notes', 'TEXTAREA'),
    field(MRD, 'recorded-by', 'Recorded by', 'TEXT', { readOnly: true }),
    field(MRD, 'recorded-at', 'Recorded at', 'DATETIME', { readOnly: true }),
  ];

  const meterFields = [...mtrf, ...mrdf];

  windows['cmms-meters'] = window(
    'cmms-meters',
    'Meters and telemetry',
    'Meters',
    'Asset counters, run hours and operational gauges.',
    'cmms:read',
    dictionary(
      'cmms-meters',
      'Meters and telemetry',
      MTR,
      [entity(MTR, 'Meters'), entity(MRD, 'Meter readings')],
      meterFields,
      [relationship('meter-readings', MTR, MRD, 'meter-id')],
      [values('reading-types', READING_TYPES), ASSET_REF],
      [
        view('meters', 'Meters', [
          tab('meter', 'Meter', 0, MTR, [
            ['name', 6, 'main'],
            ['asset-id', 6, 'main'],
            ['unit', 3, 'main'],
            ['reading-type', 3, 'main'],
            ['last-reading-value', 3, 'telemetry'],
            ['last-reading-at', 3, 'telemetry'],
            ['min-threshold', 3, 'telemetry'],
            ['max-threshold', 3, 'telemetry'],
            ['description', 12, 'main'],
          ], meterFields, {
            sections: [
              section('main', 'Meter specification', 0),
              section('telemetry', 'Latest telemetry & thresholds', 1),
            ],
          }),
          tab('readings', 'Readings', 1, MRD, [
            ['value', 3],
            ['read-at', 3],
            ['notes', 4],
            ['recorded-by', 2],
          ], meterFields, { parent: 'meter-readings' }),
        ], { search: ['name', 'unit'], sort: 'name' }),
      ],
      [],
    ),
    { route: '/cmms/meters' },
  );

  // 5. MRO parts and stock movements (Slice 3)
  const PRT = 'cmms.parts';
  const PMV = 'cmms.part-movements';
  const prtf = [
    field(PRT, 'part-number', 'Part number', 'TEXT', { required: true, help: 'Stock-keeping unit or manufacturer part number.' }),
    field(PRT, 'name', 'Part name', 'TEXT', { required: true }),
    field(PRT, 'description', 'Description', 'TEXTAREA'),
    field(PRT, 'category', 'Category', 'SELECT', { ref: 'part-categories' }),
    field(PRT, 'unit-of-measure', 'Unit of measure', 'TEXT', { required: true, default: 'EA' }),
    field(PRT, 'unit-cost', 'Unit cost', 'NUMBER'),
    field(PRT, 'currency-code', 'Currency', 'SELECT', { ref: 'currencies', default: 'USD' }),
    field(PRT, 'quantity-on-hand', 'Quantity on hand', 'NUMBER', { readOnly: true }),
    field(PRT, 'min-quantity', 'Min stock level', 'NUMBER', { default: 0 }),
    field(PRT, 'reorder-point', 'Reorder point', 'NUMBER'),
    field(PRT, 'non-stock', 'Non-stock item', 'BOOLEAN', { default: false }),
    field(PRT, 'bin-location', 'Bin location', 'TEXT'),
    field(PRT, 'barcode', 'Barcode / UPC', 'TEXT'),
  ];
  const pmvf = [
    field(PMV, 'part-id', 'Part ID', 'TEXT', { readOnly: true }),
    field(PMV, 'movement-type', 'Movement type', 'SELECT', { required: true, ref: 'movement-types' }),
    field(PMV, 'quantity-delta', 'Quantity change', 'NUMBER', { required: true }),
    field(PMV, 'balance-after', 'Balance after', 'NUMBER', { readOnly: true }),
    field(PMV, 'unit-cost', 'Unit cost', 'NUMBER'),
    field(PMV, 'currency-code', 'Currency', 'SELECT', { ref: 'currencies' }),
    field(PMV, 'storeroom-id', 'Storeroom ID', 'TEXT'),
    field(PMV, 'bin-location', 'Bin location', 'TEXT'),
    field(PMV, 'reason', 'Reason', 'TEXTAREA'),
    field(PMV, 'created-by', 'Transacted by', 'TEXT', { readOnly: true }),
    field(PMV, 'created-at', 'Transacted at', 'DATETIME', { readOnly: true }),
  ];

  const partFields = [...prtf, ...pmvf];

  windows['cmms-parts'] = window(
    'cmms-parts',
    'MRO parts and inventory',
    'MRO Parts',
    'Spare parts, inventory balances, and storeroom movements.',
    'cmms:read',
    dictionary(
      'cmms-parts',
      'MRO parts and inventory',
      PRT,
      [entity(PRT, 'MRO parts'), entity(PMV, 'Stock movements')],
      partFields,
      [relationship('part-movements', PRT, PMV, 'part-id')],
      [
        values('part-categories', PART_CATEGORIES),
        values('movement-types', MOVEMENT_TYPES),
        values('currencies', CURRENCIES),
      ],
      [
        view('parts', 'MRO Parts', [
          tab('part', 'Part', 0, PRT, [
            ['part-number', 4, 'main'],
            ['name', 5, 'main'],
            ['category', 3, 'main'],
            ['quantity-on-hand', 3, 'stock'],
            ['unit-of-measure', 3, 'stock'],
            ['min-quantity', 3, 'stock'],
            ['reorder-point', 3, 'stock'],
            ['unit-cost', 3, 'financial'],
            ['currency-code', 3, 'financial'],
            ['non-stock', 3, 'financial'],
            ['bin-location', 3, 'location'],
            ['barcode', 4, 'location'],
            ['description', 12, 'main'],
          ], partFields, {
            sections: [
              section('main', 'Part details', 0),
              section('stock', 'Inventory position', 1),
              section('financial', 'Costing & Stock type', 2),
              section('location', 'Storeroom & Barcode', 3),
            ],
          }),
          tab('movements', 'Stock movements', 1, PMV, [
            ['movement-type', 2],
            ['quantity-delta', 2],
            ['balance-after', 2],
            ['unit-cost', 2],
            ['bin-location', 2],
            ['reason', 2],
          ], partFields, { parent: 'part-movements' }),
        ], { search: ['part-number', 'name', 'bin-location'], sort: 'part-number' }),
      ],
      [],
    ),
    { route: '/cmms/inventory' },
  );

  // 6. Assets and specifications (Slice 4)
  const AST = 'cmms.assets';
  const ASP = 'cmms.asset-specs';
  const astf = [
    field(AST, 'asset-tag', 'Asset tag', 'TEXT', { required: true, help: 'Unique asset identifier or barcode.' }),
    field(AST, 'name', 'Asset name', 'TEXT', { required: true }),
    field(AST, 'description', 'Description', 'TEXTAREA'),
    field(AST, 'category', 'Category', 'TEXT'),
    field(AST, 'status', 'Status', 'SELECT', { ref: 'asset-statuses', default: 'OPERATIONAL' }),
    field(AST, 'criticality', 'Criticality', 'SELECT', { ref: 'criticalities', default: 'MEDIUM' }),
    field(AST, 'manufacturer', 'Manufacturer', 'TEXT'),
    field(AST, 'model', 'Model', 'TEXT'),
    field(AST, 'serial-number', 'Serial number', 'TEXT'),
    field(AST, 'parent-asset-id', 'Parent asset', 'REFERENCE', { ref: 'asset-ref' }),
    field(AST, 'site-ref', 'Site reference', 'TEXT'),
    field(AST, 'space-id', 'CAFM space', 'REFERENCE', { ref: 'space-ref' }),
    field(AST, 'classification-id', 'Classification', 'REFERENCE', { ref: 'classification-ref' }),
    field(AST, 'acquisition-cost', 'Acquisition cost', 'NUMBER'),
    field(AST, 'currency-code', 'Currency', 'SELECT', { ref: 'currencies' }),
    field(AST, 'purchase-date', 'Purchase date', 'DATE'),
    field(AST, 'warranty-expiry', 'Warranty expiry', 'DATE'),
    field(AST, 'archived-at', 'Archived at', 'DATETIME', { readOnly: true }),
    field(AST, 'open-work-order-count', 'Open work orders', 'INTEGER', { readOnly: true }),
    field(AST, 'created-by', 'Created by', 'TEXT', { readOnly: true }),
    field(AST, 'created-at', 'Created at', 'DATETIME', { readOnly: true }),
    field(AST, 'updated-at', 'Updated at', 'DATETIME', { readOnly: true }),
  ];
  const aspf = [
    field(ASP, 'asset-id', 'Asset ID', 'TEXT', { readOnly: true }),
    field(ASP, 'spec-definition-id', 'Spec definition ID', 'TEXT', { readOnly: true }),
    field(ASP, 'attribute-key', 'Attribute key', 'TEXT', { readOnly: true }),
    field(ASP, 'label', 'Specification', 'TEXT', { readOnly: true }),
    field(ASP, 'data-type', 'Data type', 'TEXT', { readOnly: true }),
    field(ASP, 'uom', 'Unit', 'TEXT', { readOnly: true }),
    field(ASP, 'value-text', 'Text value', 'TEXT'),
    field(ASP, 'value-number', 'Numeric value', 'NUMBER'),
    field(ASP, 'value-boolean', 'Boolean value', 'BOOLEAN'),
  ];

  const assetFields = [...astf, ...aspf];

  windows['cmms-assets'] = window(
    'cmms-assets',
    'Asset register and specifications',
    'Assets',
    'Equipment register, hierarchical twin, and engineering specifications.',
    'cmms:read',
    dictionary(
      'cmms-assets',
      'Asset register and specifications',
      AST,
      [entity(AST, 'Assets'), entity(ASP, 'Specifications')],
      assetFields,
      [relationship('asset-specs', AST, ASP, 'asset-id')],
      [
        values('asset-statuses', ASSET_STATUSES),
        values('criticalities', CRITICALITIES),
        values('currencies', CURRENCIES),
        ASSET_REF,
        SPACE_REF,
        CLASSIFICATION_REF,
      ],
      [
        view('assets', 'Assets', [
          tab('asset', 'Asset', 0, AST, [
            ['asset-tag', 4, 'main'],
            ['name', 5, 'main'],
            ['category', 3, 'main'],
            ['status', 3, 'main'],
            ['criticality', 3, 'main'],
            ['classification-id', 6, 'main'],
            ['parent-asset-id', 6, 'hierarchy'],
            ['space-id', 6, 'hierarchy'],
            ['manufacturer', 4, 'equipment'],
            ['model', 4, 'equipment'],
            ['serial-number', 4, 'equipment'],
            ['acquisition-cost', 3, 'commercial'],
            ['currency-code', 3, 'commercial'],
            ['purchase-date', 3, 'commercial'],
            ['warranty-expiry', 3, 'commercial'],
            ['site-ref', 6, 'hierarchy'],
            ['open-work-order-count', 3, 'meta'],
            ['archived-at', 3, 'meta'],
            ['created-by', 3, 'meta'],
            ['created-at', 3, 'meta'],
            ['updated-at', 3, 'meta'],
            ['description', 12, 'main'],
          ], assetFields, {
            sections: [
              section('main', 'Asset identification', 0),
              section('hierarchy', 'Location & Hierarchy', 1),
              section('equipment', 'Manufacturer & Model', 2),
              section('commercial', 'Commercial & Warranty', 3),
              section('meta', 'Status & Lifecycle', 4),
            ],
          }),
          tab('specs', 'Specifications', 1, ASP, [
            ['label', 3],
            ['data-type', 2],
            ['value-text', 3],
            ['value-number', 2],
            ['value-boolean', 2],
          ], assetFields, { parent: 'asset-specs' }),
        ], { search: ['asset-tag', 'name', 'category'], sort: 'asset-tag' }),
      ],
      [
        action(
          AST,
          'archive',
          'Archive asset',
          'cmms.assets.write',
          ['status', 'NEQ', 'DECOMMISSIONED'],
          'Archive and decommission this asset? Open work orders and active child assets must be cleared first.',
          REASON_REQUIRED,
        ),
      ],
    ),
    { route: '/cmms/assets' },
  );

  // 7. CAFM spaces and space assets (Slice 4)
  const SPC = 'cmms.spaces';
  const SPA = 'cmms.space-assets';
  const spcf = [
    field(SPC, 'code', 'Space code', 'TEXT', { required: true, help: 'Unique room or zone code.' }),
    field(SPC, 'name', 'Space name', 'TEXT', { required: true }),
    field(SPC, 'description', 'Description', 'TEXTAREA'),
    field(SPC, 'space-type', 'Space type', 'SELECT', { required: true, ref: 'space-types', default: 'ROOM' }),
    field(SPC, 'parent-space-id', 'Parent space', 'REFERENCE', { ref: 'space-ref' }),
    field(SPC, 'site-ref', 'Site reference', 'TEXT'),
    field(SPC, 'floor-number', 'Floor number', 'INTEGER'),
    field(SPC, 'gross-area-sqm', 'Gross area (sqm)', 'NUMBER'),
    field(SPC, 'net-area-sqm', 'Net area (sqm)', 'NUMBER'),
    field(SPC, 'bim-guid', 'BIM GUID', 'TEXT'),
    field(SPC, 'asset-count', 'Asset count', 'INTEGER', { readOnly: true }),
    field(SPC, 'created-by', 'Created by', 'TEXT', { readOnly: true }),
    field(SPC, 'created-at', 'Created at', 'DATETIME', { readOnly: true }),
    field(SPC, 'updated-at', 'Updated at', 'DATETIME', { readOnly: true }),
  ];
  const spaf = [
    field(SPA, 'space-id', 'Space ID', 'TEXT', { readOnly: true }),
    field(SPA, 'asset-tag', 'Asset tag', 'TEXT', { readOnly: true }),
    field(SPA, 'name', 'Asset name', 'TEXT', { readOnly: true }),
    field(SPA, 'category', 'Category', 'TEXT', { readOnly: true }),
    field(SPA, 'status', 'Status', 'SELECT', { ref: 'asset-statuses', readOnly: true }),
    field(SPA, 'criticality', 'Criticality', 'SELECT', { ref: 'criticalities', readOnly: true }),
  ];

  const spaceFields = [...spcf, ...spaf];

  windows['cmms-spaces'] = window(
    'cmms-spaces',
    'CAFM spaces and spatial twin',
    'Spaces',
    'Manage facility spaces, architectural hierarchy, and located assets.',
    'cmms:read',
    dictionary(
      'cmms-spaces',
      'CAFM spaces and spatial twin',
      SPC,
      [entity(SPC, 'Spaces'), entity(SPA, 'Located assets')],
      spaceFields,
      [relationship('space-assets', SPC, SPA, 'space-id')],
      [
        values('space-types', SPACE_TYPES),
        values('asset-statuses', ASSET_STATUSES),
        values('criticalities', CRITICALITIES),
        SPACE_REF,
      ],
      [
        view('spaces', 'Spaces', [
          tab('space', 'Space', 0, SPC, [
            ['code', 4, 'main'],
            ['name', 5, 'main'],
            ['space-type', 3, 'main'],
            ['parent-space-id', 6, 'location'],
            ['floor-number', 3, 'location'],
            ['site-ref', 3, 'location'],
            ['gross-area-sqm', 4, 'dimensions'],
            ['net-area-sqm', 4, 'dimensions'],
            ['bim-guid', 4, 'dimensions'],
            ['asset-count', 3, 'meta'],
            ['created-by', 3, 'meta'],
            ['created-at', 3, 'meta'],
            ['updated-at', 3, 'meta'],
            ['description', 12, 'main'],
          ], spaceFields, {
            sections: [
              section('main', 'Space identification', 0),
              section('location', 'Spatial hierarchy', 1),
              section('dimensions', 'Dimensions & CAD/BIM', 2),
              section('meta', 'Statistics & Audit', 3),
            ],
          }),
          tab('assets', 'Located assets', 1, SPA, [
            ['asset-tag', 3],
            ['name', 4],
            ['category', 2],
            ['status', 2],
            ['criticality', 1],
          ], spaceFields, { parent: 'space-assets' }),
        ], { search: ['code', 'name'], sort: 'code' }),
      ],
      [
        action(
          SPC,
          'delete',
          'Delete space',
          'cmms.assets.write',
          ['code', 'IS_NOT_NULL'],
          'Delete this space? It must have no child spaces or active assets.',
        ),
      ],
    ),
    { route: '/cmms/spaces' },
  );

  // 8. Classifications and spec definitions (Slice 4)
  const CLS = 'cmms.classifications';
  const SDF = 'cmms.spec-definitions';
  const clsf = [
    field(CLS, 'code', 'Classification code', 'TEXT', { required: true, help: 'Classification identifier.' }),
    field(CLS, 'name', 'Classification name', 'TEXT', { required: true }),
    field(CLS, 'description', 'Description', 'TEXTAREA'),
    field(CLS, 'parent-class-id', 'Parent classification', 'REFERENCE', { ref: 'classification-ref' }),
    field(CLS, 'spec-count', 'Specification count', 'INTEGER', { readOnly: true }),
    field(CLS, 'asset-count', 'Asset count', 'INTEGER', { readOnly: true }),
    field(CLS, 'created-by', 'Created by', 'TEXT', { readOnly: true }),
    field(CLS, 'created-at', 'Created at', 'DATETIME', { readOnly: true }),
    field(CLS, 'updated-at', 'Updated at', 'DATETIME', { readOnly: true }),
  ];
  const sdff = [
    field(SDF, 'classification-id', 'Classification ID', 'TEXT', { readOnly: true }),
    field(SDF, 'attribute-key', 'Attribute key', 'TEXT', { required: true }),
    field(SDF, 'label', 'Label', 'TEXT', { required: true }),
    field(SDF, 'data-type', 'Data type', 'SELECT', { required: true, ref: 'spec-data-types', default: 'TEXT' }),
    field(SDF, 'uom', 'Unit of measure', 'TEXT'),
    field(SDF, 'required', 'Required', 'BOOLEAN', { default: false }),
    field(SDF, 'min-value', 'Min value', 'NUMBER'),
    field(SDF, 'max-value', 'Max value', 'NUMBER'),
    field(SDF, 'default-value', 'Default value', 'TEXT'),
  ];

  const classFields = [...clsf, ...sdff];

  windows['cmms-classifications'] = window(
    'cmms-classifications',
    'Asset classifications and specifications',
    'Classifications',
    'Engineering taxonomies and specification schemas for equipment classes.',
    'cmms:read',
    dictionary(
      'cmms-classifications',
      'Asset classifications and specifications',
      CLS,
      [entity(CLS, 'Classifications'), entity(SDF, 'Specification definitions')],
      classFields,
      [relationship('spec-definitions', CLS, SDF, 'classification-id')],
      [
        values('spec-data-types', SPEC_DATA_TYPES),
        CLASSIFICATION_REF,
      ],
      [
        view('classifications', 'Classifications', [
          tab('classification', 'Classification', 0, CLS, [
            ['code', 4, 'main'],
            ['name', 5, 'main'],
            ['parent-class-id', 6, 'main'],
            ['spec-count', 3, 'stats'],
            ['asset-count', 3, 'stats'],
            ['created-by', 3, 'stats'],
            ['created-at', 3, 'stats'],
            ['updated-at', 3, 'stats'],
            ['description', 12, 'main'],
          ], classFields, {
            sections: [
              section('main', 'Classification taxonomy', 0),
              section('stats', 'Metrics & Audit', 1),
            ],
          }),
          tab('specs', 'Specification definitions', 1, SDF, [
            ['attribute-key', 3],
            ['label', 3],
            ['data-type', 2],
            ['uom', 2],
            ['required', 2],
          ], classFields, { parent: 'spec-definitions' }),
        ], { search: ['code', 'name'], sort: 'code' }),
      ],
      [
        action(
          CLS,
          'delete',
          'Delete classification',
          'cmms.assets.write',
          ['code', 'IS_NOT_NULL'],
          'Delete this classification? It must have no child classifications or assigned assets.',
        ),
      ],
    ),
    { route: '/cmms/classifications' },
  );

  return windows;
}
