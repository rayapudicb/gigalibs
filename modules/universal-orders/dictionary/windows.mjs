// WI-OI-120gj/gs (Table 1): Orders metadata windows and F0 lifecycle actions (accept/confirm).
// Edit here, then `node scripts/generate-windows.mjs universal-orders` and `pnpm modules:catalog`.

const ORDER_TYPES = [
  ['STANDARD', 'Standard'],
  ['DIRECT_FULFILLMENT', 'Direct fulfillment'],
  ['DROP_SHIP', 'Drop ship'],
  ['CONTRACT', 'Contract'],
  ['RETURN_ORDER', 'Return order'],
];

const QUOTE_STATUS = [
  ['DRAFT', 'Draft'],
  ['SUBMITTED', 'Submitted'],
  ['ACCEPTED', 'Accepted'],
  ['EXPIRED', 'Expired'],
  ['CONVERTED', 'Converted'],
  ['CANCELLED', 'Cancelled'],
];

const FULFILLMENT_STATUS = [
  ['DRAFT', 'Draft'],
  ['RELEASED', 'Released'],
  ['PICKING', 'Picking'],
  ['PACKED', 'Packed'],
  ['SHIPPED', 'Shipped'],
  ['DELIVERED', 'Delivered'],
  ['CANCELLED', 'Cancelled'],
];

const CREDIT_MEMO_STATUS = [
  ['DRAFT', 'Draft'],
  ['ISSUED', 'Issued'],
  ['APPLIED', 'Applied'],
  ['REFUNDED', 'Refunded'],
  ['CANCELLED', 'Cancelled'],
];

const INVOICE_STATUS = [
  ['DRAFT', 'Draft'],
  ['ISSUED', 'Issued'],
  ['PARTIALLY_PAID', 'Partially paid'],
  ['PAID', 'Paid'],
  ['VOID', 'Void'],
  ['DISPUTED', 'Disputed'],
];

const ORDER_STATUS = [
  ['DRAFT', 'Draft'],
  ['SUBMITTED', 'Submitted'],
  ['CONFIRMED', 'Confirmed'],
  ['PROCESSING', 'Processing'],
  ['PARTIALLY_FULFILLED', 'Partially fulfilled'],
  ['FULFILLED', 'Fulfilled'],
  ['CLOSED', 'Closed'],
  ['CANCELLED', 'Cancelled'],
];

export function windowSource(builderFor) {
  const { entity, field, values, lookup, tab, section, action, dictionary, window } = builderFor({
    route: '/orders',
    createWith: {
      'catalogue-products': ['product-catalogue', 'catalogue-products', 'products:create'],
      'catalogue-uoms': ['product-catalogue', 'catalogue-units', 'uoms:manage'],
      'inventory-warehouses': ['universal-inventory', 'inventory-warehouses', 'inventory:warehouses:manage'],
    },
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

  const WAREHOUSE_ID_PARAM = [{ key: 'warehouse-id', label: 'Fulfillment warehouse UUID', type: 'TEXT', required: true }];
  const INVOICE_DUE_PARAM = [{ key: 'due-date', label: 'Invoice due date', type: 'DATETIME', required: true }];
  const INVENTORY_ISSUE_PARAM = [{ key: 'issue-id', label: 'Inventory issue UUID', type: 'TEXT', required: true }];

  const ORG_UNIT_REF = lookup('org-unit-ref', 'organization-units');
  const WAREHOUSE_REF = lookup('warehouse-ref', 'inventory-warehouses');
  const PRODUCT_REF = lookup('product-ref', 'catalogue-products');
  const UOM_REF = lookup('uom-ref', 'catalogue-uoms');

  const SO = 'orders.sales-orders';
  const soFields = [
    field(SO, 'order-number', 'Order number', 'TEXT', { readOnly: true }),
    field(SO, 'org-unit-id', 'Organization unit', 'REFERENCE', { required: true, ref: 'org-unit-ref', writePermission: 'orders:manage' }),
    field(SO, 'customer-id', 'Customer party', 'TEXT', { required: true, help: 'Active workspace party UUID (customer).', writePermission: 'orders:manage' }),
    field(SO, 'customer-name', 'Customer name', 'TEXT', { required: true, writePermission: 'orders:manage' }),
    field(SO, 'order-type', 'Order type', 'SELECT', { ref: 'order-types', defaultValue: 'STANDARD', writePermission: 'orders:manage' }),
    field(SO, 'warehouse-id', 'Fulfillment warehouse', 'REFERENCE', { required: true, ref: 'warehouse-ref', writePermission: 'orders:manage' }),
    field(SO, 'currency-code', 'Currency', 'TEXT', { defaultValue: 'USD', writePermission: 'orders:manage' }),
    field(SO, 'status', 'Status', 'SELECT', { readOnly: true, ref: 'order-statuses' }),
    field(SO, 'total-amount', 'Total (minor units)', 'TEXT', { readOnly: true }),
    field(SO, 'customer-po-reference', 'Customer PO reference', 'TEXT', { writePermission: 'orders:manage' }),
    field(SO, 'line-product-id', 'Line product', 'REFERENCE', { required: true, ref: 'product-ref', writePermission: 'orders:manage', help: 'First line only in this window slice.' }),
    field(SO, 'line-product-code', 'Line product code', 'TEXT', { required: true, writePermission: 'orders:manage' }),
    field(SO, 'line-product-name', 'Line product name', 'TEXT', { required: true, writePermission: 'orders:manage' }),
    field(SO, 'line-ordered-quantity', 'Line quantity', 'NUMBER', { required: true, scale: 6, defaultValue: '1.000000', writePermission: 'orders:manage' }),
    field(SO, 'line-uom-id', 'Line unit of measure', 'REFERENCE', { required: true, ref: 'uom-ref', writePermission: 'orders:manage' }),
    field(SO, 'line-unit-price-minor', 'Line unit price (minor)', 'INTEGER', { required: true, writePermission: 'orders:manage' }),
    field(SO, 'line-warehouse-id', 'Line warehouse', 'REFERENCE', { ref: 'warehouse-ref', writePermission: 'orders:manage', help: 'Defaults to the header warehouse when empty.' }),
  ];

  const SQ = 'orders.sales-quotes';
  const sqFields = [
    field(SQ, 'quote-number', 'Quote number', 'TEXT', { readOnly: true }),
    field(SQ, 'org-unit-id', 'Organization unit', 'REFERENCE', { required: true, ref: 'org-unit-ref', writePermission: 'orders:quotes:manage' }),
    field(SQ, 'customer-id', 'Customer party', 'TEXT', { required: true, help: 'Active workspace party UUID (customer).', writePermission: 'orders:quotes:manage' }),
    field(SQ, 'customer-name', 'Customer name', 'TEXT', { required: true, writePermission: 'orders:quotes:manage' }),
    field(SQ, 'currency-code', 'Currency', 'TEXT', { defaultValue: 'USD', writePermission: 'orders:quotes:manage' }),
    field(SQ, 'valid-until', 'Valid until', 'DATETIME', { required: true, writePermission: 'orders:quotes:manage' }),
    field(SQ, 'payment-term-days', 'Payment term (days)', 'INTEGER', { defaultValue: 30, writePermission: 'orders:quotes:manage' }),
    field(SQ, 'notes', 'Notes', 'TEXT', { writePermission: 'orders:quotes:manage' }),
    field(SQ, 'status', 'Status', 'SELECT', { readOnly: true, ref: 'quote-statuses' }),
    field(SQ, 'total-amount', 'Total (minor units)', 'TEXT', { readOnly: true }),
    field(SQ, 'line-product-id', 'Line product', 'REFERENCE', { required: true, ref: 'product-ref', writePermission: 'orders:quotes:manage', help: 'First line only in this window slice.' }),
    field(SQ, 'line-product-code', 'Line product code', 'TEXT', { required: true, writePermission: 'orders:quotes:manage' }),
    field(SQ, 'line-product-name', 'Line product name', 'TEXT', { required: true, writePermission: 'orders:quotes:manage' }),
    field(SQ, 'line-quoted-quantity', 'Line quantity', 'NUMBER', { required: true, scale: 6, defaultValue: '1.000000', writePermission: 'orders:quotes:manage' }),
    field(SQ, 'line-uom-id', 'Line unit of measure', 'REFERENCE', { required: true, ref: 'uom-ref', writePermission: 'orders:quotes:manage' }),
    field(SQ, 'line-unit-price-minor', 'Line unit price (minor)', 'INTEGER', { required: true, writePermission: 'orders:quotes:manage' }),
  ];

  const FO = 'orders.fulfillment-orders';
  const foFields = [
    field(FO, 'fulfillment-number', 'Fulfillment number', 'TEXT', { readOnly: true }),
    field(FO, 'order-id', 'Sales order', 'TEXT', { required: true, writePermission: 'orders:fulfill' }),
    field(FO, 'warehouse-id', 'Ship-from warehouse', 'REFERENCE', { required: true, ref: 'warehouse-ref', writePermission: 'orders:fulfill' }),
    field(FO, 'carrier', 'Carrier', 'TEXT', { writePermission: 'orders:fulfill' }),
    field(FO, 'tracking-number', 'Tracking number', 'TEXT', { writePermission: 'orders:fulfill' }),
    field(FO, 'status', 'Status', 'SELECT', { readOnly: true, ref: 'fulfillment-statuses' }),
    field(FO, 'line-order-line-id', 'Order line', 'TEXT', { required: true, help: 'Sales order line UUID to ship.', writePermission: 'orders:fulfill' }),
    field(FO, 'line-shipped-quantity', 'Shipped quantity', 'NUMBER', { required: true, scale: 6, defaultValue: '1.000000', writePermission: 'orders:fulfill' }),
  ];

  const CM = 'orders.customer-credit-memos';
  const cmFields = [
    field(CM, 'credit-memo-number', 'Credit memo number', 'TEXT', { readOnly: true }),
    field(CM, 'customer-id', 'Customer party', 'TEXT', { required: true, help: 'Active workspace party UUID (customer).', writePermission: 'orders:credit-memos:manage' }),
    field(CM, 'order-id', 'Sales order', 'TEXT', { writePermission: 'orders:credit-memos:manage' }),
    field(CM, 'invoice-id', 'Customer invoice', 'TEXT', { writePermission: 'orders:credit-memos:manage' }),
    field(CM, 'currency-code', 'Currency', 'TEXT', { defaultValue: 'USD', writePermission: 'orders:credit-memos:manage' }),
    field(CM, 'reason', 'Reason', 'TEXT', { required: true, writePermission: 'orders:credit-memos:manage' }),
    field(CM, 'status', 'Status', 'SELECT', { readOnly: true, ref: 'credit-memo-statuses' }),
    field(CM, 'total-amount', 'Total (minor units)', 'TEXT', { readOnly: true }),
    field(CM, 'line-quantity', 'Line quantity', 'NUMBER', { required: true, scale: 6, defaultValue: '1.000000', writePermission: 'orders:credit-memos:manage' }),
    field(CM, 'line-unit-price-minor', 'Line unit price (minor)', 'INTEGER', { required: true, writePermission: 'orders:credit-memos:manage' }),
    field(CM, 'line-reason', 'Line reason', 'TEXT', { required: true, writePermission: 'orders:credit-memos:manage', help: 'Defaults to the header reason when empty.' }),
    field(CM, 'line-product-id', 'Line product', 'TEXT', { writePermission: 'orders:credit-memos:manage' }),
  ];

  const CI = 'orders.customer-invoices';
  const ciFields = [
    field(CI, 'invoice-number', 'Invoice number', 'TEXT', { readOnly: true }),
    field(CI, 'order-id', 'Sales order', 'TEXT', { required: true, help: 'Sales order UUID to bill shipped quantities.', writePermission: 'orders:invoices:manage' }),
    field(CI, 'customer-name', 'Customer name', 'TEXT', { readOnly: true }),
    field(CI, 'currency-code', 'Currency', 'TEXT', { readOnly: true }),
    field(CI, 'due-date', 'Due date', 'DATETIME', { required: true, writePermission: 'orders:invoices:manage' }),
    field(CI, 'notes', 'Notes', 'TEXT', { writePermission: 'orders:invoices:manage' }),
    field(CI, 'status', 'Status', 'SELECT', { readOnly: true, ref: 'invoice-statuses' }),
    field(CI, 'total-amount', 'Total (minor units)', 'TEXT', { readOnly: true }),
  ];

  return {
    'orders-sales-quotes': window(
      'orders-sales-quotes',
      'Sales quotes',
      'Sales quotes',
      'Create and review customer sales quotations.',
      'orders:read',
      dictionary('orders-sales-quotes', 'Sales quotes', SQ, [entity(SQ, 'Sales quotes')], sqFields, [], [
        values('quote-statuses', QUOTE_STATUS),
        ORG_UNIT_REF,
        PRODUCT_REF,
        UOM_REF,
      ], [
        view('sales-quotes', 'Sales quotes', [
          tab('sq-header', 'Quote', 0, SQ, [
            ['quote-number', 4, 'summary'],
            ['status', 4, 'summary'],
            ['total-amount', 4, 'summary'],
            ['org-unit-id', 6, 'parties'],
            ['customer-id', 6, 'parties'],
            ['customer-name', 12, 'parties'],
            ['currency-code', 3, 'terms'],
            ['valid-until', 6, 'terms'],
            ['payment-term-days', 3, 'terms'],
            ['notes', 12, 'terms'],
            ['line-product-id', 6, 'first-line'],
            ['line-product-code', 3, 'first-line'],
            ['line-product-name', 3, 'first-line'],
            ['line-quoted-quantity', 3, 'first-line'],
            ['line-uom-id', 3, 'first-line'],
            ['line-unit-price-minor', 3, 'first-line'],
          ], sqFields, {
            sections: [
              section('summary', 'Summary', 0),
              section('parties', 'Customer & organization', 1),
              section('terms', 'Commercial terms', 2),
              section('first-line', 'First quote line', 3),
            ],
          }),
        ], { search: ['quote-number', 'customer-name'], sort: 'quote-number' }),
      ], [
        action(
          SQ,
          'accept',
          'Accept quote',
          'orders:quotes:approve',
          ['status', 'NOT_IN', ['CANCELLED', 'CONVERTED', 'ACCEPTED']],
          'Mark this quote as accepted by the customer?',
        ),
        action(
          SQ,
          'convert',
          'Convert to sales order',
          'orders:quotes:manage',
          ['status', 'EQ', 'ACCEPTED'],
          'Create a draft sales order from this accepted quote?',
          WAREHOUSE_ID_PARAM,
        ),
      ]),
    ),
    'orders-sales-orders': window(
      'orders-sales-orders',
      'Sales orders',
      'Sales orders',
      'Create and review customer sales orders.',
      'orders:read',
      dictionary('orders-sales-orders', 'Sales orders', SO, [entity(SO, 'Sales orders')], soFields, [], [
        values('order-types', ORDER_TYPES),
        values('order-statuses', ORDER_STATUS),
        ORG_UNIT_REF,
        WAREHOUSE_REF,
        PRODUCT_REF,
        UOM_REF,
      ], [
        view('sales-orders', 'Sales orders', [
          tab('so-header', 'Order', 0, SO, [
            ['order-number', 4, 'summary'],
            ['status', 4, 'summary'],
            ['total-amount', 4, 'summary'],
            ['org-unit-id', 6, 'parties'],
            ['customer-id', 6, 'parties'],
            ['customer-name', 12, 'parties'],
            ['order-type', 4, 'delivery'],
            ['warehouse-id', 6, 'delivery'],
            ['currency-code', 3, 'delivery'],
            ['customer-po-reference', 6, 'delivery'],
            ['line-product-id', 6, 'first-line'],
            ['line-product-code', 3, 'first-line'],
            ['line-product-name', 3, 'first-line'],
            ['line-ordered-quantity', 3, 'first-line'],
            ['line-uom-id', 3, 'first-line'],
            ['line-unit-price-minor', 3, 'first-line'],
            ['line-warehouse-id', 6, 'first-line'],
          ], soFields, {
            sections: [
              section('summary', 'Summary', 0),
              section('parties', 'Customer & organization', 1),
              section('delivery', 'Fulfillment', 2),
              section('first-line', 'First order line', 3),
            ],
          }),
        ], { search: ['order-number', 'customer-name'], sort: 'order-number' }),
      ], [
        action(
          SO,
          'confirm',
          'Confirm order',
          'orders:confirm',
          ['status', 'IN', ['DRAFT', 'SUBMITTED']],
          'Confirm this sales order for fulfillment?',
        ),
        action(
          SO,
          'allocate',
          'Allocate inventory',
          'orders:allocate',
          ['status', 'IN', ['CONFIRMED', 'PROCESSING']],
          'Allocate the first order line at the order ship-to warehouse?',
        ),
        action(
          SO,
          'issue-invoice',
          'Issue customer invoice',
          'orders:invoices:manage',
          ['status', 'IN', ['CONFIRMED', 'PROCESSING', 'PARTIALLY_FULFILLED', 'FULFILLED']],
          'Issue a customer invoice for shipped quantities on this order?',
          INVOICE_DUE_PARAM,
        ),
      ]),
    ),
    'orders-fulfillment-orders': window(
      'orders-fulfillment-orders',
      'Fulfillment orders',
      'Fulfillment orders',
      'Create outbound fulfillment shipments against allocated sales order lines.',
      'orders:read',
      dictionary('orders-fulfillment-orders', 'Fulfillment orders', FO, [entity(FO, 'Fulfillment orders')], foFields, [], [
        values('fulfillment-statuses', FULFILLMENT_STATUS),
        WAREHOUSE_REF,
      ], [
        view('fulfillment-orders', 'Fulfillment orders', [
          tab('fo-header', 'Shipment', 0, FO, [
            ['fulfillment-number', 4, 'summary'],
            ['status', 4, 'summary'],
            ['order-id', 8, 'source'],
            ['warehouse-id', 6, 'logistics'],
            ['carrier', 4, 'logistics'],
            ['tracking-number', 4, 'logistics'],
            ['line-order-line-id', 8, 'first-line'],
            ['line-shipped-quantity', 4, 'first-line'],
          ], foFields, {
            sections: [
              section('summary', 'Summary', 0),
              section('source', 'Sales order', 1),
              section('logistics', 'Carrier & warehouse', 2),
              section('first-line', 'First shipment line', 3),
            ],
          }),
        ], { search: ['fulfillment-number'], sort: 'fulfillment-number' }),
      ], [
        action(
          FO,
          'dispatch',
          'Dispatch shipment',
          'orders:fulfill',
          ['status', 'IN', ['RELEASED', 'PICKING', 'PACKED']],
          'Dispatch this fulfillment and record inventory issue proof?',
          INVENTORY_ISSUE_PARAM,
        ),
      ]),
    ),
    'orders-customer-credit-memos': window(
      'orders-customer-credit-memos',
      'Credit memos',
      'Credit memos',
      'Issue customer credit memos for returns and billing adjustments.',
      'orders:read',
      dictionary('orders-customer-credit-memos', 'Credit memos', CM, [entity(CM, 'Customer credit memos')], cmFields, [], [
        values('credit-memo-statuses', CREDIT_MEMO_STATUS),
      ], [
        view('customer-credit-memos', 'Credit memos', [
          tab('cm-header', 'Credit memo', 0, CM, [
            ['credit-memo-number', 4, 'summary'],
            ['status', 4, 'summary'],
            ['total-amount', 4, 'summary'],
            ['customer-id', 6, 'parties'],
            ['order-id', 6, 'source'],
            ['invoice-id', 6, 'source'],
            ['currency-code', 3, 'terms'],
            ['reason', 12, 'terms'],
            ['line-quantity', 3, 'first-line'],
            ['line-unit-price-minor', 3, 'first-line'],
            ['line-reason', 6, 'first-line'],
            ['line-product-id', 6, 'first-line'],
          ], cmFields, {
            sections: [
              section('summary', 'Summary', 0),
              section('parties', 'Customer', 1),
              section('source', 'Order & invoice', 2),
              section('terms', 'Commercial reason', 3),
              section('first-line', 'First credit line', 4),
            ],
          }),
        ], { search: ['credit-memo-number', 'reason'], sort: 'credit-memo-number' }),
      ]),
    ),
    'orders-customer-invoices': window(
      'orders-customer-invoices',
      'Customer invoices',
      'Customer invoices',
      'Issue and review customer AR invoices against shipped order quantities.',
      'orders:read',
      dictionary('orders-customer-invoices', 'Customer invoices', CI, [entity(CI, 'Customer invoices')], ciFields, [], [
        values('invoice-statuses', INVOICE_STATUS),
      ], [
        view('customer-invoices', 'Customer invoices', [
          tab('inv-header', 'Invoice', 0, CI, [
            ['invoice-number', 4, 'summary'],
            ['status', 4, 'summary'],
            ['total-amount', 4, 'summary'],
            ['order-id', 8, 'source'],
            ['customer-name', 8, 'parties'],
            ['currency-code', 3, 'terms'],
            ['due-date', 6, 'terms'],
            ['notes', 12, 'terms'],
          ], ciFields, {
            sections: [
              section('summary', 'Summary', 0),
              section('source', 'Sales order', 1),
              section('parties', 'Customer', 2),
              section('terms', 'Billing terms', 3),
            ],
          }),
        ], { search: ['invoice-number', 'customer-name'], sort: 'invoice-number' }),
      ]),
    ),
  };
}
