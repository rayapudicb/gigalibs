import { describe, expect, it } from 'vitest';
import { MASTER_DATA_GROUP_LABELS, MASTER_DATA_GROUPS, MASTER_DATA_REGISTRY } from './index.js';

// WI-OI-152: the generated registry (scripts/module-manifests.mjs validates the manifests; this guards the output).
describe('master data registry', () => {
  it('lists each master once, in a known group with a label', () => {
    const keys = MASTER_DATA_REGISTRY.map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(MASTER_DATA_REGISTRY.length).toBeGreaterThan(0);
    for (const entry of MASTER_DATA_REGISTRY) {
      expect(MASTER_DATA_GROUPS).toContain(entry.group);
      expect(MASTER_DATA_GROUP_LABELS[entry.group]).toBeTruthy();
      expect(entry.label.trim()).not.toBe('');
      expect(entry.route.startsWith('/')).toBe(true);
      expect(entry.readPermission).toMatch(/^[a-z][a-z0-9-]*[:.]/);
    }
  });

  it('counts each master through a module gateway or a platform lookup', () => {
    for (const entry of MASTER_DATA_REGISTRY) {
      if (entry.count.kind === 'records') {
        expect(entry.count.basePath).toMatch(/^\/api\/[a-z-]+$/);
        expect(entry.count.entity).toMatch(/^[a-z-]+\.[a-z-]+$/);
      } else {
        expect(entry.count.basePath).toBe('/api/control');
        expect(['organization-units', 'workspace-members', 'workspace-sites']).toContain(entry.count.resolver);
      }
    }
  });

  it('keeps the groups in the area order', () => {
    const order = MASTER_DATA_REGISTRY.map((entry) => MASTER_DATA_GROUPS.indexOf(entry.group));
    expect(order).toEqual([...order].sort((left, right) => left - right));
  });
});
