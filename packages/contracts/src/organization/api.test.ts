import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildOrganizationAsyncApi, buildOrganizationOpenApi, ORGANIZATION_EVENTS, ORGANIZATION_ROUTES } from './api.js';
import { ORGANIZATION_EVENT_TYPES } from './index.js';

const committed = (name: string) => JSON.parse(readFileSync(new URL(`../../../../docs/contracts/organization/${name}`, import.meta.url), 'utf8'));

// WI-OI-109c: the published API documents are generated from the contracts and never drift from them.
describe('organization API documents', () => {
  it('match the contracts (regenerate with node scripts/write-organization-contracts.mjs)', () => {
    expect(committed('openapi.json')).toEqual(JSON.parse(JSON.stringify(buildOrganizationOpenApi())));
    expect(committed('asyncapi.json')).toEqual(JSON.parse(JSON.stringify(buildOrganizationAsyncApi())));
  });

  it('name every operation once and document every event the service writes', () => {
    const operationIds = ORGANIZATION_ROUTES.map((route) => route.operationId);
    expect(new Set(operationIds).size).toBe(operationIds.length);
    expect(ORGANIZATION_EVENTS.map((event) => event.type)).toEqual([...ORGANIZATION_EVENT_TYPES]);
  });

  it('keeps approval and activation apart from drafting', () => {
    const permissionOf = (operationId: string) => ORGANIZATION_ROUTES.find((route) => route.operationId === operationId)?.permission;
    expect(permissionOf('approveOrgVersion')).toBe('organization:approve');
    expect(permissionOf('publishOrgVersion')).toBe('organization:activate');
    expect(permissionOf('activateOrgHierarchy')).toBe('organization:activate');
    expect(permissionOf('createOrgGrant')).toBe('organization:grant');
    expect(ORGANIZATION_ROUTES.filter((route) => route.method === 'get').every((route) => route.permission !== 'organization:draft')).toBe(true);
  });
});
