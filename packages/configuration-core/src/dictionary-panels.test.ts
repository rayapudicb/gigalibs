import type { ModulePanelDefinitionV1 } from '@gigalibs/contracts';
import { describe, expect, it } from 'vitest';
import { canonicalJson } from './index.js';
import { type DictionaryPackageDefinitionV1, compileDictionaryPackage } from './dictionary-compiler.js';

// WI-OI-120bs (SPEED S2b): a window may place a panel only if its own module registered it, with exactly the declared,
// correctly typed props. Without a catalogue every panel is refused; a window without panels compiles as before.

const field = (fieldKey: string, entityKey: string) => ({
  fieldKey,
  entityKey,
  label: fieldKey,
  type: 'TEXT',
  required: false,
  readOnly: false,
  isSystemLocked: false,
  classification: 'INTERNAL',
  maskOnDisplay: false,
});

const CATALOGUE: readonly ModulePanelDefinitionV1[] = [
  {
    moduleKey: 'demo-module',
    componentKey: 'demo.gauge',
    binding: 'RECORD',
    props: {
      metric: { type: 'ENUM', required: true, values: ['oxygen-balance', 'adiabatic-rise'] },
      title: { type: 'STRING', required: false },
      decimals: { type: 'NUMBER', required: false },
      compact: { type: 'BOOLEAN', required: false },
    },
  },
  { moduleKey: 'other-module', componentKey: 'other.chart', binding: 'RECORD', props: {} },
];

type Tab = Record<string, unknown>;

function demoPackage(tabs: Tab[]): DictionaryPackageDefinitionV1 {
  return {
    packageKey: 'demo-routes',
    name: 'Demo',
    version: '1.0.0',
    moduleKey: 'demo-module',
    targetEntityKey: 'demo.routes',
    entities: [
      { entityKey: 'demo.routes', moduleKey: 'demo-module', label: 'Routes', ownership: 'MODULE_CORE', primaryKeyField: 'id', isVersioned: true, isAuditLogged: true },
      { entityKey: 'demo.steps', moduleKey: 'demo-module', label: 'Steps', ownership: 'MODULE_CORE', primaryKeyField: 'id', isVersioned: true, isAuditLogged: true },
    ],
    fields: [field('name', 'demo.routes'), field('status', 'demo.routes'), field('route-id', 'demo.steps')],
    relationships: [
      { relationshipKey: 'route-steps', sourceEntityKey: 'demo.routes', targetEntityKey: 'demo.steps', type: 'ONE_TO_MANY', foreignKeyField: 'route-id' },
    ],
    references: [],
    validationRules: [],
    views: [{ viewKey: 'routes', label: 'Routes', mode: 'LIST', device: 'ALL', tabs }],
    navigation: [],
    actions: [],
    messages: [],
  } as unknown as DictionaryPackageDefinitionV1;
}

const mainTab = (panels?: Tab[]): Tab => ({
  tabKey: 'route',
  label: 'Route',
  position: 0,
  level: 0,
  targetEntityKey: 'demo.routes',
  sections: [{ sectionKey: 'main', label: 'Main', position: 0 }],
  fields: [{ fieldKey: 'name', sectionKey: 'main', position: 0 }],
  ...(panels ? { panels } : {}),
});

const gauge = (extra: Record<string, unknown> = {}): Tab => ({
  panelKey: 'ob-gauge',
  componentKey: 'demo.gauge',
  sectionKey: 'main',
  position: 1,
  span: 6,
  props: { metric: 'oxygen-balance', title: 'Oxygen balance', decimals: 1, compact: true },
  ...extra,
});

const codes = (tabs: Tab[]) => compileDictionaryPackage(demoPackage(tabs), { panelCatalogue: CATALOGUE }).findings.map((f) => f.code);

describe('metadata panels at publish (WI-OI-120bs)', () => {
  it('publishes a registered panel with typed props, and keeps it in the compiled manifest', () => {
    const result = compileDictionaryPackage(demoPackage([mainTab([gauge()])]), { panelCatalogue: CATALOGUE });
    expect(result.findings).toEqual([]);
    expect(result.manifest?.views[0]?.tabs[0]?.panels).toEqual([gauge()]);
  });

  it('refuses every panel when no catalogue is given (fail closed)', () => {
    expect(compileDictionaryPackage(demoPackage([mainTab([gauge()])])).findings.map((f) => f.code)).toEqual(['PANEL_NOT_REGISTERED']);
  });

  it("refuses an unregistered panel and another module's panel", () => {
    expect(codes([mainTab([gauge({ componentKey: 'demo.missing' })])])).toEqual(['PANEL_NOT_REGISTERED']);
    expect(codes([mainTab([gauge({ componentKey: 'other.chart', props: {} })])])).toEqual(['PANEL_NOT_OWNED']);
  });

  it('refuses unknown, mistyped and missing props', () => {
    expect(codes([mainTab([gauge({ props: { metric: 'oxygen-balance', colour: 'red' } })])])).toEqual(['PANEL_PROP_UNKNOWN']);
    expect(codes([mainTab([gauge({ props: { metric: 'heat' } })])])).toEqual(['PANEL_PROP_TYPE']);
    expect(codes([mainTab([gauge({ props: { metric: 'oxygen-balance', decimals: '1' } })])])).toEqual(['PANEL_PROP_TYPE']);
    expect(codes([mainTab([gauge({ props: { metric: 'oxygen-balance', compact: 'yes' } })])])).toEqual(['PANEL_PROP_TYPE']);
    expect(codes([mainTab([gauge({ props: { metric: 'oxygen-balance', title: 3 } })])])).toEqual(['PANEL_PROP_TYPE']);
    expect(codes([mainTab([gauge({ props: {} })])])).toEqual(['PANEL_PROP_REQUIRED']);
  });

  it('refuses a missing section, a bad permission, an unknown condition field and a duplicate panel key', () => {
    expect(codes([mainTab([gauge({ sectionKey: 'nowhere' })])])).toEqual(['MISSING_SECTION']);
    expect(codes([mainTab([gauge({ readPermission: 'not a code' })])])).toEqual(['PERMISSION_INVALID']);
    expect(codes([mainTab([gauge({ visibilityCondition: { field: 'unknown', operator: 'IS_NULL' } })])])).toContain('EXPRESSION_UNKNOWN_FIELD');
    expect(codes([mainTab([gauge(), gauge({ position: 2 })])])).toEqual(['PANEL_KEY_DUPLICATE']);
    expect(codes([mainTab([gauge({ readPermission: 'demo.routes.read', visibilityCondition: { field: 'status', operator: 'IS_NOT_NULL' } })])])).toEqual([]);
  });

  it('refuses panels on child tabs', () => {
    const child: Tab = {
      tabKey: 'steps',
      label: 'Steps',
      position: 1,
      level: 1,
      targetEntityKey: 'demo.steps',
      parentRelationshipKey: 'route-steps',
      fields: [{ fieldKey: 'route-id', position: 0 }],
      panels: [gauge({ sectionKey: undefined })],
    };
    expect(codes([mainTab(), child])).toEqual(['PANEL_ON_CHILD_TAB_NOT_SUPPORTED']);
  });

  it('allows a further level-0 tab on the same record holding panels only', () => {
    const panelTab = (extra: Tab = {}): Tab => ({
      tabKey: 'thermal',
      label: 'Thermal',
      position: 1,
      level: 0,
      targetEntityKey: 'demo.routes',
      panels: [gauge({ sectionKey: undefined, panelKey: 'thermal-gauge', props: { metric: 'adiabatic-rise' } })],
      ...extra,
    });
    expect(codes([mainTab(), panelTab()])).toEqual([]);
    expect(codes([mainTab(), panelTab({ targetEntityKey: 'demo.steps' })])).toEqual(['RECORD_TAB_ENTITY_MISMATCH']);
    expect(codes([mainTab(), panelTab({ fields: [{ fieldKey: 'status', position: 0 }] })])).toEqual(['RECORD_TAB_FIELDS_NOT_SUPPORTED']);
    expect(codes([mainTab(), panelTab({ panels: [] })])).toEqual(['RECORD_TAB_EMPTY']);
  });

  it('compiles a window without panels exactly as before: no panels key, same checksum with or without a catalogue', () => {
    const plain = compileDictionaryPackage(demoPackage([mainTab()]));
    const withCatalogue = compileDictionaryPackage(demoPackage([mainTab()]), { panelCatalogue: CATALOGUE });
    expect(plain.manifest?.checksum).toBe(withCatalogue.manifest?.checksum);
    expect(canonicalJson(plain.manifest?.views)).not.toContain('"panels"');
  });

  it('leaves every window a module ships unchanged: no panels key in any compiled view', async () => {
    const { moduleWindowBaselines, modulePanelCatalogue } = await import('@gigalibs/contracts');
    for (const baseline of moduleWindowBaselines()) {
      const result = compileDictionaryPackage(baseline.definition.dictionary, { moduleBaseline: true, panelCatalogue: modulePanelCatalogue() });
      expect(result.findings).toEqual([]);
      expect(canonicalJson(result.manifest?.views)).not.toContain('"panels"');
    }
  });
});
