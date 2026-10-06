// WI-OI-120g (U7), WI-OI-120s (S16): the Product Catalogue's eight metadata windows. Edit here, then run
// `node scripts/generate-windows.mjs product-catalogue` and `pnpm modules:catalog`.

const DIMENSIONS = [
  ['COUNT', 'Count'], ['LENGTH', 'Length'], ['WEIGHT', 'Weight'], ['VOLUME', 'Volume'], ['AREA', 'Area'], ['TIME', 'Time'],
  ['TEMPERATURE', 'Temperature'], ['DATA', 'Data'], ['CURRENCY', 'Currency'],
];
const PRODUCT_TYPES = [['GOOD', 'Good'], ['SERVICE', 'Service'], ['DIGITAL', 'Digital'], ['RESOURCE', 'Resource'], ['BUNDLE', 'Bundle']];
const PRODUCT_STATUSES = [['DRAFT', 'Draft'], ['ACTIVE', 'Active'], ['DISCONTINUED', 'Discontinued'], ['ARCHIVED', 'Archived']];
const CLASSIFICATIONS = [['PUBLIC', 'Public'], ['INTERNAL', 'Internal'], ['CONFIDENTIAL', 'Confidential'], ['RESTRICTED', 'Restricted']];
const VALUE_TYPES = [['STRING', 'Text'], ['INTEGER', 'Whole number'], ['DECIMAL', 'Decimal'], ['BOOLEAN', 'Yes/no'], ['DATE', 'Date'], ['ENUM', 'List of values']];
const CATALOGUE_STATUSES = [['DRAFT', 'Draft'], ['SUBMITTED', 'Submitted'], ['APPROVED', 'Approved'], ['PUBLISHED', 'Published']];
const PRICE_STATUSES = [['DRAFT', 'Draft'], ['SUBMITTED', 'Submitted'], ['APPROVED', 'Approved'], ['ACTIVATED', 'Active']];

export function windowSource(builderFor) {
  const { entity, field, values, lookup, tab, section, relationship, action, view, dictionary, window, REASON_REQUIRED } = builderFor({
    route: '/products',
    createWith: {
      'catalogue-products': ['product-catalogue', 'catalogue-products', 'products:create'],
      'catalogue-uoms': ['product-catalogue', 'catalogue-units', 'uoms:manage'],
      'catalogue-categories': ['product-catalogue', 'catalogue-categories', 'product-categories:manage'],
      'catalogue-catalogues': ['product-catalogue', 'catalogue-catalogues', 'catalogues:draft'],
      'catalogue-price-lists': ['product-catalogue', 'catalogue-price-lists', 'pricing:draft'],
    },
  });
  // Every Catalogue action asks for a reason.
  const act = (entityKey, key, label, permission, condition, prompt) => action(entityKey, key, label, permission, condition, prompt, REASON_REQUIRED);
  const UOM_REF = lookup('uom-ref', 'catalogue-uoms');
  const PRODUCT_REF = lookup('product-ref', 'catalogue-products');
  const CATEGORY_REF = lookup('category-ref', 'catalogue-categories');
  const CATALOGUE_REF = lookup('catalogue-ref', 'catalogue-catalogues');
  const PRICE_LIST_REF = lookup('price-list-ref', 'catalogue-price-lists');
  const windows = {};

  // 1. Units of measure with their conversions
  const U = 'catalogue.uoms';
  const C = 'catalogue.uom-conversions';
  const uf = [
    field(U, 'code', 'Code', 'TEXT', { required: true, help: 'Short unique code, for example EA or KG.' }), field(U, 'name', 'Name', 'TEXT', { required: true }),
    field(U, 'symbol', 'Symbol', 'TEXT', { required: true }), field(U, 'dimension', 'Dimension', 'SELECT', { required: true, ref: 'dimensions' }),
    field(U, 'std-precision', 'Decimal places', 'INTEGER'), field(U, 'costing-precision', 'Costing decimal places', 'INTEGER'),
    field(U, 'iso-code', 'ISO code'), field(U, 'ucum-code', 'UCUM code'), field(U, 'is-active', 'Active', 'BOOLEAN', { readOnly: true }),
    field(C, 'from-uom-id', 'From unit', 'REFERENCE', { ref: 'uom-ref' }), field(C, 'to-uom-id', 'To unit', 'REFERENCE', { required: true, ref: 'uom-ref' }),
    field(C, 'conversion-rate', 'Rate', 'NUMBER', { required: true, scale: 6, help: 'How many "to" units make one "from" unit.' }),
    field(C, 'product-id', 'Only for product', 'REFERENCE', { ref: 'product-ref', help: 'Leave empty for a conversion between units of the same dimension.' }),
    field(C, 'effective-from', 'Effective from', 'DATE'), field(C, 'effective-to', 'Effective to', 'DATE'),
    field(C, 'is-active', 'Active', 'BOOLEAN', { readOnly: true }),
  ];
  windows['catalogue-units'] = window('catalogue-units', 'Units and conversions', 'Units', 'Units of measure and their conversions.', 'uoms:read',
    dictionary('catalogue-units', 'Units and conversions', U, [entity(U, 'Units of measure'), entity(C, 'Conversions')], uf,
      [relationship('uom-conversions', U, C, 'from-uom-id')], [values('dimensions', DIMENSIONS), UOM_REF, PRODUCT_REF], [
        view('units', 'Units of measure', [
          tab('unit', 'Unit', 0, U, [
            ['code', 3, 'main'], ['name', 6, 'main'], ['symbol', 3, 'main'], ['dimension', 4, 'main'], ['std-precision', 4, 'main'],
            ['costing-precision', 4, 'main'], ['iso-code', 4, 'codes'], ['ucum-code', 4, 'codes'], ['is-active', 4, 'codes'],
          ], uf, { sections: [section('main', 'Unit', 0), section('codes', 'Standard codes', 1)] }),
          tab('conversions', 'Conversions', 1, C, [['to-uom-id', 4], ['conversion-rate', 3], ['product-id', 5], ['effective-from', 3], ['effective-to', 3], ['is-active', 3]],
            uf, { parent: 'uom-conversions' }),
        ], { search: ['code', 'name', 'symbol'], sort: 'code' }),
      ]));

  // 2. Categories
  const G = 'catalogue.categories';
  const gf = [
    field(G, 'code', 'Code', 'TEXT', { required: true }), field(G, 'name', 'Name', 'TEXT', { required: true }), field(G, 'description', 'Description', 'TEXTAREA'),
    field(G, 'parent-category-id', 'Parent category', 'REFERENCE', { ref: 'category-ref' }), field(G, 'is-default', 'Default category', 'BOOLEAN'),
  ];
  windows['catalogue-categories'] = window('catalogue-categories', 'Product categories', 'Categories', 'The category tree products are filed under.', 'products:read',
    dictionary('catalogue-categories', 'Product categories', G, [entity(G, 'Categories')], gf, [], [CATEGORY_REF], [
      view('categories', 'Categories', [
        tab('category', 'Category', 0, G, [['code', 3], ['name', 6], ['is-default', 3], ['parent-category-id', 6], ['description', 12]], gf),
      ], { search: ['code', 'name'], sort: 'name' }),
    ]));

  // 3. Attributes
  const A = 'catalogue.attributes';
  const af = [
    field(A, 'code', 'Code', 'TEXT', { required: true }), field(A, 'name', 'Name', 'TEXT', { required: true }), field(A, 'description', 'Description', 'TEXTAREA'),
    field(A, 'value-type', 'Value type', 'SELECT', { required: true, ref: 'value-types' }), field(A, 'is-required', 'Required', 'BOOLEAN'),
    field(A, 'unit', 'Unit'), field(A, 'allowed-values', 'Allowed values', 'TEXT', { help: 'For a list of values: the values, separated by commas.' }),
    field(A, 'min-value', 'Minimum', 'NUMBER', { scale: 6 }), field(A, 'max-value', 'Maximum', 'NUMBER', { scale: 6 }),
  ];
  windows['catalogue-attributes'] = window('catalogue-attributes', 'Product attributes', 'Attributes', 'The attributes products can carry.', 'products:read',
    dictionary('catalogue-attributes', 'Product attributes', A, [entity(A, 'Attributes')], af, [], [values('value-types', VALUE_TYPES)], [
      view('attributes', 'Attributes', [
        tab('attribute', 'Attribute', 0, A, [
          ['code', 3], ['name', 6], ['value-type', 3], ['is-required', 3], ['unit', 3], ['min-value', 3], ['max-value', 3], ['allowed-values', 12], ['description', 12],
        ], af),
      ], { search: ['code', 'name'], sort: 'code' }),
    ]));

  // 4. Products, with archive and restore
  const P = 'catalogue.products';
  const pf = [
    field(P, 'code', 'Code', 'TEXT', { required: true }), field(P, 'name', 'Name', 'TEXT', { required: true }), field(P, 'display-name', 'Display name'),
    field(P, 'description', 'Description', 'TEXTAREA'), field(P, 'product-type', 'Type', 'SELECT', { required: true, ref: 'product-types' }),
    field(P, 'status', 'Status', 'SELECT', { ref: 'product-statuses', help: 'A new product starts as Draft. Use Archive to retire it.' }),
    field(P, 'base-uom-id', 'Base unit', 'REFERENCE', { required: true, ref: 'uom-ref' }), field(P, 'category-id', 'Category', 'REFERENCE', { ref: 'category-ref' }),
    field(P, 'is-sold', 'Sold', 'BOOLEAN'), field(P, 'is-purchased', 'Purchased', 'BOOLEAN'), field(P, 'is-stocked', 'Stocked', 'BOOLEAN'),
    field(P, 'data-classification', 'Data classification', 'SELECT', { ref: 'classifications' }),
    field(P, 'updated-at', 'Last changed', 'DATETIME', { readOnly: true }),
  ];
  windows['catalogue-products'] = window('catalogue-products', 'Products', 'Products', 'Products, services and resources other modules use by reference.', 'products:read',
    dictionary('catalogue-products', 'Products', P, [entity(P, 'Products')], pf, [],
      [values('product-types', PRODUCT_TYPES), values('product-statuses', PRODUCT_STATUSES), values('classifications', CLASSIFICATIONS), UOM_REF, CATEGORY_REF], [
        view('products', 'Products', [
          tab('product', 'Product', 0, P, [
            ['code', 3, 'main'], ['name', 6, 'main'], ['status', 3, 'main'], ['product-type', 3, 'main'], ['base-uom-id', 3, 'main'], ['category-id', 6, 'main'],
            ['display-name', 6, 'details'], ['data-classification', 6, 'details'], ['description', 12, 'details'], ['is-sold', 4, 'use'],
            ['is-purchased', 4, 'use'], ['is-stocked', 4, 'use'], ['updated-at', 6, 'details'],
          ], pf, { sections: [section('main', 'Product', 0), section('use', 'Used for', 1), section('details', 'Details', 2)] }),
        ], { search: ['code', 'name'], sort: 'name' }),
      ], [
        act(P, 'archive', 'Archive', 'products:archive', ['status', 'NEQ', 'ARCHIVED'], 'Archive this product? It can no longer be picked on new documents.'),
        act(P, 'restore', 'Restore', 'products:archive', ['status', 'EQ', 'ARCHIVED'], 'Restore this product as a draft?'),
      ]));

  // 5. Catalogues with their versions
  const K = 'catalogue.catalogues';
  const KV = 'catalogue.catalogue-versions';
  const kf = [
    field(K, 'code', 'Code', 'TEXT', { required: true }), field(K, 'name', 'Name', 'TEXT', { required: true }), field(K, 'description', 'Description', 'TEXTAREA'),
    field(K, 'purpose', 'Purpose'), field(K, 'audience', 'Audience'), field(K, 'is-active', 'Active', 'BOOLEAN', { readOnly: true }),
    field(KV, 'catalogue-id', 'Catalogue', 'REFERENCE', { ref: 'catalogue-ref' }), field(KV, 'version-number', 'Version', 'INTEGER', { readOnly: true }),
    field(KV, 'status', 'Status', 'SELECT', { readOnly: true, ref: 'catalogue-statuses' }), field(KV, 'effective-from', 'Effective from', 'DATE'),
    field(KV, 'effective-to', 'Effective to', 'DATE'), field(KV, 'notes', 'Notes', 'TEXTAREA'),
  ];
  windows['catalogue-catalogues'] = window('catalogue-catalogues', 'Catalogues', 'Catalogues', 'Catalogues and their versions.', 'catalogues:read',
    dictionary('catalogue-catalogues', 'Catalogues', K, [entity(K, 'Catalogues'), entity(KV, 'Versions')], kf,
      [relationship('catalogue-versions', K, KV, 'catalogue-id')], [values('catalogue-statuses', CATALOGUE_STATUSES), CATALOGUE_REF], [
        view('catalogues', 'Catalogues', [
          tab('catalogue', 'Catalogue', 0, K, [['code', 3], ['name', 6], ['is-active', 3], ['purpose', 6], ['audience', 6], ['description', 12]], kf),
          tab('versions', 'Versions', 1, KV, [['version-number', 2], ['status', 3], ['effective-from', 3], ['effective-to', 3], ['notes', 12]], kf,
            { parent: 'catalogue-versions' }),
        ], { search: ['code', 'name'], sort: 'name' }),
      ]));

  // 6. Catalogue versions with their entries; submit, approve (a second person) and publish
  const KE = 'catalogue.catalogue-entries';
  const vf = [
    field(KV, 'catalogue-id', 'Catalogue', 'REFERENCE', { required: true, ref: 'catalogue-ref' }), field(KV, 'version-number', 'Version', 'INTEGER', { readOnly: true }),
    field(KV, 'status', 'Status', 'SELECT', { readOnly: true, ref: 'catalogue-statuses' }), field(KV, 'effective-from', 'Effective from', 'DATE'),
    field(KV, 'effective-to', 'Effective to', 'DATE'), field(KV, 'notes', 'Notes', 'TEXTAREA'),
    field(KV, 'submitted-by', 'Submitted by', 'TEXT', { readOnly: true }), field(KV, 'approved-by', 'Approved by', 'TEXT', { readOnly: true }),
    field(KV, 'published-by', 'Published by', 'TEXT', { readOnly: true }), field(KV, 'checksum', 'Checksum', 'TEXT', { readOnly: true }),
    field(KE, 'catalogue-version-id', 'Version', 'TEXT', { help: 'Set from the version the entry belongs to.' }),
    field(KE, 'product-id', 'Product', 'REFERENCE', { required: true, ref: 'product-ref' }),
    field(KE, 'sort-order', 'Sort order', 'INTEGER'), field(KE, 'is-highlighted', 'Highlighted', 'BOOLEAN'),
  ];
  windows['catalogue-catalogue-versions'] = window('catalogue-catalogue-versions', 'Catalogue versions', 'Catalogue versions',
    'Build a catalogue version, then submit, approve and publish it.', 'catalogues:read',
    dictionary('catalogue-catalogue-versions', 'Catalogue versions', KV, [entity(KV, 'Catalogue versions'), entity(KE, 'Entries')], vf,
      [relationship('version-entries', KV, KE, 'catalogue-version-id')], [values('catalogue-statuses', CATALOGUE_STATUSES), CATALOGUE_REF, PRODUCT_REF], [
        view('catalogue-versions', 'Catalogue versions', [
          tab('version', 'Version', 0, KV, [
            ['catalogue-id', 6, 'main'], ['version-number', 3, 'main'], ['status', 3, 'main'], ['effective-from', 4, 'main'], ['effective-to', 4, 'main'],
            ['notes', 12, 'main'], ['submitted-by', 4, 'approval'], ['approved-by', 4, 'approval'], ['published-by', 4, 'approval'], ['checksum', 12, 'approval'],
          ], vf, { sections: [section('main', 'Version', 0), section('approval', 'Approval', 1)] }),
          tab('entries', 'Entries', 1, KE, [['product-id', 6], ['sort-order', 3], ['is-highlighted', 3]], vf, { parent: 'version-entries' }),
        ], { search: ['notes'], sort: 'version-number' }),
      ], [
        act(KV, 'submit', 'Submit for approval', 'catalogues:submit', ['status', 'EQ', 'DRAFT'], 'Submit this version? It can no longer change, and someone else must approve it.'),
        act(KV, 'approve', 'Approve', 'catalogues:approve', ['status', 'EQ', 'SUBMITTED'], 'Approve this version? You cannot approve a version you submitted.'),
        act(KV, 'publish', 'Publish', 'catalogues:publish', ['status', 'EQ', 'APPROVED'], 'Publish this version? It becomes the catalogue in force from its effective date.'),
      ]));

  // 7. Price lists with their versions
  const L = 'catalogue.price-lists';
  const LV = 'catalogue.price-list-versions';
  const lf = [
    field(L, 'code', 'Code', 'TEXT', { required: true }), field(L, 'name', 'Name', 'TEXT', { required: true }), field(L, 'description', 'Description', 'TEXTAREA'),
    field(L, 'currency-code', 'Currency', 'TEXT', { required: true, help: 'Three-letter code, for example USD.' }),
    field(L, 'is-tax-included', 'Prices include tax', 'BOOLEAN'), field(L, 'enforce-price-limit', 'Enforce the limit price', 'BOOLEAN'),
    field(L, 'price-precision', 'Decimal places', 'INTEGER'), field(L, 'audience', 'Audience'), field(L, 'is-active', 'Active', 'BOOLEAN', { readOnly: true }),
    field(LV, 'price-list-id', 'Price list', 'REFERENCE', { ref: 'price-list-ref' }), field(LV, 'version-number', 'Version', 'INTEGER', { readOnly: true }),
    field(LV, 'status', 'Status', 'SELECT', { readOnly: true, ref: 'price-statuses' }), field(LV, 'effective-from', 'Effective from', 'DATE', { required: true }),
    field(LV, 'effective-to', 'Effective to', 'DATE'), field(LV, 'notes', 'Notes', 'TEXTAREA'),
  ];
  windows['catalogue-price-lists'] = window('catalogue-price-lists', 'Price lists', 'Price lists', 'Price lists and their versions.', 'pricing:read',
    dictionary('catalogue-price-lists', 'Price lists', L, [entity(L, 'Price lists'), entity(LV, 'Versions')], lf,
      [relationship('price-list-versions', L, LV, 'price-list-id')], [values('price-statuses', PRICE_STATUSES), PRICE_LIST_REF], [
        view('price-lists', 'Price lists', [
          tab('price-list', 'Price list', 0, L, [
            ['code', 3], ['name', 6], ['currency-code', 3], ['price-precision', 3], ['is-tax-included', 3], ['enforce-price-limit', 3], ['is-active', 3],
            ['audience', 6], ['description', 12],
          ], lf),
          tab('versions', 'Versions', 1, LV, [['version-number', 2], ['status', 3], ['effective-from', 3], ['effective-to', 3], ['notes', 12]], lf,
            { parent: 'price-list-versions' }),
        ], { search: ['code', 'name'], sort: 'name' }),
      ]));

  // 8. Price-list versions with their prices; submit, approve (a second person) and activate
  const PR = 'catalogue.prices';
  const qf = [
    field(LV, 'price-list-id', 'Price list', 'REFERENCE', { required: true, ref: 'price-list-ref' }), field(LV, 'version-number', 'Version', 'INTEGER', { readOnly: true }),
    field(LV, 'status', 'Status', 'SELECT', { readOnly: true, ref: 'price-statuses' }), field(LV, 'effective-from', 'Effective from', 'DATE', { required: true }),
    field(LV, 'effective-to', 'Effective to', 'DATE'), field(LV, 'notes', 'Notes', 'TEXTAREA'),
    field(LV, 'submitted-by', 'Submitted by', 'TEXT', { readOnly: true }), field(LV, 'approved-by', 'Approved by', 'TEXT', { readOnly: true }),
    field(LV, 'activated-by', 'Activated by', 'TEXT', { readOnly: true }), field(LV, 'checksum', 'Checksum', 'TEXT', { readOnly: true }),
    field(PR, 'price-list-version-id', 'Version', 'TEXT', { help: 'Set from the version the price belongs to.' }),
    field(PR, 'product-id', 'Product', 'REFERENCE', { required: true, ref: 'product-ref' }),
    field(PR, 'uom-id', 'Unit', 'REFERENCE', { required: true, ref: 'uom-ref' }), field(PR, 'min-quantity', 'From quantity', 'NUMBER', { scale: 6 }),
    field(PR, 'list-price-minor', 'List price (minor units)', 'NUMBER', { required: true, scale: 0, help: 'In minor units: 1250 is 12.50.' }),
    field(PR, 'standard-price-minor', 'Standard price (minor units)', 'NUMBER', { required: true, scale: 0 }),
    field(PR, 'limit-price-minor', 'Limit price (minor units)', 'NUMBER', { required: true, scale: 0, help: 'List ≥ standard ≥ limit.' }),
  ];
  windows['catalogue-price-list-versions'] = window('catalogue-price-list-versions', 'Price-list versions', 'Price-list versions',
    'Set prices in a version, then submit, approve and activate it.', 'pricing:read',
    dictionary('catalogue-price-list-versions', 'Price-list versions', LV, [entity(LV, 'Price-list versions'), entity(PR, 'Prices')], qf,
      [relationship('version-prices', LV, PR, 'price-list-version-id')], [values('price-statuses', PRICE_STATUSES), PRICE_LIST_REF, PRODUCT_REF, UOM_REF], [
        view('price-list-versions', 'Price-list versions', [
          tab('version', 'Version', 0, LV, [
            ['price-list-id', 6, 'main'], ['version-number', 3, 'main'], ['status', 3, 'main'], ['effective-from', 4, 'main'], ['effective-to', 4, 'main'],
            ['notes', 12, 'main'], ['submitted-by', 4, 'approval'], ['approved-by', 4, 'approval'], ['activated-by', 4, 'approval'], ['checksum', 12, 'approval'],
          ], qf, { sections: [section('main', 'Version', 0), section('approval', 'Approval', 1)] }),
          tab('prices', 'Prices', 1, PR, [
            ['product-id', 4], ['uom-id', 2], ['min-quantity', 2], ['list-price-minor', 4], ['standard-price-minor', 4], ['limit-price-minor', 4],
          ], qf, { parent: 'version-prices' }),
        ], { search: ['notes'], sort: 'version-number' }),
      ], [
        act(LV, 'submit', 'Submit for approval', 'pricing:submit', ['status', 'EQ', 'DRAFT'], 'Submit this version? Its prices can no longer change, and someone else must approve it.'),
        act(LV, 'approve', 'Approve', 'pricing:approve', ['status', 'EQ', 'SUBMITTED'], 'Approve this version? You cannot approve a version you submitted.'),
        act(LV, 'activate', 'Activate', 'pricing:activate', ['status', 'EQ', 'APPROVED'], 'Activate this version? Its prices resolve from its effective date.'),
      ]));

  return windows;
}
