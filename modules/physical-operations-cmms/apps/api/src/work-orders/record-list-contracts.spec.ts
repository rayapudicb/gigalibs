import {
  SearchCmmsAssetsV1Schema,
  SearchCmmsPartsV1Schema,
  SearchCmmsRequestsV1Schema,
  SearchCmmsWorkOrdersV1Schema,
} from '@gigalibs/contracts';
import type { ModulePrincipal } from '@gigalibs/module-sdk';
import { describe, expect, it } from 'vitest';
import { MemoryIdempotencyStore } from '../test/memory-idempotency-store.js';
import { type CmmsRecordDependencies, cmmsRecordDispatcher } from './cmms-record-adapters.js';

// WI-OI-120be (W1 review B, release blocker): every record list must reach its service with a query that the real
// search contract accepts, for every declared sort, both directions, search and every filter. The adapter specs mock
// the services, which hid that each list answered 400.
const principal = {
  tenantId: 'tenant-test',
  subject: 'planner-1',
  sessionId: 'session-1',
  authVersion: 1,
  permissions: [
    'cmms:read',
    'cmms.work-orders.read',
    'cmms.requests.read',
    'cmms.parts.read',
    'cmms.assets.read',
  ],
  roles: [],
  persona: 'OPERATIONS_SUPERVISOR',
  departmentScope: { mode: 'ALL' },
  placeScope: { mode: 'UNBOUNDED' },
} as unknown as ModulePrincipal;

type Parser = { parse(value: unknown): unknown };
const received: Array<{ service: string; query: Record<string, unknown> }> = [];
const searchingWith = (service: string, schema: Parser) => ({
  search: async (_principal: unknown, raw: unknown) => {
    // The real contract, exactly as the service parses it.
    received.push({ service, query: schema.parse(raw) as Record<string, unknown> });
    return { items: [], total: 0, page: 1, pageSize: 25 };
  },
});
const deps = {
  workOrders: searchingWith('workOrders', SearchCmmsWorkOrdersV1Schema),
  requests: searchingWith('requests', SearchCmmsRequestsV1Schema),
  parts: searchingWith('parts', SearchCmmsPartsV1Schema),
  assets: searchingWith('assets', SearchCmmsAssetsV1Schema),
} as unknown as CmmsRecordDependencies;
const dispatcher = cmmsRecordDispatcher(deps, new MemoryIdempotencyStore());

const lists = [
  [
    'cmms.work-orders',
    'workOrders',
    ['wo-number', 'title', 'due-at', 'created-at'],
    { 'filter.status': 'OPEN', 'filter.priority': 'HIGH' },
  ],
  [
    'cmms.maintenance-requests',
    'requests',
    ['request-number', 'title', 'created-at'],
    { 'filter.status': 'PENDING', 'filter.priority': 'HIGH' },
  ],
  ['cmms.parts', 'parts', ['part-number', 'name'], {}],
  [
    'cmms.assets',
    'assets',
    ['asset-tag', 'name', 'created-at'],
    { 'filter.status': 'OPERATIONAL', 'filter.criticality': 'HIGH' },
  ],
] as const;
const camel = (key: string) =>
  key.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());

describe('CMMS record lists against the real search contracts', () => {
  it.each(lists)(
    '%s accepts its default list, search and filters',
    async (entity, service, _sorts, filters) => {
      received.length = 0;
      await dispatcher.list(principal, entity, {});
      await dispatcher.list(principal, entity, { search: 'pump', ...filters });
      expect(received.map((entry) => entry.service)).toEqual([service, service]);
      expect(received[1]?.query).toMatchObject({ q: 'pump' });
    },
  );

  it.each(lists)(
    '%s sorts by each declared field, in both directions',
    async (entity, _service, sorts) => {
      for (const sort of sorts) {
        for (const direction of ['ASC', 'DESC'] as const) {
          received.length = 0;
          await dispatcher.list(principal, entity, { sort, direction });
          expect(received[0]?.query).toMatchObject({
            sortField: camel(sort),
            sortDirection: direction,
          });
        }
      }
    },
  );
});
