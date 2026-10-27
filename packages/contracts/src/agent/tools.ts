import { holdsPermission } from '../rbac/permission-match.js';
import type { AgentToolSpec } from './index.js';

// WI-OI-120bc (Giga AI Companion, capability 1 — operational): the catalogue of tools the Companion may call against
// the platform's modules. Each tool declares the permission it needs; the Companion is only ever OFFERED the tools the
// signed-in caller already holds (toolsForPermissions), so the agent can never do more than the person could do by
// hand. Starter set, grounded in permissions that exist today (several built this session — billing/currency);
// extended per module as capability 1 grows. Tool execution is a runtime concern, not here.
export const OPERATIONAL_TOOLS: readonly AgentToolSpec[] = [
  {
    name: 'cmms.workOrders.search',
    description: 'Find work orders, optionally by organization unit, status or asset.',
    input: {
      type: 'object',
      properties: {
        unitId: { type: 'string' },
        status: { type: 'string', enum: ['OPEN', 'IN_PROGRESS', 'OVERDUE', 'DONE'] },
        assetId: { type: 'string' },
      },
    },
    requiresPermission: 'cmms.work-orders.read',
  },
  {
    name: 'cmms.workOrders.create',
    description:
      'Create a maintenance work order. Confirm the details with the user before calling this (it is a write).',
    input: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        assetId: { type: 'string' },
        priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] },
        description: { type: 'string' },
      },
      required: ['title'],
    },
    requiresPermission: 'cmms.work-orders.write',
  },
  {
    name: 'cmms.workOrders.assign',
    description: 'Assign a technician to a work order.',
    input: {
      type: 'object',
      properties: { workOrderId: { type: 'string' }, technicianId: { type: 'string' } },
      required: ['workOrderId', 'technicianId'],
    },
    requiresPermission: 'cmms.work-orders.write',
  },
  {
    name: 'cmms.meters.read',
    description: 'Read a meter and its latest readings for an asset.',
    input: {
      type: 'object',
      properties: { meterId: { type: 'string' }, assetId: { type: 'string' } },
    },
    requiresPermission: 'cmms.meters.read',
  },
  {
    name: 'workforce.people.search',
    description: 'Find people in the workspace, optionally by unit or role.',
    input: {
      type: 'object',
      properties: { unitId: { type: 'string' }, role: { type: 'string' } },
    },
    requiresPermission: 'people:read',
  },
  {
    name: 'workforce.people.availableAt',
    description: 'List the people who can work at a site on a given day.',
    input: {
      type: 'object',
      properties: { placeId: { type: 'string' }, date: { type: 'string', format: 'date' } },
      required: ['placeId', 'date'],
    },
    requiresPermission: 'people:read',
  },
  {
    name: 'billing.usage.statement',
    description: 'Read the reconciled usage/billing statement for a period and plan.',
    input: {
      type: 'object',
      properties: {
        period: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}$' },
        plan: { type: 'string', enum: ['STARTER', 'GROWTH', 'ENTERPRISE'] },
      },
    },
    requiresPermission: 'billing:read',
  },
  {
    name: 'currency.rates.table',
    description: 'Read the workspace exchange-rate table for a base currency.',
    input: {
      type: 'object',
      properties: { base: { type: 'string', pattern: '^[A-Z]{3}$' } },
      required: ['base'],
    },
    requiresPermission: 'currency:read',
  },
];

/** Find a tool by its exact name. */
export function findTool(tools: readonly AgentToolSpec[], name: string): AgentToolSpec | undefined {
  return tools.find((tool) => tool.name === name);
}

/**
 * The tools a caller may be offered: only those whose required permission the caller holds (wildcards respected via
 * {@link holdsPermission}). This is the agent's least-privilege boundary — never offer a tool the person could not use.
 */
export function toolsForPermissions(
  tools: readonly AgentToolSpec[],
  held: readonly string[] | null | undefined,
): readonly AgentToolSpec[] {
  return tools.filter((tool) => holdsPermission(held, tool.requiresPermission));
}
