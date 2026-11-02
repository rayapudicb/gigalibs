/**
 * WI-OI-145 (owner, 2026-11-02): the horizontal screen tabs under the top bar come from the module's manifest menu for
 * every module, filtered by permission; a one-screen module shows one tab with its name; shell pages show their own.
 */
import { describe, expect, it } from 'vitest';
import { moduleTabsFor } from '../lib/module-tabs';

const everything = ['*'];

describe('module tab bar', () => {
  it('lists a module\'s screens and marks the open one', () => {
    const tabs = moduleTabsFor('/products/units', everything);
    expect(tabs.map((tab) => tab.label)).toEqual([
      'Products', 'Units', 'Categories', 'Attributes', 'Catalogues', 'Catalogue versions', 'Price lists',
      'Price-list versions', 'Price resolver', 'Import & export',
    ]);
    expect(tabs.filter((tab) => tab.active).map((tab) => tab.href)).toEqual(['/products/units']);
  });

  it('marks the first screen on the module route and a screen on its detail routes', () => {
    expect(moduleTabsFor('/inventory', everything).find((tab) => tab.active)?.label).toBe('Warehouses');
    expect(moduleTabsFor('/cmms/work-orders/123', everything).find((tab) => tab.active)?.label).toBe('Work orders');
  });

  it('leaves out screens the person may not open', () => {
    const labels = moduleTabsFor('/finance', ['finance:read']).map((tab) => tab.label);
    expect(labels).toContain('Journal entries');
    expect(labels).not.toContain('Set up a book');
  });

  it('gives a one-screen module and a shell page one tab', () => {
    expect(moduleTabsFor('/business-partners', everything)).toEqual([
      { label: 'Business partners', href: '/business-partners', active: true },
    ]);
    expect(moduleTabsFor('/modules', everything)).toEqual([{ label: 'Home', href: '/modules', active: true }]);
  });
});
