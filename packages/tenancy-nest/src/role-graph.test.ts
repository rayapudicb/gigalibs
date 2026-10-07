import { describe, expect, it } from 'vitest';
import { assertInclusionsValid, expandRole, rolesIncluding, type RoleGraph, withRole } from './role-graph.js';

// WI-OI-120w (R2 slice 2c, ADR-0034 §2): a role grants its own permissions and those of the roles it includes; the graph
// stays acyclic, at most five deep and ten wide.
const graph = (own: Record<string, string[]>, includes: Record<string, string[]> = {}): RoleGraph => ({
  own: new Map(Object.entries(own)),
  includes: new Map(Object.entries(includes)),
  names: new Map(Object.keys(own).map((id) => [id, `Role ${id}`])),
});
const code = (error: unknown) => (error as { getResponse: () => { code: string } }).getResponse().code;
const refusal = (run: () => void) => {
  try {
    run();
    return 'OK';
  } catch (error) {
    return code(error);
  }
};

describe('role graph', () => {
  const roles = graph(
    { lead: [], planner: ['cmms.work-orders.write'], supervisor: ['workforce.timesheets.approve'], reader: ['cmms:read'] },
    { lead: ['planner', 'supervisor'], planner: ['reader'] },
  );

  it('grants what a role includes, transitively', () => {
    expect(expandRole(roles, 'lead').sort()).toEqual(['cmms.work-orders.write', 'cmms:read', 'workforce.timesheets.approve'].sort());
    expect(expandRole(roles, 'planner').sort()).toEqual(['cmms.work-orders.write', 'cmms:read'].sort());
    expect(expandRole(roles, 'reader')).toEqual(['cmms:read']);
  });

  it('finds every role that includes one, through others too', () => {
    expect(rolesIncluding(roles, 'reader').sort()).toEqual(['lead', 'planner']);
    expect(rolesIncluding(roles, 'lead')).toEqual([]);
  });

  it('refuses a cycle, itself, a role of another workspace, too many and too deep', () => {
    expect(refusal(() => assertInclusionsValid(withRole(roles, 'reader', { includes: ['lead'] }), 'reader'))).toBe('ROLE_INCLUSION_CYCLE');
    expect(refusal(() => assertInclusionsValid(withRole(roles, 'reader', { includes: ['reader'] }), 'reader'))).toBe('ROLE_INCLUSION_SELF');
    expect(refusal(() => assertInclusionsValid(withRole(roles, 'reader', { includes: ['elsewhere'] }), 'reader'))).toBe('ROLE_INCLUSION_UNKNOWN');
    const many = graph(Object.fromEntries(Array.from({ length: 12 }, (_, index) => [`r${index}`, []])));
    expect(refusal(() => assertInclusionsValid(withRole(many, 'r0', { includes: Array.from({ length: 11 }, (_, index) => `r${index + 1}`) }), 'r0'))).toBe(
      'ROLE_INCLUSION_LIMIT',
    );
    // A chain of six inclusions is one too deep, checked from the deepest root that includes the edited role.
    const chain = graph(
      Object.fromEntries(Array.from({ length: 7 }, (_, index) => [`c${index}`, [`x.code-${index}:read`]])),
      Object.fromEntries(Array.from({ length: 5 }, (_, index) => [`c${index}`, [`c${index + 1}`]])),
    );
    expect(refusal(() => assertInclusionsValid(chain, 'c4'))).toBe('OK');
    expect(refusal(() => assertInclusionsValid(withRole(chain, 'c5', { includes: ['c6'] }), 'c5'))).toBe('ROLE_INCLUSION_TOO_DEEP');
  });
});
