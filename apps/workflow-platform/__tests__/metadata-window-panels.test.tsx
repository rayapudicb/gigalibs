import type { CompiledDictionaryManifestV1 } from '@gigalibs/contracts';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  MetadataPanel,
  MetadataPanels,
  type MetadataPanelProps,
  type MetadataPanelRegistry,
  metadataWindowModel,
} from '@gigalibs/configuration-react';

const { placedPanels, windowModel } = metadataWindowModel;

// WI-OI-120bs (SPEED S2b): metadata decides where a panel appears and who sees it; the registry the page supplies
// decides what it draws; a panel the page does not provide is shown as unavailable.

const panel = (panelKey: string, position: number, extra: Record<string, unknown> = {}) => ({
  panelKey,
  componentKey: 'demo.gauge',
  position,
  span: 6,
  props: { metric: panelKey },
  ...extra,
});

const manifest = {
  manifestVersion: 1,
  packageKey: 'demo-routes',
  checksum: `sha256:${'0'.repeat(64)}`,
  compiledAt: '2026-10-20T00:00:00.000Z',
  entities: [],
  fields: [],
  relationships: [],
  references: [],
  validationRules: [],
  navigation: [],
  actions: [],
  messages: [],
  views: [
    {
      viewKey: 'routes',
      label: 'Routes',
      mode: 'LIST',
      device: 'ALL',
      defaultSortDirection: 'ASC',
      tabs: [
        { tabKey: 'thermal', label: 'Thermal', position: 2, level: 0, targetEntityKey: 'demo.routes', sections: [], fields: [], panels: [panel('tmr', 0)] },
        { tabKey: 'route', label: 'Route', position: 0, level: 0, targetEntityKey: 'demo.routes', sections: [], fields: [], panels: [panel('gate', 1)] },
        { tabKey: 'steps', label: 'Steps', position: 1, level: 1, targetEntityKey: 'demo.steps', parentRelationshipKey: 'route-steps', sections: [], fields: [] },
        { tabKey: 'ob', label: 'Oxygen balance', position: 3, level: 0, targetEntityKey: 'demo.routes', sections: [], fields: [], panels: [panel('ob', 0)] },
      ],
    },
  ],
} as unknown as CompiledDictionaryManifestV1;

function Gauge({ record, props }: MetadataPanelProps) {
  return <output>{`${String(props.metric)} for ${String(record.name)}`}</output>;
}
const registry: MetadataPanelRegistry = { 'demo.gauge': Gauge };
const client = {} as never;

describe('metadata panels in the window (WI-OI-120bs)', () => {
  it('draws one record over its main tab and its further level-0 tabs, in position order; child tabs stay child tabs', () => {
    const model = windowModel(manifest);
    expect(model?.recordTabs.map((tab) => tab.tabKey)).toEqual(['route', 'thermal', 'ob']);
    expect(model?.childTabs.map((tab) => tab.tabKey)).toEqual(['steps']);
  });

  it('shows a panel only to holders of its read permission and while its condition holds, in position order', () => {
    const tab = {
      tabKey: 't',
      label: 'T',
      position: 0,
      level: 0,
      targetEntityKey: 'demo.routes',
      sections: [],
      fields: [],
      panels: [
        panel('late', 5),
        panel('guarded', 1, { readPermission: 'speed.engines.run' }),
        panel('conditional', 2, { visibilityCondition: { field: 'status', operator: 'EQ', value: 'Draft' } }),
        panel('early', 0),
      ],
    } as never;
    const keys = (permissions: string[], values: Record<string, unknown>) =>
      placedPanels(tab, values, permissions).map((placed) => placed.placement.panelKey);
    expect(keys([], { status: 'Approved' })).toEqual(['early', 'late']);
    expect(keys(['speed.engines.run'], { status: 'Draft' })).toEqual(['early', 'guarded', 'conditional', 'late']);
  });

  it('renders a registered panel with the record and its props', () => {
    const html = renderToStaticMarkup(
      <MetadataPanel panel={{ placement: panel('ob', 0) as never }} registry={registry} record={{ name: 'Route A' }} client={client} permissions={[]} />,
    );
    expect(html).toContain('data-panel="ob"');
    expect(html).toContain('ob for Route A');
  });

  it('shows a panel the page does not provide as unavailable, naming it', () => {
    const html = renderToStaticMarkup(
      <MetadataPanel panel={{ placement: panel('ob', 0, { componentKey: 'demo.missing' }) as never }} registry={registry} record={{}} client={client} permissions={[]} />,
    );
    expect(html).toContain('data-panel-unavailable="demo.missing"');
    expect(html).toContain('This panel is not available');
  });

  it('lays out a panel-only tab on a 12-column grid with each panel’s span, and says so when nothing is visible', () => {
    const html = renderToStaticMarkup(
      <MetadataPanels
        panels={[{ placement: panel('a', 0) as never }, { placement: panel('b', 1, { span: 12 }) as never }]}
        registry={registry}
        record={{ name: 'R' }}
        client={client}
        permissions={[]}
      />,
    );
    expect(html.indexOf('a for R')).toBeLessThan(html.indexOf('b for R'));
    expect(html).toContain('grid-column:span 6 / span 6');
    expect(html).toContain('grid-column:span 12 / span 12');
    expect(renderToStaticMarkup(<MetadataPanels panels={[]} registry={registry} record={{}} client={client} permissions={[]} />)).toContain('Nothing to show here.');
  });
});
