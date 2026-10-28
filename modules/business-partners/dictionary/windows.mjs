// WI-OI-123: Business Partner metadata windows. Edit here, then:
// `node scripts/generate-windows.mjs business-partners` and `pnpm modules:catalog`.
// Both windows are read-only: partners are authored in the kernel (Ontology) and replicated into this
// module through the party inbox, and the credit positions are a read model over the credit ledger.

const PARTY_TYPES = [
  ['ORGANIZATION', 'Organization'],
  ['PERSON', 'Person'],
];

const PARTNER_STATUSES = [
  ['ACTIVE', 'Active'],
  ['INACTIVE', 'Inactive'],
  ['PROSPECT', 'Prospect'],
  ['ARCHIVED', 'Archived'],
  ['MERGED', 'Merged'],
];

const CREDIT_RISK_STATUSES = [
  ['OK', 'Within limit'],
  ['NEAR_LIMIT', 'Near limit'],
  ['OVER_LIMIT', 'Over limit'],
  ['ON_HOLD', 'On hold'],
  ['RECONCILE', 'Needs reconciliation'],
];

const HOLD_ORIGINS = [
  ['MANUAL', 'Manual'],
  ['EXPOSURE', 'Exposure'],
];

export function windowSource(builderFor) {
  const { entity, field, values, tab, dictionary, window } = builderFor({
    route: '/business-partners',
  });

  const view = (key, label, tabs, { search, sort, direction = 'ASC' } = {}) => ({
    viewKey: key,
    label,
    mode: 'LIST',
    device: 'ALL',
    ...(search ? { searchFields: search } : {}),
    ...(sort ? { defaultSortField: sort } : {}),
    defaultSortDirection: direction,
    tabs,
  });

  const PARTY = 'business-partners.partners';
  const partnerFields = [
    field(PARTY, 'display-name', 'Name', 'TEXT', { readOnly: true }),
    field(PARTY, 'party-type', 'Type', 'SELECT', { readOnly: true, ref: 'party-types' }),
    field(PARTY, 'code', 'Code', 'TEXT', { readOnly: true }),
    field(PARTY, 'status', 'Status', 'SELECT', { readOnly: true, ref: 'partner-statuses' }),
  ];

  const CREDIT = 'business-partners.credit-exposure';
  const creditFields = [
    field(CREDIT, 'partner-name', 'Partner', 'TEXT', { readOnly: true }),
    field(CREDIT, 'currency', 'Currency', 'TEXT', { readOnly: true }),
    field(CREDIT, 'utilization-pct', 'Utilization %', 'INTEGER', {
      readOnly: true,
      help: 'Exposure as a percentage of the credit limit.',
    }),
    field(CREDIT, 'status', 'Risk', 'SELECT', { readOnly: true, ref: 'credit-risk-statuses' }),
    field(CREDIT, 'credit-limit-minor', 'Credit limit (minor units)', 'INTEGER', { readOnly: true }),
    field(CREDIT, 'exposure-minor', 'Exposure (minor units)', 'INTEGER', { readOnly: true }),
    field(CREDIT, 'available-minor', 'Available (minor units)', 'INTEGER', { readOnly: true }),
    field(CREDIT, 'org-unit-id', 'Owning unit', 'TEXT', { readOnly: true }),
  ];

  const HOLDS = 'business-partners.credit-holds';
  const holdFields = [
    field(HOLDS, 'partner-name', 'Partner', 'TEXT', { readOnly: true }),
    field(HOLDS, 'party-id', 'Party id', 'TEXT', { readOnly: true }),
    field(HOLDS, 'org-unit-id', 'Owning unit', 'TEXT', { readOnly: true }),
    field(HOLDS, 'currency', 'Currency', 'TEXT', { readOnly: true }),
    field(HOLDS, 'origin', 'Origin', 'SELECT', { readOnly: true, ref: 'hold-origins' }),
    field(HOLDS, 'reason', 'Reason', 'TEXT', { readOnly: true }),
    field(HOLDS, 'status', 'Status', 'TEXT', { readOnly: true }),
    field(HOLDS, 'created-at', 'Placed at', 'TEXT', { readOnly: true }),
    field(HOLDS, 'created-by', 'Placed by', 'TEXT', { readOnly: true }),
  ];

  return {
    partners: window(
      'partners',
      'Partners',
      'Partners',
      'Customers, vendors and employees as one counterparty.',
      'business-partners:read',
      dictionary('partners', 'Partners', PARTY, [entity(PARTY, 'Partners')], partnerFields, [], [
        values('party-types', PARTY_TYPES),
        values('partner-statuses', PARTNER_STATUSES),
      ], [
        view('partners', 'Partners', [
          tab('partner', 'Partner', 0, PARTY, [
            ['display-name', 8],
            ['party-type', 4],
            ['code', 4],
            ['status', 4],
          ], partnerFields),
        ], { search: ['display-name', 'code'], sort: 'display-name', direction: 'ASC' }),
      ]),
    ),
    'credit-exposure': window(
      'credit-exposure',
      'Credit exposure',
      'Credit exposure',
      'Every active customer account with its credit limit, exposure, available credit and risk — highest utilisation first.',
      'business-partners:read',
      dictionary('credit-exposure', 'Credit exposure', CREDIT, [entity(CREDIT, 'Credit positions')], creditFields, [], [
        values('credit-risk-statuses', CREDIT_RISK_STATUSES),
      ], [
        view('credit-exposure', 'Credit exposure', [
          tab('position', 'Position', 0, CREDIT, [
            ['partner-name', 6],
            ['currency', 2],
            ['utilization-pct', 2],
            ['status', 2],
            ['credit-limit-minor', 3],
            ['exposure-minor', 3],
            ['available-minor', 3],
            ['org-unit-id', 3],
          ], creditFields),
        ], { search: ['partner-name'], sort: 'utilization-pct', direction: 'DESC' }),
      ]),
    ),
    'credit-holds': window(
      'credit-holds',
      'Credit holds',
      'Credit holds',
      'Active credit holds across the tenant — triage and release with maker-checker.',
      'business-partners:read',
      dictionary('credit-holds', 'Credit holds', HOLDS, [entity(HOLDS, 'Credit holds')], holdFields, [], [
        values('hold-origins', HOLD_ORIGINS),
      ], [
        view('credit-holds', 'Credit holds', [
          tab('hold', 'Hold', 0, HOLDS, [
            ['partner-name', 6],
            ['currency', 2],
            ['origin', 2],
            ['status', 2],
            ['reason', 8],
            ['org-unit-id', 4],
            ['created-at', 4],
            ['created-by', 4],
          ], holdFields),
        ], { search: ['partner-name', 'reason'], sort: 'created-at', direction: 'DESC' }),
      ]),
    ),
  };
}
