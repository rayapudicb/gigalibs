import { describe, expect, it } from 'vitest';
import {
  DictionaryPanelPlacementV1Schema,
  DictionaryTabV1Schema,
  ModulePanelDefinitionV1Schema,
  modulePanelCatalogue,
} from '../index.js';

// WI-OI-120bs (SPEED S2b): the panel contracts. Placements and definitions are strict, and a tab without panels parses
// without a panels key, so windows that predate panels keep their checksums.

describe('panel contracts', () => {
  it('parses a placement with typed props and defaults its span; refuses malformed keys and prop values', () => {
    const placement = DictionaryPanelPlacementV1Schema.parse({
      panelKey: 'ob-gauge',
      componentKey: 'speed.ob-chart',
      position: 0,
      props: { metric: 'oxygen-balance', decimals: 1, compact: true },
    });
    expect(placement.span).toBe(12);
    expect(DictionaryPanelPlacementV1Schema.safeParse({ panelKey: 'x', componentKey: 'NoDot', position: 0 }).success).toBe(false);
    expect(DictionaryPanelPlacementV1Schema.safeParse({ panelKey: 'x', componentKey: 'speed.chart', position: 0, props: { nested: {} } }).success).toBe(false);
    expect(DictionaryPanelPlacementV1Schema.safeParse({ panelKey: 'x', componentKey: 'speed.chart', position: 0, extra: 1 }).success).toBe(false);
  });

  it('requires values for an ENUM prop and refuses them on any other type', () => {
    const definition = (props: Record<string, unknown>) =>
      ModulePanelDefinitionV1Schema.safeParse({ moduleKey: 'process-safety-screening', componentKey: 'speed.ob-chart', binding: 'RECORD', props });
    expect(definition({ metric: { type: 'ENUM', values: ['a'] } }).success).toBe(true);
    expect(definition({ metric: { type: 'ENUM' } }).success).toBe(false);
    expect(definition({ title: { type: 'STRING', values: ['a'] } }).success).toBe(false);
    expect(ModulePanelDefinitionV1Schema.safeParse({ moduleKey: 'm', componentKey: 'm.p', binding: 'LIST', props: {} }).success).toBe(false);
  });

  it('parses a tab without panels with no panels key at all', () => {
    const tab = DictionaryTabV1Schema.parse({ tabKey: 'route', label: 'Route', position: 0, targetEntityKey: 'demo.routes' });
    expect('panels' in tab).toBe(false);
  });

  it('parses the generated catalogue (empty until a module registers a panel)', () => {
    expect(modulePanelCatalogue()).toEqual([]);
  });
});
