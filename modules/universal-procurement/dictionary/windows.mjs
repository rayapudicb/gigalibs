// WI-OI-120gh (Table 1 row 6): first Procurement metadata window — purchase order header (create/read).
// Edit here, then `node scripts/generate-windows.mjs universal-procurement` and `pnpm modules:catalog`.

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

  return {
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
