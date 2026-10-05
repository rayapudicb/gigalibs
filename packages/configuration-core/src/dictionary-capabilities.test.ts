import { describe, expect, it } from 'vitest';
import { type DictionaryPackageDefinitionV1, compileDictionaryPackage } from './dictionary-compiler.js';
import { compareExactDecimals, evaluateDictionaryCondition, validateDictionaryRules } from './dictionary-evaluator.js';

// WI-OI-120f (F0.1): a package publishes only what the metadata window executes, everything it names must exist, and
// rules fail closed with exact decimal comparison.
const field = (fieldKey: string, entityKey: string, extra: Record<string, unknown> = {}) => ({
  fieldKey,
  entityKey,
  label: fieldKey,
  type: 'TEXT',
  required: false,
  readOnly: false,
  isSystemLocked: false,
  classification: 'INTERNAL',
  maskOnDisplay: false,
  ...extra,
});

function windowPackage(overrides: Partial<Record<keyof DictionaryPackageDefinitionV1, unknown>> = {}): DictionaryPackageDefinitionV1 {
  return {
    packageKey: 'inventory-baseline',
    name: 'Inventory',
    version: '1.0.0',
    moduleKey: 'universal-inventory',
    targetEntityKey: 'inventory.warehouses',
    entities: [
      { entityKey: 'inventory.warehouses', moduleKey: 'universal-inventory', label: 'Warehouses', ownership: 'MODULE_CORE', primaryKeyField: 'id', isVersioned: true, isAuditLogged: true, isSoftDeletable: false },
      { entityKey: 'inventory.locations', moduleKey: 'universal-inventory', label: 'Locations', ownership: 'MODULE_CORE', primaryKeyField: 'id', isVersioned: true, isAuditLogged: true, isSoftDeletable: false },
    ],
    fields: [
      field('code', 'inventory.warehouses'),
      field('name', 'inventory.warehouses'),
      field('capacity', 'inventory.warehouses', { type: 'NUMBER', scale: 3 }),
      field('location-code', 'inventory.locations'),
      field('warehouse-id', 'inventory.locations'),
    ],
    relationships: [
      { relationshipKey: 'warehouse-locations', sourceEntityKey: 'inventory.warehouses', targetEntityKey: 'inventory.locations', type: 'ONE_TO_MANY', foreignKeyField: 'warehouse-id' },
    ],
    references: [],
    validationRules: [],
    views: [
      {
        viewKey: 'warehouses',
        label: 'Warehouses',
        mode: 'LIST',
        device: 'ALL',
        searchFields: ['code', 'name'],
        defaultSortField: 'code',
        defaultSortDirection: 'ASC',
        tabs: [
          {
            tabKey: 'warehouse',
            label: 'Warehouse',
            position: 0,
            level: 0,
            targetEntityKey: 'inventory.warehouses',
            sections: [{ sectionKey: 'main', label: 'Main', collapsible: false, defaultCollapsed: false, position: 0 }],
            fields: [
              { fieldKey: 'code', sectionKey: 'main', position: 0, span: 6, componentKey: 'text-input' },
              {
                fieldKey: 'capacity',
                sectionKey: 'main',
                position: 1,
                span: 6,
                componentKey: 'number-input',
                readOnlyCondition: { field: 'code', operator: 'IS_NULL' },
              },
            ],
          },
          {
            tabKey: 'locations',
            label: 'Locations',
            position: 1,
            level: 1,
            targetEntityKey: 'inventory.locations',
            parentRelationshipKey: 'warehouse-locations',
            sections: [],
            fields: [{ fieldKey: 'location-code', position: 0, span: 12, componentKey: 'text-input' }],
          },
        ],
      },
    ],
    navigation: [],
    actions: [
      { actionKey: 'archive', label: 'Archive', type: 'COMMAND', handlerKey: 'inventory.warehouse.archive', requiredPermissions: ['inventory:write'] },
    ],
    messages: [],
    ...overrides,
  } as DictionaryPackageDefinitionV1;
}

const codes = (input: unknown) => compileDictionaryPackage(input).findings.map((finding) => finding.code);

describe('dictionary capabilities at publish time', () => {
  it('publishes a window with a list view, a child tab, an exact decimal and a command', () => {
    const result = compileDictionaryPackage(windowPackage());
    expect(result.findings).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.manifest?.fields.find((f) => f.fieldKey === 'capacity')?.scale).toBe(3);
  });

  it('gives a CURRENCY field two decimal places when none is set, and refuses a scale on text', () => {
    const currency = windowPackage({ fields: [...windowPackage().fields, field('price', 'inventory.warehouses', { type: 'CURRENCY' })] });
    expect(compileDictionaryPackage(currency).manifest?.fields.find((f) => f.fieldKey === 'price')?.scale).toBe(2);
    expect(codes(windowPackage({ fields: [field('code', 'inventory.warehouses', { scale: 2 }), ...windowPackage().fields.slice(1)] }))).toContain(
      'SCALE_NOT_ALLOWED',
    );
  });

  it('refuses what the window does not execute instead of ignoring it', () => {
    expect(codes(windowPackage({ fields: [...windowPackage().fields, field('parts', 'inventory.warehouses', { type: 'COMPOSITE' })] }))).toContain(
      'UNSUPPORTED_FIELD_TYPE',
    );
    expect(
      codes(windowPackage({ actions: [{ actionKey: 'report', label: 'Report', type: 'REPORT', handlerKey: 'x', requiredPermissions: [] }] })),
    ).toContain('UNSUPPORTED_ACTION_TYPE');
    const pkg = windowPackage();
    pkg.views[0]!.tabs[0]!.fields[0]!.componentKey = 'signature-pad';
    expect(codes(pkg)).toContain('UNSUPPORTED_COMPONENT');
  });

  it('refuses a lookup without a resolver, and a SELECT without a value list', () => {
    expect(
      codes(windowPackage({ references: [{ referenceKey: 'warehouse-lookup', referenceType: 'TABLE_DIR', targetEntityKey: 'inventory.warehouses' }] })),
    ).toContain('RESOLVER_REQUIRED');
    expect(codes(windowPackage({ fields: [...windowPackage().fields, field('kind', 'inventory.warehouses', { type: 'SELECT' })] }))).toContain(
      'REFERENCE_REQUIRED',
    );
  });

  it('refuses tabs, placements and view fields that point at nothing', () => {
    const wrongEntity = windowPackage();
    wrongEntity.views[0]!.tabs[0]!.fields.push({ fieldKey: 'location-code', position: 9, span: 12, componentKey: 'text-input' });
    expect(codes(wrongEntity)).toContain('FIELD_NOT_ON_TAB_ENTITY');

    const noRelationship = windowPackage();
    delete noRelationship.views[0]!.tabs[1]!.parentRelationshipKey;
    expect(codes(noRelationship)).toContain('CHILD_TAB_RELATIONSHIP_REQUIRED');

    const badSort = windowPackage();
    badSort.views[0]!.defaultSortField = 'location-code';
    expect(codes(badSort)).toContain('VIEW_FIELD_NOT_ON_ENTITY');

    const badSection = windowPackage();
    badSection.views[0]!.tabs[0]!.fields[0]!.sectionKey = 'missing';
    expect(codes(badSection)).toContain('MISSING_SECTION');
  });

  it('refuses incomplete or malformed rule expressions', () => {
    const rule = (condition: unknown) =>
      codes(windowPackage({ validationRules: [{ ruleKey: 'rule-one', label: 'R', errorMessage: 'E', severity: 'ERROR', condition }] }));
    expect(rule({ field: 'code' })).toContain('EXPRESSION_INCOMPLETE');
    expect(rule({ field: 'nope', operator: 'IS_NULL' })).toContain('EXPRESSION_UNKNOWN_FIELD');
    expect(rule({ field: 'code', operator: 'EQ' })).toContain('EXPRESSION_VALUE_REQUIRED');
    expect(rule({ field: 'code', operator: 'IN', value: 'A' })).toContain('EXPRESSION_LIST_REQUIRED');
    expect(rule({ field: 'code', operator: 'MATCHES_REGEX', value: '([a-' })).toContain('EXPRESSION_REGEX_INVALID');
    expect(rule({ all: [] })).toContain('EXPRESSION_EMPTY_GROUP');
  });
});

describe('dictionary rules at run time', () => {
  it('fails closed on an incomplete comparison or an empty group', () => {
    expect(evaluateDictionaryCondition({ field: 'code' }, { code: 'A' })).toBe(false);
    expect(evaluateDictionaryCondition({ all: [] }, {})).toBe(false);
    expect(evaluateDictionaryCondition({ any: [] }, {})).toBe(false);
    expect(evaluateDictionaryCondition({ field: 'code', operator: 'UNKNOWN' as never, value: 1 }, { code: 1 })).toBe(false);
    expect(validateDictionaryRules([{ ruleKey: 'r', label: 'R', errorMessage: 'Broken rule', severity: 'ERROR', condition: {} }], {})).toEqual({
      r: 'Broken rule',
    });
  });

  it('compares exact decimals given as strings or numbers, without binary rounding', () => {
    expect(compareExactDecimals('0.30', 0.3)).toBe(0);
    expect(compareExactDecimals('10.005', '10.0049999999')).toBe(1);
    expect(compareExactDecimals('-1.5', '1')).toBe(-1);
    expect(compareExactDecimals('1e3', '1000')).toBeNull();
    expect(evaluateDictionaryCondition({ field: 'qty', operator: 'GTE', value: '2.500' }, { qty: '2.5' })).toBe(true);
    expect(evaluateDictionaryCondition({ field: 'qty', operator: 'GT', value: '0.1' }, { qty: '0.10000000001' })).toBe(true);
    expect(evaluateDictionaryCondition({ field: 'qty', operator: 'EQ', value: '12.50' }, { qty: '12.5' })).toBe(true);
    expect(evaluateDictionaryCondition({ field: 'qty', operator: 'LT', value: 5 }, { qty: 'five' })).toBe(false);
  });
});

// WI-OI-120f (F0.2): every window a module ships (modules/*/dictionary/*.window.json) publishes cleanly.
describe('shipped module windows', () => {
  it('compile with no findings under the publish-time capability checks', async () => {
    const { moduleWindowBaselines } = await import('@gigalibs/contracts');
    for (const baseline of moduleWindowBaselines()) {
      const result = compileDictionaryPackage(baseline.definition.dictionary, { moduleBaseline: true });
      expect({ surface: baseline.definition.surfaceKey, findings: result.findings }).toEqual({
        surface: baseline.definition.surfaceKey,
        findings: [],
      });
    }
  });
});
