// WI-OI-120ha (Table 1 row 8): AR metadata windows. Edit here, then:
// `node scripts/generate-windows.mjs accounts-receivable` and `pnpm modules:catalog`.

const INVOICE_STATUS = [
  ['DRAFT', 'Draft'],
  ['ISSUED', 'Issued'],
];

const CUSTOMER_STATUS = [
  ['ACTIVE', 'Active'],
  ['INACTIVE', 'Inactive'],
];

export function windowSource(builderFor) {
  const { entity, field, values, tab, section, dictionary, window } = builderFor({
    route: '/ar',
  });

  const view = (key, label, tabs, { search, sort, direction = 'DESC' } = {}) => ({
    viewKey: key,
    label,
    mode: 'LIST',
    device: 'ALL',
    ...(search ? { searchFields: search } : {}),
    ...(sort ? { defaultSortField: sort } : {}),
    defaultSortDirection: direction,
    tabs,
  });

  const INV = 'ar.invoices';
  const invoiceFields = [
    field(INV, 'invoice-number', 'Invoice number', 'TEXT', { readOnly: true }),
    field(INV, 'customer-id', 'Customer', 'TEXT', { required: true, writePermission: 'ar:write' }),
    field(INV, 'currency', 'Currency', 'TEXT', { defaultValue: 'USD', writePermission: 'ar:write' }),
    field(INV, 'issue-date', 'Issue date', 'DATE', { required: true, writePermission: 'ar:write' }),
    field(INV, 'due-date', 'Due date', 'DATE', { required: true, writePermission: 'ar:write' }),
    field(INV, 'status', 'Status', 'SELECT', { readOnly: true, ref: 'invoice-statuses' }),
    field(INV, 'total-minor', 'Total (minor units)', 'INTEGER', { readOnly: true }),
    field(INV, 'amount-due-minor', 'Amount due (minor units)', 'INTEGER', { readOnly: true }),
    field(INV, 'line-description', 'Line description', 'TEXT', { required: true, writePermission: 'ar:write' }),
    field(INV, 'line-quantity', 'Line quantity', 'TEXT', { defaultValue: '1', writePermission: 'ar:write' }),
    field(INV, 'line-unit-amount-minor', 'Line unit amount (minor)', 'INTEGER', { required: true, writePermission: 'ar:write' }),
  ];

  const CUST = 'ar.customers';
  const customerFields = [
    field(CUST, 'legal-name', 'Legal name', 'TEXT', { required: true, writePermission: 'ar:write' }),
    field(CUST, 'billing-email', 'Billing email', 'TEXT', { required: true, writePermission: 'ar:write' }),
    field(CUST, 'currency', 'Currency', 'TEXT', { defaultValue: 'USD', writePermission: 'ar:write' }),
    field(CUST, 'external-reference', 'External reference', 'TEXT', { writePermission: 'ar:write' }),
    field(CUST, 'status', 'Status', 'SELECT', { readOnly: true, ref: 'customer-statuses' }),
  ];

  return {
    'ar-invoices': window(
      'ar-invoices',
      'Customer invoices',
      'Invoices',
      'Draft and issued AR invoices for the tenant.',
      'ar:read',
      dictionary('ar-invoices', 'Customer invoices', INV, [entity(INV, 'Invoices')], invoiceFields, [], [
        values('invoice-statuses', INVOICE_STATUS),
      ], [
        view('invoices', 'Invoices', [
          tab('invoice', 'Invoice', 0, INV, [
            ['invoice-number', 4, 'summary'],
            ['status', 4, 'summary'],
            ['total-minor', 4, 'summary'],
            ['amount-due-minor', 4, 'summary'],
            ['customer-id', 6, 'header'],
            ['currency', 3, 'header'],
            ['issue-date', 4, 'dates'],
            ['due-date', 4, 'dates'],
            ['line-description', 8, 'line'],
            ['line-quantity', 4, 'line'],
            ['line-unit-amount-minor', 4, 'line'],
          ], invoiceFields, {
            sections: [
              section('summary', 'Summary', 0),
              section('header', 'Customer & currency', 1),
              section('dates', 'Dates', 2),
              section('line', 'First line (create)', 3),
            ],
          }),
        ], { search: ['invoice-number'], sort: 'invoice-number' }),
      ]),
    ),
    'ar-customers': window(
      'ar-customers',
      'Customers',
      'Customers',
      'Billing customers for accounts receivable.',
      'ar:read',
      dictionary('ar-customers', 'Customers', CUST, [entity(CUST, 'Customers')], customerFields, [], [
        values('customer-statuses', CUSTOMER_STATUS),
      ], [
        view('customers', 'Customers', [
          tab('customer', 'Customer', 0, CUST, [
            ['legal-name', 6, 'main'],
            ['billing-email', 6, 'main'],
            ['currency', 3, 'main'],
            ['status', 3, 'main'],
            ['external-reference', 6, 'refs'],
          ], customerFields, { sections: [section('main', 'Customer', 0), section('refs', 'References', 1)] }),
        ], { search: ['legal-name', 'billing-email'], sort: 'legal-name', direction: 'ASC' }),
      ]),
    ),
  };
}
