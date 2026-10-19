// WI-OI-120gh/gn (Table 1): Procurement metadata windows — purchase orders and vendor bills.
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
  const { entity, field, values, lookup, tab, section, dictionary, window } = builderFor({
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

  return {
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
      ]),
    ),
  };
}
