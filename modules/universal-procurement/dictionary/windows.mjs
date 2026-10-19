// WI-OI-120gh/gs (Table 1): Procurement metadata windows and F0 record actions.
// Edit here, then `node scripts/generate-windows.mjs universal-procurement` and `pnpm modules:catalog`.

const REQUISITION_STATUS = [
  ['DRAFT', 'Draft'],
  ['SUBMITTED', 'Submitted'],
  ['PENDING_APPROVAL', 'Pending approval'],
  ['APPROVED', 'Approved'],
  ['REJECTED', 'Rejected'],
  ['CONVERTED', 'Converted'],
  ['CANCELLED', 'Cancelled'],
];

const DEBIT_MEMO_STATUS = [
  ['DRAFT', 'Draft'],
  ['ISSUED', 'Issued'],
  ['APPLIED', 'Applied'],
  ['REFUNDED', 'Refunded'],
  ['CANCELLED', 'Cancelled'],
];

const VENDOR_BILL_STATUS = [
  ['DRAFT', 'Draft'],
  ['SUBMITTED', 'Submitted'],
  ['PENDING_MATCH', 'Pending match'],
  ['MATCHED', 'Matched'],
  ['PRICE_VARIANCE_HOLD', 'Price variance hold'],
  ['APPROVED', 'Approved'],
  ['PAID', 'Paid'],
  ['VOID', 'Void'],
];

const PO_STATUS = [
  ['DRAFT', 'Draft'],
  ['SUBMITTED', 'Submitted'],
  ['APPROVED', 'Approved'],
  ['ISSUED', 'Issued'],
  ['ACKNOWLEDGED', 'Acknowledged'],
  ['PARTIALLY_RECEIVED', 'Partially received'],
  ['RECEIVED', 'Received'],
  ['CLOSED', 'Closed'],
  ['CANCELLED', 'Cancelled'],
];

export function windowSource(builderFor) {
  const { entity, field, values, lookup, tab, section, action, dictionary, window } = builderFor({
    route: '/procurement',
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

  const CONVERT_REQ_PARAMS = [
    { key: 'vendor-id', label: 'Vendor party UUID', type: 'TEXT', required: true },
    { key: 'vendor-name', label: 'Vendor name', type: 'TEXT', required: true },
    { key: 'destination-warehouse-id', label: 'Ship-to warehouse UUID', type: 'TEXT', required: true },
  ];

  const ORG_UNIT_REF = lookup('org-unit-ref', 'organization-units');
  const WAREHOUSE_REF = lookup('warehouse-ref', 'inventory-warehouses');
  const PRODUCT_REF = lookup('product-ref', 'catalogue-products');
  const UOM_REF = lookup('uom-ref', 'catalogue-uoms');

  const PO = 'procurement.purchase-orders';
  const poFields = [
    field(PO, 'order-number', 'PO number', 'TEXT', { readOnly: true }),
    field(PO, 'org-unit-id', 'Organization unit', 'REFERENCE', { required: true, ref: 'org-unit-ref', writePermission: 'procurement:orders:manage' }),
    field(PO, 'vendor-id', 'Vendor party', 'TEXT', { required: true, help: 'Active workspace party UUID (supplier).', writePermission: 'procurement:orders:manage' }),
    field(PO, 'vendor-name', 'Vendor name', 'TEXT', { required: true, writePermission: 'procurement:orders:manage' }),
    field(PO, 'destination-warehouse-id', 'Ship-to warehouse', 'REFERENCE', { required: true, ref: 'warehouse-ref', writePermission: 'procurement:orders:manage' }),
    field(PO, 'currency-code', 'Currency', 'TEXT', { defaultValue: 'USD', writePermission: 'procurement:orders:manage' }),
    field(PO, 'status', 'Status', 'SELECT', { readOnly: true, ref: 'po-statuses' }),
    field(PO, 'total-amount', 'Total (minor units)', 'TEXT', { readOnly: true }),
    field(PO, 'line-product-id', 'Line product', 'REFERENCE', { required: true, ref: 'product-ref', writePermission: 'procurement:orders:manage', help: 'First line only in this window slice.' }),
    field(PO, 'line-product-code', 'Line product code', 'TEXT', { required: true, writePermission: 'procurement:orders:manage' }),
    field(PO, 'line-product-name', 'Line product name', 'TEXT', { required: true, writePermission: 'procurement:orders:manage' }),
    field(PO, 'line-ordered-quantity', 'Line quantity', 'NUMBER', { required: true, scale: 6, defaultValue: '1.000000', writePermission: 'procurement:orders:manage' }),
    field(PO, 'line-uom-id', 'Line unit of measure', 'REFERENCE', { required: true, ref: 'uom-ref', writePermission: 'procurement:orders:manage' }),
    field(PO, 'line-unit-price-minor', 'Line unit price (minor)', 'INTEGER', { required: true, writePermission: 'procurement:orders:manage' }),
    field(PO, 'line-destination-warehouse-id', 'Line ship-to warehouse', 'REFERENCE', { ref: 'warehouse-ref', writePermission: 'procurement:orders:manage', help: 'Defaults to the header warehouse when empty.' }),
  ];

  const REQ = 'procurement.requisitions';
  const reqFields = [
    field(REQ, 'requisition-number', 'Requisition number', 'TEXT', { readOnly: true }),
    field(REQ, 'org-unit-id', 'Organization unit', 'REFERENCE', { required: true, ref: 'org-unit-ref', writePermission: 'procurement:requisitions:manage' }),
    field(REQ, 'description', 'Description', 'TEXT', { writePermission: 'procurement:requisitions:manage' }),
    field(REQ, 'currency-code', 'Currency', 'TEXT', { defaultValue: 'USD', writePermission: 'procurement:requisitions:manage' }),
    field(REQ, 'status', 'Status', 'SELECT', { readOnly: true, ref: 'requisition-statuses' }),
    field(REQ, 'total-estimated', 'Estimated total (minor units)', 'TEXT', { readOnly: true }),
    field(REQ, 'line-product-id', 'Line product', 'REFERENCE', { required: true, ref: 'product-ref', writePermission: 'procurement:requisitions:manage', help: 'First line only in this window slice.' }),
    field(REQ, 'line-product-code', 'Line product code', 'TEXT', { required: true, writePermission: 'procurement:requisitions:manage' }),
    field(REQ, 'line-product-name', 'Line product name', 'TEXT', { required: true, writePermission: 'procurement:requisitions:manage' }),
    field(REQ, 'line-quantity', 'Line quantity', 'NUMBER', { required: true, scale: 6, defaultValue: '1.000000', writePermission: 'procurement:requisitions:manage' }),
    field(REQ, 'line-uom-id', 'Line unit of measure', 'REFERENCE', { required: true, ref: 'uom-ref', writePermission: 'procurement:requisitions:manage' }),
    field(REQ, 'line-estimated-unit-price-minor', 'Line estimated unit price (minor)', 'INTEGER', { required: true, writePermission: 'procurement:requisitions:manage' }),
  ];

  const VB = 'procurement.vendor-bills';
  const vbFields = [
    field(VB, 'vendor-invoice-number', 'Vendor invoice #', 'TEXT', { required: true, writePermission: 'procurement:bills:manage' }),
    field(VB, 'vendor-id', 'Vendor party', 'TEXT', { required: true, help: 'Active workspace party UUID (supplier).', writePermission: 'procurement:bills:manage' }),
    field(VB, 'invoice-date', 'Invoice date', 'DATETIME', { required: true, writePermission: 'procurement:bills:manage' }),
    field(VB, 'due-date', 'Due date', 'DATETIME', { required: true, writePermission: 'procurement:bills:manage' }),
    field(VB, 'purchase-order-id', 'Purchase order', 'TEXT', { writePermission: 'procurement:bills:manage', help: 'Optional PO UUID to link the bill.' }),
    field(VB, 'currency-code', 'Currency', 'TEXT', { defaultValue: 'USD', writePermission: 'procurement:bills:manage' }),
    field(VB, 'status', 'Status', 'SELECT', { readOnly: true, ref: 'vendor-bill-statuses' }),
    field(VB, 'total-amount', 'Total (minor units)', 'TEXT', { readOnly: true }),
    field(VB, 'line-description', 'Line description', 'TEXT', { required: true, writePermission: 'procurement:bills:manage', help: 'First line only in this window slice.' }),
    field(VB, 'line-billed-quantity', 'Line quantity', 'NUMBER', { required: true, scale: 6, defaultValue: '1.000000', writePermission: 'procurement:bills:manage' }),
    field(VB, 'line-uom-id', 'Line unit of measure', 'REFERENCE', { required: true, ref: 'uom-ref', writePermission: 'procurement:bills:manage' }),
    field(VB, 'line-unit-price-minor', 'Line unit price (minor)', 'INTEGER', { required: true, writePermission: 'procurement:bills:manage' }),
    field(VB, 'line-product-id', 'Line product', 'REFERENCE', { ref: 'product-ref', writePermission: 'procurement:bills:manage' }),
  ];

  const DM = 'procurement.debit-memos';
  const dmFields = [
    field(DM, 'debit-memo-number', 'Debit memo number', 'TEXT', { readOnly: true }),
    field(DM, 'vendor-id', 'Vendor party', 'TEXT', { required: true, help: 'Active workspace party UUID (supplier).', writePermission: 'procurement:debit-memos:manage' }),
    field(DM, 'vendor-bill-id', 'Vendor bill', 'TEXT', { writePermission: 'procurement:debit-memos:manage' }),
    field(DM, 'purchase-order-id', 'Purchase order', 'TEXT', { writePermission: 'procurement:debit-memos:manage' }),
    field(DM, 'currency-code', 'Currency', 'TEXT', { defaultValue: 'USD', writePermission: 'procurement:debit-memos:manage' }),
    field(DM, 'reason', 'Reason', 'TEXT', { required: true, writePermission: 'procurement:debit-memos:manage' }),
    field(DM, 'status', 'Status', 'SELECT', { readOnly: true, ref: 'debit-memo-statuses' }),
    field(DM, 'total-amount', 'Total (minor units)', 'TEXT', { readOnly: true }),
    field(DM, 'line-description', 'Line description', 'TEXT', { required: true, writePermission: 'procurement:debit-memos:manage' }),
    field(DM, 'line-quantity', 'Line quantity', 'NUMBER', { required: true, scale: 6, defaultValue: '1.000000', writePermission: 'procurement:debit-memos:manage' }),
    field(DM, 'line-unit-price-minor', 'Line unit price (minor)', 'INTEGER', { required: true, writePermission: 'procurement:debit-memos:manage' }),
    field(DM, 'line-reason', 'Line reason', 'TEXT', { required: true, writePermission: 'procurement:debit-memos:manage', help: 'Defaults to the header reason when empty.' }),
    field(DM, 'line-product-id', 'Line product', 'REFERENCE', { ref: 'product-ref', writePermission: 'procurement:debit-memos:manage' }),
  ];

  return {
    'procurement-debit-memos': window(
      'procurement-debit-memos',
      'Debit memos',
      'Debit memos',
      'Issue vendor debit memos against bills or purchase orders.',
      'procurement:read',
      dictionary('procurement-debit-memos', 'Debit memos', DM, [entity(DM, 'Debit memos')], dmFields, [], [
        values('debit-memo-statuses', DEBIT_MEMO_STATUS),
        PRODUCT_REF,
      ], [
        view('debit-memos', 'Debit memos', [
          tab('dm-header', 'Debit memo', 0, DM, [
            ['debit-memo-number', 4, 'summary'],
            ['status', 4, 'summary'],
            ['total-amount', 4, 'summary'],
            ['vendor-id', 6, 'parties'],
            ['vendor-bill-id', 6, 'source'],
            ['purchase-order-id', 6, 'source'],
            ['currency-code', 3, 'terms'],
            ['reason', 12, 'terms'],
            ['line-description', 8, 'first-line'],
            ['line-product-id', 6, 'first-line'],
            ['line-quantity', 3, 'first-line'],
            ['line-unit-price-minor', 3, 'first-line'],
            ['line-reason', 6, 'first-line'],
          ], dmFields, {
            sections: [
              section('summary', 'Summary', 0),
              section('parties', 'Vendor', 1),
              section('source', 'Bill & PO', 2),
              section('terms', 'Reason', 3),
              section('first-line', 'First debit line', 4),
            ],
          }),
        ], { search: ['debit-memo-number', 'reason'], sort: 'debit-memo-number' }),
      ]),
    ),
    'procurement-requisitions': window(
      'procurement-requisitions',
      'Requisitions',
      'Requisitions',
      'Create and review internal purchase requisitions before PO conversion.',
      'procurement:read',
      dictionary('procurement-requisitions', 'Requisitions', REQ, [entity(REQ, 'Requisitions')], reqFields, [], [
        values('requisition-statuses', REQUISITION_STATUS),
        ORG_UNIT_REF,
        PRODUCT_REF,
        UOM_REF,
      ], [
        view('requisitions', 'Requisitions', [
          tab('req-header', 'Requisition', 0, REQ, [
            ['requisition-number', 4, 'summary'],
            ['status', 4, 'summary'],
            ['total-estimated', 4, 'summary'],
            ['org-unit-id', 6, 'parties'],
            ['description', 12, 'parties'],
            ['currency-code', 3, 'terms'],
            ['line-product-id', 6, 'first-line'],
            ['line-product-code', 3, 'first-line'],
            ['line-product-name', 3, 'first-line'],
            ['line-quantity', 3, 'first-line'],
            ['line-uom-id', 3, 'first-line'],
            ['line-estimated-unit-price-minor', 3, 'first-line'],
          ], reqFields, {
            sections: [
              section('summary', 'Summary', 0),
              section('parties', 'Requester context', 1),
              section('terms', 'Currency', 2),
              section('first-line', 'First requisition line', 3),
            ],
          }),
        ], { search: ['requisition-number', 'description'], sort: 'requisition-number' }),
      ], [
        action(
          REQ,
          'submit',
          'Submit for approval',
          'procurement:requisitions:manage',
          ['status', 'EQ', 'DRAFT'],
          'Submit this requisition for approval?',
        ),
        action(
          REQ,
          'approve',
          'Approve',
          'procurement:requisitions:approve',
          ['status', 'EQ', 'PENDING_APPROVAL'],
          'Approve this requisition?',
        ),
        action(
          REQ,
          'convert-to-po',
          'Convert to purchase order',
          'procurement:orders:manage',
          ['status', 'EQ', 'APPROVED'],
          'Create a draft purchase order from this approved requisition?',
          CONVERT_REQ_PARAMS,
        ),
      ]),
    ),
    'procurement-vendor-bills': window(
      'procurement-vendor-bills',
      'Vendor bills',
      'Vendor bills',
      'Record vendor AP invoices for matching and approval.',
      'procurement:read',
      dictionary('procurement-vendor-bills', 'Vendor bills', VB, [entity(VB, 'Vendor bills')], vbFields, [], [
        values('vendor-bill-statuses', VENDOR_BILL_STATUS),
        PRODUCT_REF,
        UOM_REF,
      ], [
        view('vendor-bills', 'Vendor bills', [
          tab('vb-header', 'Bill', 0, VB, [
            ['vendor-invoice-number', 4, 'summary'],
            ['status', 4, 'summary'],
            ['total-amount', 4, 'summary'],
            ['vendor-id', 6, 'parties'],
            ['purchase-order-id', 6, 'source'],
            ['currency-code', 3, 'terms'],
            ['invoice-date', 6, 'terms'],
            ['due-date', 6, 'terms'],
            ['line-description', 8, 'first-line'],
            ['line-product-id', 6, 'first-line'],
            ['line-billed-quantity', 3, 'first-line'],
            ['line-uom-id', 3, 'first-line'],
            ['line-unit-price-minor', 3, 'first-line'],
          ], vbFields, {
            sections: [
              section('summary', 'Summary', 0),
              section('parties', 'Vendor', 1),
              section('source', 'Purchase order', 2),
              section('terms', 'Dates & currency', 3),
              section('first-line', 'First bill line', 4),
            ],
          }),
        ], { search: ['vendor-invoice-number'], sort: 'vendor-invoice-number' }),
      ], [
        action(
          VB,
          'approve',
          'Approve bill',
          'procurement:bills:manage',
          ['status', 'NOT_IN', ['APPROVED', 'PAID', 'VOID', 'PRICE_VARIANCE_HOLD']],
          'Approve this vendor bill for payment?',
        ),
      ]),
    ),
    'procurement-purchase-orders': window(
      'procurement-purchase-orders',
      'Purchase orders',
      'Purchase orders',
      'Create and review purchase order commitments to vendors.',
      'procurement:read',
      dictionary('procurement-purchase-orders', 'Purchase orders', PO, [entity(PO, 'Purchase orders')], poFields, [], [
        values('po-statuses', PO_STATUS),
        ORG_UNIT_REF,
        WAREHOUSE_REF,
        PRODUCT_REF,
        UOM_REF,
      ], [
        view('purchase-orders', 'Purchase orders', [
          tab('po-header', 'Order', 0, PO, [
            ['order-number', 4, 'summary'],
            ['status', 4, 'summary'],
            ['total-amount', 4, 'summary'],
            ['org-unit-id', 6, 'parties'],
            ['vendor-id', 6, 'parties'],
            ['vendor-name', 12, 'parties'],
            ['destination-warehouse-id', 6, 'delivery'],
            ['currency-code', 3, 'delivery'],
            ['line-product-id', 6, 'first-line'],
            ['line-product-code', 3, 'first-line'],
            ['line-product-name', 3, 'first-line'],
            ['line-ordered-quantity', 3, 'first-line'],
            ['line-uom-id', 3, 'first-line'],
            ['line-unit-price-minor', 3, 'first-line'],
            ['line-destination-warehouse-id', 6, 'first-line'],
          ], poFields, {
            sections: [
              section('summary', 'Summary', 0),
              section('parties', 'Vendor & organization', 1),
              section('delivery', 'Delivery', 2),
              section('first-line', 'First order line', 3),
            ],
          }),
        ], { search: ['order-number', 'vendor-name'], sort: 'order-number' }),
      ], [
        action(
          PO,
          'issue',
          'Issue to vendor',
          'procurement:orders:issue',
          ['status', 'IN', ['DRAFT', 'APPROVED']],
          'Issue this purchase order to the vendor?',
        ),
        action(
          PO,
          'acknowledge',
          'Acknowledge receipt',
          'procurement:orders:manage',
          ['status', 'EQ', 'ISSUED'],
          'Record vendor acknowledgment of this purchase order?',
        ),
      ]),
    ),
  };
}
