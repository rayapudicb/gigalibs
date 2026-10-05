/**
 * WI-OI-120h — the space lists answer `{ items }`, like every other CMMS list and as the Spaces screen reads them
 * (a plain list made `/cmms/spaces` crash in the browser).
 */
import { describe, expect, it } from 'vitest';
import type { CmmsPrincipal } from '../auth/authorization.js';
import { EamSpacesController } from './spaces.controller.js';
import type { EamSpacesService } from './spaces.service.js';

const principal = { tenantId: '11111111-1111-4111-8111-111111111111' } as CmmsPrincipal;
const site = { id: 'aaaa1111-1111-4111-8111-111111111111', code: 'SITE-1', children: [] };
const pump = { id: 'bbbb2222-2222-4222-8222-222222222222', name: 'Pump' };

const controller = new EamSpacesController({
  tree: async () => [site],
  getAssetsInSpace: async () => [pump],
} as unknown as EamSpacesService);

describe('EamSpacesController lists', () => {
  it('answers the space tree as { items }', async () => {
    await expect(controller.tree(principal)).resolves.toEqual({ items: [site] });
  });

  it("answers a space's assets as { items }", async () => {
    await expect(controller.getAssetsInSpace(principal, site.id)).resolves.toEqual({ items: [pump] });
  });
});
