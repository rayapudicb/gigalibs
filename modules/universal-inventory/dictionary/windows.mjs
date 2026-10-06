// WI-OI-120f (F0.5), F0.6, WI-OI-120s (S16): Universal Inventory's six metadata windows. Edit here, then run
// `node scripts/generate-windows.mjs universal-inventory` and `pnpm modules:catalog`.

const WH_TYPES = [['PHYSICAL', 'Physical'], ['VIRTUAL', 'Virtual'], ['TRANSIT', 'In transit'], ['CONSIGNMENT', 'Consignment'], ['QUARANTINE', 'Quarantine'], ['VAN_STOCK', 'Van stock']];
const LOC_TYPES = [
  ['RECEIVING', 'Receiving'], ['STORAGE', 'Storage'], ['PICKING', 'Picking'], ['STAGING', 'Staging'], ['PACKING', 'Packing'], ['SHIPPING', 'Shipping'],
  ['QUARANTINE', 'Quarantine'], ['INSPECTION', 'Inspection'], ['SCRAP', 'Scrap'], ['TRANSIT', 'Transit'],
];
const STOCK = [['AVAILABLE', 'Available'], ['RESERVED', 'Reserved'], ['QUARANTINED', 'Quarantined'], ['INSPECTION', 'Inspection'], ['DAMAGED', 'Damaged'], ['BLOCKED', 'Blocked'], ['EXPIRED', 'Expired']];
const VALUATION = [['STANDARD', 'Standard cost'], ['MOVING_AVERAGE', 'Moving average'], ['FIFO', 'FIFO']];
const RECEIPT = [['DRAFT', 'Draft'], ['EXPECTED', 'Expected'], ['RECEIVING', 'Receiving'], ['COMPLETED', 'Completed'], ['CANCELLED', 'Cancelled']];
const INSPECTION = [['PENDING', 'Pending'], ['PASSED', 'Passed'], ['FAILED', 'Failed'], ['QUARANTINED', 'Quarantined']];
const DIRECTION = [['DEBIT', 'In (debit)'], ['CREDIT', 'Out (credit)']];

export function windowSource(builderFor) {
  const { entity, field, values, lookup, tab, section, relationship, action, dictionary, window } = builderFor({
    route: '/inventory',
    createWith: {
      'inventory-warehouses': ['universal-inventory', 'inventory-warehouses', 'inventory:warehouses:manage'],
      'catalogue-products': ['product-catalogue', 'catalogue-products', 'products:create'],
      'catalogue-uoms': ['product-catalogue', 'catalogue-units', 'uoms:manage'],
    },
  });
  // Inventory's views were first written with their search and sort before the tabs; the order is kept.
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
  // Lookups are resolved by the module's registered resolver; they name no target entity, so any window can use them.
  const WAREHOUSE_REF = lookup('warehouse-ref', 'inventory-warehouses');
  const LOCATION_REF = lookup('location-ref', 'inventory-locations');
  const PRODUCT_REF = lookup('product-ref', 'catalogue-products');
  const UOM_REF = lookup('uom-ref', 'catalogue-uoms');
  const windows = {};

  // 1. Warehouses with their locations
  const W = 'inventory.warehouses';
  const L = 'inventory.locations';
  const wf = [
    field(W, 'code', 'Code', 'TEXT', { required: true, help: 'Short unique code, for example WH-MAIN.' }), field(W, 'name', 'Name', 'TEXT', { required: true }),
    field(W, 'warehouse-type', 'Type', 'SELECT', { required: true, ref: 'warehouse-types' }), field(W, 'description', 'Description', 'TEXTAREA'),
    field(W, 'address', 'Address', 'TEXTAREA'), field(W, 'is-active', 'Active', 'BOOLEAN', { readOnly: true }),
    field(L, 'warehouse-id', 'Warehouse', 'REFERENCE', { ref: 'warehouse-ref' }), field(L, 'code', 'Code', 'TEXT', { required: true }), field(L, 'name', 'Name', 'TEXT', { required: true }),
    field(L, 'location-type', 'Type', 'SELECT', { required: true, ref: 'location-types' }), field(L, 'aisle', 'Aisle'), field(L, 'rack', 'Rack'),
    field(L, 'shelf', 'Shelf'), field(L, 'bin', 'Bin'), field(L, 'barcode', 'Barcode'), field(L, 'allow-negative', 'Allow negative stock', 'BOOLEAN'),
    field(L, 'is-active', 'Active', 'BOOLEAN', { readOnly: true }),
  ];
  windows['inventory-warehouses'] = window('inventory-warehouses', 'Warehouses and locations', 'Warehouses', 'Warehouses and their storage locations.', 'inventory:read',
    dictionary('inventory-warehouses', 'Warehouses and locations', W, [entity(W, 'Warehouses'), entity(L, 'Locations')], wf,
      [relationship('warehouse-locations', W, L, 'warehouse-id')], [values('warehouse-types', WH_TYPES), values('location-types', LOC_TYPES), WAREHOUSE_REF], [
        view('warehouses', 'Warehouses', [
          tab('warehouse', 'Warehouse', 0, W, [
            ['code', 4, 'main'], ['name', 8, 'main'], ['warehouse-type', 4, 'main'], ['is-active', 4, 'main'], ['description', 12, 'details'], ['address', 12, 'details'],
          ], wf, { sections: [section('main', 'Warehouse', 0), section('details', 'Details', 1)] }),
          tab('locations', 'Locations', 1, L, [
            ['code', 3], ['name', 5], ['location-type', 4], ['aisle', 3], ['rack', 3], ['shelf', 3], ['bin', 3], ['barcode', 6], ['allow-negative', 6], ['is-active', 4],
          ], wf, { parent: 'warehouse-locations' }),
        ], { search: ['code', 'name'], sort: 'code' }),
      ]));

  // 2. Items
  const I = 'inventory.items';
  const itf = [
    field(I, 'product-id', 'Product', 'REFERENCE', { required: true, ref: 'product-ref', help: 'Products come from the Product Catalogue.' }),
    field(I, 'default-warehouse-id', 'Default warehouse', 'REFERENCE', { ref: 'warehouse-ref' }),
    field(I, 'default-location-id', 'Default location', 'REFERENCE', { ref: 'location-ref' }),
    field(I, 'valuation-method', 'Valuation', 'SELECT', { ref: 'valuation-methods' }), field(I, 'standard-cost-minor', 'Standard cost (minor units)', 'NUMBER', { scale: 0 }),
    field(I, 'reorder-point', 'Reorder point', 'NUMBER', { scale: 3 }), field(I, 'safety-stock', 'Safety stock', 'NUMBER', { scale: 3 }),
    field(I, 'shelf-life-days', 'Shelf life (days)', 'INTEGER'),
    field(I, 'is-lot-tracked', 'Lot tracked', 'BOOLEAN'), field(I, 'is-serial-tracked', 'Serial tracked', 'BOOLEAN'), field(I, 'is-active', 'Active', 'BOOLEAN', { readOnly: true }),
  ];
  windows['inventory-items'] = window('inventory-items', 'Stocked items', 'Items', 'Products held in stock and how they are replenished and valued.', 'inventory:read',
    dictionary('inventory-items', 'Stocked items', I, [entity(I, 'Stocked items')], itf, [], [PRODUCT_REF, WAREHOUSE_REF, LOCATION_REF, values('valuation-methods', VALUATION)], [
      view('items', 'Stocked items', [
        tab('item', 'Item', 0, I, [
          ['product-id', 6, 'main'], ['valuation-method', 3, 'main'], ['is-active', 3, 'main'], ['default-warehouse-id', 6, 'stocking'],
          ['default-location-id', 6, 'stocking'], ['reorder-point', 4, 'stocking'], ['safety-stock', 4, 'stocking'], ['shelf-life-days', 4, 'stocking'],
          ['standard-cost-minor', 4, 'costing'], ['is-lot-tracked', 4, 'tracking'], ['is-serial-tracked', 4, 'tracking'],
        ], itf, { sections: [section('main', 'Item', 0), section('stocking', 'Stocking', 1), section('costing', 'Costing', 2), section('tracking', 'Tracking', 3)] }),
      ]),
    ]));

  // 3. Lots
  const O = 'inventory.lots';
  const lf = [
    field(O, 'product-id', 'Product', 'REFERENCE', { required: true, ref: 'product-ref' }), field(O, 'lot-number', 'Lot number', 'TEXT', { required: true }),
    field(O, 'batch-code', 'Batch code'), field(O, 'supplier-lot-number', 'Supplier lot number'), field(O, 'manufactured-date', 'Manufactured', 'DATE'),
    field(O, 'expiry-date', 'Expires', 'DATE'), field(O, 'status', 'Status', 'SELECT', { readOnly: true, ref: 'stock-statuses' }),
  ];
  windows['inventory-lots'] = window('inventory-lots', 'Lots and batches', 'Lots', 'Lot and batch traceability.', 'inventory:read',
    dictionary('inventory-lots', 'Lots and batches', O, [entity(O, 'Lots')], lf, [], [PRODUCT_REF, values('stock-statuses', STOCK)], [
      view('lots', 'Lots and batches', [
        tab('lot', 'Lot', 0, O, [['lot-number', 4], ['product-id', 8], ['batch-code', 4], ['supplier-lot-number', 4], ['status', 4], ['manufactured-date', 6], ['expiry-date', 6]], lf),
      ], { search: ['lot-number', 'batch-code', 'supplier-lot-number'], sort: 'lot-number' }),
    ]));

  // 4. Receipts with lines and the Complete action
  const R = 'inventory.receipts';
  const RL = 'inventory.receipt-lines';
  const rf = [
    field(R, 'receipt-number', 'Receipt number', 'TEXT', { readOnly: true }), field(R, 'warehouse-id', 'Warehouse', 'REFERENCE', { required: true, ref: 'warehouse-ref' }),
    field(R, 'external-document-reference', 'Supplier document'), field(R, 'notes', 'Notes', 'TEXTAREA'),
    field(R, 'status', 'Status', 'SELECT', { readOnly: true, ref: 'receipt-statuses' }),
    field(R, 'created-at', 'Created', 'DATETIME', { readOnly: true }), field(R, 'completed-at', 'Completed', 'DATETIME', { readOnly: true }),
    field(RL, 'receipt-id', 'Receipt'), field(RL, 'line-number', 'Line', 'INTEGER', { readOnly: true }),
    field(RL, 'product-id', 'Product', 'REFERENCE', { required: true, ref: 'product-ref' }),
    field(RL, 'uom-id', 'Unit', 'REFERENCE', { required: true, ref: 'uom-ref' }), field(RL, 'expected-quantity', 'Expected quantity', 'NUMBER', { required: true, scale: 3 }),
    field(RL, 'received-quantity', 'Received quantity', 'NUMBER', { readOnly: true, scale: 3 }),
    field(RL, 'target-location-id', 'Put-away location', 'REFERENCE', { ref: 'location-ref', help: 'Required before the receipt can be completed.' }),
    field(RL, 'lot-number', 'Lot number'), field(RL, 'expiry-date', 'Expires', 'DATE'),
    field(RL, 'inspection-status', 'Inspection', 'SELECT', { readOnly: true, ref: 'inspection-statuses' }),
  ];
  windows['inventory-receipts'] = window('inventory-receipts', 'Goods receipts', 'Receipts', 'Receive goods into warehouse locations.', 'inventory:read',
    dictionary('inventory-receipts', 'Goods receipts', R, [entity(R, 'Receipts'), entity(RL, 'Receipt lines')], rf, [relationship('receipt-lines', R, RL, 'receipt-id')],
      [WAREHOUSE_REF, LOCATION_REF, PRODUCT_REF, UOM_REF, values('receipt-statuses', RECEIPT), values('inspection-statuses', INSPECTION)], [
        view('receipts', 'Goods receipts', [
          tab('receipt', 'Receipt', 0, R, [
            ['receipt-number', 4, 'main'], ['status', 4, 'main'], ['warehouse-id', 4, 'main'], ['external-document-reference', 6, 'main'], ['created-at', 3, 'main'],
            ['completed-at', 3, 'main'], ['notes', 12, 'main'],
          ], rf, { sections: [section('main', 'Receipt', 0)] }),
          tab('lines', 'Lines', 1, RL, [
            ['line-number', 2], ['product-id', 5], ['uom-id', 5], ['expected-quantity', 4], ['received-quantity', 4], ['target-location-id', 4], ['lot-number', 4],
            ['expiry-date', 4], ['inspection-status', 4],
          ], rf, { parent: 'receipt-lines' }),
        ], { search: ['receipt-number', 'external-document-reference'], sort: 'created-at', direction: 'DESC' }),
      ], [
        action(R, 'complete', 'Complete receipt', 'inventory:receive', ['status', 'EQ', 'DRAFT'],
          'Complete this receipt? The stock is posted to the put-away locations and the receipt can no longer change.'),
      ]));

  // 5. Balances and 6. Stock ledger (read only)
  const B = 'inventory.balances';
  const bf = [
    field(B, 'warehouse-id', 'Warehouse', 'REFERENCE', { readOnly: true, ref: 'warehouse-ref' }), field(B, 'location-id', 'Location', 'REFERENCE', { readOnly: true, ref: 'location-ref' }),
    field(B, 'product-id', 'Product', 'REFERENCE', { readOnly: true, ref: 'product-ref' }), field(B, 'stock-status', 'Status', 'SELECT', { readOnly: true, ref: 'stock-statuses' }),
    field(B, 'on-hand-quantity', 'On hand', 'NUMBER', { readOnly: true, scale: 3 }), field(B, 'reserved-quantity', 'Reserved', 'NUMBER', { readOnly: true, scale: 3 }),
    field(B, 'available-quantity', 'Available', 'NUMBER', { readOnly: true, scale: 3 }), field(B, 'last-movement-at', 'Last movement', 'DATETIME', { readOnly: true }),
  ];
  windows['inventory-balances'] = window('inventory-balances', 'Stock balances', 'Balances', 'Stock on hand, reserved and available by location.', 'inventory:read',
    dictionary('inventory-balances', 'Stock balances', B, [entity(B, 'Stock balances')], bf, [], [WAREHOUSE_REF, LOCATION_REF, PRODUCT_REF, values('stock-statuses', STOCK)], [
      view('balances', 'Stock balances', [
        tab('balance', 'Balance', 0, B, [
          ['product-id', 4], ['warehouse-id', 4], ['location-id', 4], ['stock-status', 3], ['on-hand-quantity', 3], ['reserved-quantity', 3], ['available-quantity', 3],
          ['last-movement-at', 4],
        ], bf),
      ], { sort: 'last-movement-at', direction: 'DESC' }),
    ]));
  const G = 'inventory.ledger';
  const gf = [
    field(G, 'created-at', 'Posted', 'DATETIME', { readOnly: true }), field(G, 'direction', 'Direction', 'SELECT', { readOnly: true, ref: 'directions' }),
    field(G, 'product-id', 'Product', 'REFERENCE', { readOnly: true, ref: 'product-ref' }), field(G, 'warehouse-id', 'Warehouse', 'REFERENCE', { readOnly: true, ref: 'warehouse-ref' }),
    field(G, 'location-id', 'Location', 'REFERENCE', { readOnly: true, ref: 'location-ref' }), field(G, 'quantity', 'Quantity', 'NUMBER', { readOnly: true, scale: 3 }),
    field(G, 'stock-status', 'Status', 'SELECT', { readOnly: true, ref: 'stock-statuses' }), field(G, 'transaction-id', 'Transaction', 'TEXT', { readOnly: true }),
  ];
  windows['inventory-ledger'] = window('inventory-ledger', 'Stock ledger', 'Stock ledger', 'Every posted stock movement. Reading entries needs inventory:ledger:read.', 'inventory:read',
    dictionary('inventory-ledger', 'Stock ledger', G, [entity(G, 'Stock ledger')], gf, [],
      [WAREHOUSE_REF, LOCATION_REF, PRODUCT_REF, values('directions', DIRECTION), values('stock-statuses', STOCK)], [
        view('ledger', 'Stock ledger', [
          tab('entry', 'Entry', 0, G, [
            ['created-at', 4], ['direction', 3], ['product-id', 5], ['warehouse-id', 4], ['location-id', 4], ['quantity', 4], ['stock-status', 4], ['transaction-id', 12],
          ], gf),
        ], { sort: 'created-at', direction: 'DESC' }),
      ]));

  return windows;
}
