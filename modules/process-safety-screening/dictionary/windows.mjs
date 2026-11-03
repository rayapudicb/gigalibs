// WI-OI-120bw/120bx (SPEED S3, S4; screen spec §2.1 to §2.4): SPEED's metadata windows. Edit here, then run
// `node scripts/generate-windows.mjs process-safety-screening` and `pnpm modules:catalog`.

const RECORD_STATUSES = [['ACTIVE', 'Active'], ['ARCHIVED', 'Archived']];
const ROUTE_STATUSES = [['DRAFT', 'Draft'], ['ARCHIVED', 'Archived']];
// The reasons offered with every change on the gate workbench (FR-AUD-01); a workspace can change them here.
const CHANGE_REASONS = 'Data entry|Correction|Measured value|Literature value|Mitigation';

export function windowSource(builderFor) {
  const { entity, field, values, lookup, tab, panel, section, relationship, action, view, dictionary, window, REASON_REQUIRED } = builderFor({
    route: '/speed',
    createWith: {
      'speed-projects': ['process-safety-screening', 'speed-projects', 'speed.routes.write'],
      'speed-substances': ['process-safety-screening', 'speed-substances', 'speed.substances.write'],
    },
  });
  // Sites and people are the workspace's own, served by the platform lookups (WI-OI-120u).
  // WI-OI-120ce: SPEED's own list of the sites in force (the platform's unit list offered units outside it).
  const SITE_REF = lookup('site-ref', 'speed-sites');
  const MEMBER_REF = lookup('member-ref', 'workspace-members');
  const PROJECT_REF = lookup('project-ref', 'speed-projects');
  // The library in force's materials: a substance's reactivity classes come from its link (FR-HAZ-01).
  const LIBRARY_MATERIAL_REF = lookup('library-material-ref', 'speed-library-materials');
  const windows = {};

  // A saved record changes only with a reason (FR-AUD-01). The window asks for one from S2; until then a saved
  // project's or substance's fields are read-only here and change through the API, and a route's content changes on
  // the gate workbench, which sends a reason with every change.
  const SAVED = { field: 'status', operator: 'IS_NOT_NULL' };

  // Routes, shared by the Routes window and the Projects window's "Routes" tab.
  const R = 'speed.routes';
  const rf = [
    field(R, 'project-id', 'Project', 'REFERENCE', { help: 'The screening project this route belongs to.', required: true, ref: 'project-ref' }),
    field(R, 'name', 'Route', 'TEXT', { help: 'A name for the synthesis route, for example "Route B – telescoped".', required: true }),
    field(R, 'route-version', 'Version', 'INTEGER', { readOnly: true }),
    field(R, 'status', 'Status', 'SELECT', { readOnly: true, ref: 'route-statuses' }),
    field(R, 'author-subject', 'Author', 'REFERENCE', { readOnly: true, ref: 'member-ref' }),
    field(R, 'step-count', 'Steps', 'INTEGER', { readOnly: true }),
    field(R, 'steps-passing-gate', 'Steps passing the gate', 'INTEGER', { readOnly: true }),
    field(R, 'updated-at', 'Last change', 'DATETIME', { readOnly: true }),
  ];
  const routeColumns = [
    ['name', 4, undefined, { lockedWhen: SAVED }], ['route-version', 2], ['status', 2], ['step-count', 2], ['steps-passing-gate', 2], ['updated-at', 3],
  ];

  // Projects.
  const P = 'speed.projects';
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
    dictionary('speed-projects', 'Projects', P, [entity(P, 'Projects'), entity(R, 'Routes')], [...pf, ...rf],
      [relationship('project-routes', P, R, 'project-id')],
      [SITE_REF, MEMBER_REF, PROJECT_REF, values('project-statuses', RECORD_STATUSES), values('route-statuses', ROUTE_STATUSES)], [
      view('projects', 'Projects', [
        tab('project', 'Project', 0, P, [
          ['code', 3, 'main', { lockedWhen: SAVED }], ['name', 9, 'main', { lockedWhen: SAVED }],
          ['site-unit-id', 6, 'main', { lockedWhen: SAVED }], ['owner-subject', 6, 'main', { lockedWhen: SAVED }],
          ['notes', 12, 'main', { lockedWhen: SAVED }],
          ['status', 3, 'record'], ['created-by', 3, 'record'], ['created-at', 3, 'record'], ['updated-at', 3, 'record'],
        ], pf, { sections: [section('main', 'Project', 0), section('record', 'Record', 1)] }),
        tab('routes', 'Routes', 1, R, routeColumns, rf, { parent: 'project-routes' }),
      ], { search: ['code', 'name'], sort: 'code' }),
    ], [
      action(P, 'archive', 'Archive', 'speed.routes.write', ['status', 'EQ', 'ACTIVE'],
        'Archive this project? It stays readable and can no longer change.', REASON_REQUIRED),
    ]));

  // Substances (§2.2), shared across the workspace's sites; the molar mass is computed on the server.
  const S = 'speed.substances';
  const sf = [
    field(S, 'name', 'Name', 'TEXT', { required: true }),
    field(S, 'cas-number', 'CAS number', 'TEXT', { help: 'For example 7732-18-5; the check digit is verified.' }),
    field(S, 'formula', 'Formula', 'TEXT', { required: true, help: 'Brackets and hydrates are accepted: CuSO4·5H2O.' }),
    field(S, 'density-g-per-ml', 'Density (g/mL)', 'NUMBER', { scale: 4 }),
    field(S, 'notes', 'Notes', 'TEXTAREA'),
    field(S, 'library-material-id', 'Library material', 'REFERENCE', {
      ref: 'library-material-ref',
      help: 'Its reactivity classes drive the interaction screen; unlinked substances are listed as not classified.',
    }),
    field(S, 'hill-formula', 'Hill formula', 'TEXT', { readOnly: true }),
    field(S, 'molar-mass-g-per-mol', 'Molar mass (g/mol)', 'NUMBER', { readOnly: true, scale: 3 }),
    field(S, 'elements-version', 'Atomic weights', 'TEXT', { readOnly: true }),
    field(S, 'in-use', 'Used by a route', 'BOOLEAN', { readOnly: true }),
    field(S, 'status', 'Status', 'SELECT', { readOnly: true, ref: 'substance-statuses' }),
    field(S, 'updated-at', 'Last change', 'DATETIME', { readOnly: true }),
  ];
  windows['speed-substances'] = window('speed-substances', 'Substances', 'Substances', 'The substances your routes use, with formulas and molar masses.', 'speed:read',
    dictionary('speed-substances', 'Substances', S, [entity(S, 'Substances')], sf, [], [LIBRARY_MATERIAL_REF, values('substance-statuses', RECORD_STATUSES)], [
      view('substances', 'Substances', [
        tab('substance', 'Substance', 0, S, [
          ['name', 6, 'main', { lockedWhen: SAVED }], ['cas-number', 3, 'main', { lockedWhen: SAVED }],
          ['formula', 3, 'main', { lockedWhen: SAVED }], ['density-g-per-ml', 3, 'main', { lockedWhen: SAVED }],
          ['library-material-id', 6, 'main', { lockedWhen: SAVED }], ['notes', 12, 'main', { lockedWhen: SAVED }],
          ['hill-formula', 3, 'computed'], ['molar-mass-g-per-mol', 3, 'computed'], ['elements-version', 3, 'computed'],
          ['in-use', 3, 'computed'], ['status', 3, 'computed'], ['updated-at', 3, 'computed'],
        ], sf, { sections: [section('main', 'Substance', 0), section('computed', 'Computed on the server', 1)] }),
      ], { search: ['name', 'cas-number', 'formula'], sort: 'name' }),
    ], [
      action(S, 'archive', 'Archive', 'speed.substances.write', ['status', 'EQ', 'ACTIVE'],
        'Archive this substance? Routes that use it keep it; it is no longer offered for new materials.', REASON_REQUIRED),
    ]));

  // Routes (§2.3, §2.4): the list, and the workbench on the record's "Route & gate" tab.
  windows['speed-routes'] = window('speed-routes', 'Routes', 'Routes', 'Synthetic routes, step by step, screened before kilo-lab.', 'speed:read',
    dictionary('speed-routes', 'Routes', R, [entity(R, 'Routes')], rf, [],
      [MEMBER_REF, PROJECT_REF, values('route-statuses', ROUTE_STATUSES)], [
      view('routes', 'Routes', [
        tab('route', 'Route & gate', 0, R, [
          ['project-id', 4, 'header', { lockedWhen: SAVED }], ['name', 4, 'header', { lockedWhen: SAVED }],
          ['route-version', 2, 'header'], ['status', 2, 'header'], ['author-subject', 4, 'header'],
          ['step-count', 2, 'header'], ['steps-passing-gate', 3, 'header'], ['updated-at', 3, 'header'],
        ], rf, {
          sections: [section('header', 'Route', 0), section('workbench', 'Steps and gate', 1)],
          panels: [
            panel('summary', 'speed.route-summary', 100, { section: 'workbench' }),
            panel('gate', 'speed.gate-workbench', 110, { section: 'workbench', props: { changeReasons: CHANGE_REASONS } }),
          ],
        }),
        // Panel-only tabs on the same route record (screen spec §2.4); the spec's order with the later slices' tabs.
        tab('oxygen-balance', 'Oxygen balance', 0, R, [], rf, {
          position: 1,
          panels: [panel('ob', 'speed.ob-chart', 0, { props: { axisMinPercent: -350, axisMaxPercent: 100, tickPercent: 50, showTable: true, changeReasons: CHANGE_REASONS } })],
        }),
        tab('thermal', 'Thermal & runaway', 0, R, [], rf, {
          position: 2,
          panels: [panel('thermal', 'speed.thermal-panel', 0, { props: { changeReasons: CHANGE_REASONS } })],
        }),
        tab('interactions', 'Interactions', 0, R, [], rf, {
          position: 3,
          panels: [panel('interactions', 'speed.interaction-matrix', 0, { props: { changeReasons: CHANGE_REASONS } })],
        }),
        tab('green', 'Green metrics', 0, R, [], rf, {
          position: 4,
          panels: [panel('green', 'speed.green-scorecard', 0, { props: { showStreams: true } })],
        }),
        // WI-OI-120cc (S8): the write-up parser, on draft routes for people who change routes.
        tab('writeup', 'Write-up parser', 0, R, [], rf, {
          position: 5,
          panels: [panel('writeup', 'speed.writeup-parser', 0, {
            props: { applyReason: 'Data entry' },
            permission: 'speed.routes.write',
            visibleWhen: { field: 'status', operator: 'EQ', value: 'DRAFT' },
          })],
        }),
        tab('dossier', 'Dossier', 0, R, [], rf, {
          position: 6,
          panels: [panel('dossier', 'speed.dossier-preview', 0, { props: { pollSeconds: 3, historyCount: 5 } })],
        }),
      ], { search: ['name'], sort: 'name' }),
    ], [
      action(R, 'archive', 'Archive', 'speed.routes.write', ['status', 'EQ', 'DRAFT'],
        'Archive this route? It stays readable with its results and can no longer change.', REASON_REQUIRED),
    ]));

  // Screening criteria (§3.2): the sets imported into the workspace, the one in force, and each value with its citation.
  // Import is the administrator's API call in R1; putting a set in force asks for a reason.
  const C = 'speed.criteria-sets';
  const cf = [
    field(C, 'version-label', 'Version', 'TEXT', { readOnly: true }),
    field(C, 'source', 'Source', 'TEXT', { readOnly: true }),
    field(C, 'review-status', 'Status', 'SELECT', { readOnly: true, ref: 'review-statuses' }),
    field(C, 'in-force', 'In force', 'BOOLEAN', { readOnly: true }),
    field(C, 'imported-by', 'Imported by', 'REFERENCE', { readOnly: true, ref: 'member-ref' }),
    field(C, 'imported-at', 'Imported', 'DATETIME', { readOnly: true }),
    field(C, 'in-force-since', 'In force since', 'DATETIME', { readOnly: true }),
  ];
  windows['speed-criteria'] = window('speed-criteria', 'Screening criteria', 'Screening criteria', 'The cited thresholds and ranges the screening engines apply.', 'speed:read',
    dictionary('speed-criteria', 'Screening criteria', C, [entity(C, 'Criteria sets')], cf, [],
      [MEMBER_REF, values('review-statuses', [['UNREVIEWED', 'Unreviewed'], ['APPROVED', 'Approved']])], [
      view('criteria-sets', 'Criteria sets', [
        tab('set', 'Criteria set', 0, C, [
          ['version-label', 3, 'main'], ['review-status', 3, 'main'], ['in-force', 3, 'main'], ['in-force-since', 3, 'main'],
          ['source', 6, 'main'], ['imported-by', 3, 'main'], ['imported-at', 3, 'main'],
        ], cf, {
          sections: [section('main', 'Criteria set', 0), section('values', 'Values', 1)],
          panels: [panel('values', 'speed.criteria-values', 100, { section: 'values' })],
        }),
      ], { search: ['version-label'], sort: 'version-label' }),
    ], [
      action(C, 'put-in-force', 'Put in force', 'speed.settings.manage', ['in-force', 'EQ', false],
        'Put this criteria set in force? Results computed from now on use it; earlier results keep the set they used.', REASON_REQUIRED),
    ]));

  // The screening library (§3.1): the sets imported into the workspace, the one in force, and each set's entries with
  // their citations. One window with entry tabs: entries are identified by their library ids inside an immutable set.
  const L = 'speed.library-sets';
  const lf = [
    field(L, 'version-label', 'Version', 'TEXT', { readOnly: true }),
    field(L, 'source', 'Source', 'TEXT', { readOnly: true }),
    field(L, 'review-status', 'Status', 'SELECT', { readOnly: true, ref: 'review-statuses' }),
    field(L, 'in-force', 'In force', 'BOOLEAN', { readOnly: true }),
    field(L, 'imported-by', 'Imported by', 'REFERENCE', { readOnly: true, ref: 'member-ref' }),
    field(L, 'imported-at', 'Imported', 'DATETIME', { readOnly: true }),
    field(L, 'in-force-since', 'In force since', 'DATETIME', { readOnly: true }),
  ];
  const entries = (key, label, position, kind) =>
    tab(key, label, 0, L, [], lf, { position, panels: [panel(key, 'speed.library-entries', 0, { props: { kind } })] });
  windows['speed-library'] = window('speed-library', 'Screening library', 'Library', 'The cited reference data the screening engines read: materials, interaction rules, reaction classes and energetic groups.', 'speed:read',
    dictionary('speed-library', 'Screening library', L, [entity(L, 'Library sets')], lf, [],
      [MEMBER_REF, values('review-statuses', [['UNREVIEWED', 'Unreviewed'], ['APPROVED', 'Approved']])], [
      view('library-sets', 'Library sets', [
        tab('set', 'Library set', 0, L, [
          ['version-label', 3, 'main'], ['review-status', 3, 'main'], ['in-force', 3, 'main'], ['in-force-since', 3, 'main'],
          ['source', 6, 'main'], ['imported-by', 3, 'main'], ['imported-at', 3, 'main'],
        ], lf, { sections: [section('main', 'Library set', 0)] }),
        entries('materials', 'Materials', 1, 'MATERIALS'),
        entries('rules', 'Interaction rules', 2, 'RULES'),
        entries('reaction-classes', 'Reaction classes', 3, 'REACTION_CLASSES'),
        entries('energetic-groups', 'Energetic groups', 4, 'ENERGETIC_GROUPS'),
      ], { search: ['version-label'], sort: 'version-label' }),
    ], [
      action(L, 'put-in-force', 'Put in force', 'speed.settings.manage', ['in-force', 'EQ', false],
        'Put this library set in force? Results computed from now on use it; earlier results keep the set they used.', REASON_REQUIRED),
    ]));

  return windows;
}
