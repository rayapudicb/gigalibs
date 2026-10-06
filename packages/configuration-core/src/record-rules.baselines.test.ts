import { moduleWindowBaselines } from '@gigalibs/contracts';
import { describe, expect, it } from 'vitest';
import { entityRules } from './record-rules.js';

// WI-OI-120r (S1): each module's windows give every field one set of rules, so its record dispatcher can enforce them.
describe('module window rules', () => {
  const byModule = new Map<string, ReturnType<typeof moduleWindowBaselines>[number][]>();
  for (const baseline of moduleWindowBaselines()) {
    const moduleKey = baseline.definition.moduleKey;
    byModule.set(moduleKey, [...(byModule.get(moduleKey) ?? []), baseline]);
  }

  it.each([...byModule.keys()])('%s has no conflicting field rules', (moduleKey) => {
    const { rules, conflicts } = entityRules(byModule.get(moduleKey)!.map((baseline) => baseline.definition.dictionary));
    expect(conflicts).toEqual([]);
    expect(rules.size).toBeGreaterThan(0);
  });
});
