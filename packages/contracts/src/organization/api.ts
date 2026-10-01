import { z } from 'zod';
import {
  ActivateOrgHierarchyV1Schema,
  CreateOrgDraftVersionV1Schema,
  CreateOrgScopeGrantV1Schema,
  CreateOrgTreeV1Schema,
  CreateOrgUnitTypeV1Schema,
  CreateOrgUnitV1Schema,
  OrgActiveVersionV1Schema,
  OrgAsOfQuerySchema,
  OrgEdgeListQuerySchema,
  OrgEdgeViewV1Schema,
  OrgGrantListQuerySchema,
  OrgHierarchyActivatedEventV1Schema,
  OrgHierarchyActivationV1Schema,
  OrgHierarchyVersionDetailV1Schema,
  OrgHierarchyVersionV1Schema,
  OrgImpactV1Schema,
  OrgRecordStatusChangeV1Schema,
  OrgScopeGrantChangedEventV1Schema,
  OrgScopeGrantV1Schema,
  OrgTreeV1Schema,
  OrgUnitChangedEventV1Schema,
  OrgUnitListQuerySchema,
  OrgUnitTypeChangedEventV1Schema,
  OrgUnitTypeV1Schema,
  OrgUnitV1Schema,
  OrgValidationResultV1Schema,
  OrgVersionCheckV1Schema,
  OrgVersionTransitionV1Schema,
  RevokeOrgScopeGrantV1Schema,
  UpdateOrgDraftEdgesV1Schema,
  UpdateOrgUnitTypeV1Schema,
  UpdateOrgUnitV1Schema,
  orgPageSchema,
} from './index.js';

// WI-OI-109c: the organization administration API as data. The OpenAPI and AsyncAPI documents in
// docs/contracts/organization are generated from it (scripts/write-organization-contracts.mjs); tests keep the
// controller, this table and the committed documents identical.

export type OrganizationPermission =
  | 'organization:read'
  | 'organization:draft'
  | 'organization:approve'
  | 'organization:activate'
  | 'organization:grant';

export interface OrganizationRoute {
  method: 'get' | 'post' | 'patch';
  /** Relative to /api/v1/tenants/current/organization, with {param} placeholders. */
  path: string;
  operationId: string;
  permission: OrganizationPermission;
  summary: string;
  status: 200 | 201;
  body?: { name: string; schema: z.ZodTypeAny };
  query?: z.ZodObject<z.ZodRawShape>;
  response: { name: string; schema: z.ZodTypeAny };
}

const named = (name: string, schema: z.ZodTypeAny) => ({ name, schema });
const UnitType = named('OrgUnitType', OrgUnitTypeV1Schema);
const Unit = named('OrgUnit', OrgUnitV1Schema);
const Version = named('OrgHierarchyVersion', OrgHierarchyVersionV1Schema);
const Transition = named('OrgVersionTransition', OrgVersionTransitionV1Schema);
const StatusChange = named('OrgRecordStatusChange', OrgRecordStatusChangeV1Schema);
const Grant = named('OrgScopeGrant', OrgScopeGrantV1Schema);

export const ORGANIZATION_ROUTES: readonly OrganizationRoute[] = [
  { method: 'get', path: '/unit-types', operationId: 'listOrgUnitTypes', permission: 'organization:read', summary: 'List unit types', status: 200, response: named('OrgUnitTypeList', z.array(OrgUnitTypeV1Schema)) },
  { method: 'post', path: '/unit-types', operationId: 'createOrgUnitType', permission: 'organization:draft', summary: 'Create a unit type', status: 201, body: named('CreateOrgUnitType', CreateOrgUnitTypeV1Schema), response: UnitType },
  { method: 'patch', path: '/unit-types/{unitTypeId}', operationId: 'updateOrgUnitType', permission: 'organization:draft', summary: 'Change a unit type', status: 200, body: named('UpdateOrgUnitType', UpdateOrgUnitTypeV1Schema), response: UnitType },
  { method: 'post', path: '/unit-types/{unitTypeId}/archive', operationId: 'archiveOrgUnitType', permission: 'organization:draft', summary: 'Archive a unit type with no units', status: 200, body: StatusChange, response: UnitType },
  { method: 'post', path: '/unit-types/{unitTypeId}/restore', operationId: 'restoreOrgUnitType', permission: 'organization:draft', summary: 'Restore a unit type', status: 200, body: StatusChange, response: UnitType },
  { method: 'get', path: '/units', operationId: 'listOrgUnits', permission: 'organization:read', summary: 'Search units', status: 200, query: OrgUnitListQuerySchema, response: named('OrgUnitPage', orgPageSchema(OrgUnitV1Schema)) },
  { method: 'get', path: '/units/{unitId}', operationId: 'getOrgUnit', permission: 'organization:read', summary: 'Read a unit (ETag carries its version)', status: 200, response: Unit },
  { method: 'post', path: '/units', operationId: 'createOrgUnit', permission: 'organization:draft', summary: 'Create a unit (not placed in any tree)', status: 201, body: named('CreateOrgUnit', CreateOrgUnitV1Schema), response: Unit },
  { method: 'patch', path: '/units/{unitId}', operationId: 'updateOrgUnit', permission: 'organization:draft', summary: 'Change a unit', status: 200, body: named('UpdateOrgUnit', UpdateOrgUnitV1Schema), response: Unit },
  { method: 'post', path: '/units/{unitId}/archive', operationId: 'archiveOrgUnit', permission: 'organization:draft', summary: 'Archive a unit outside every live or open version', status: 200, body: StatusChange, response: Unit },
  { method: 'post', path: '/units/{unitId}/restore', operationId: 'restoreOrgUnit', permission: 'organization:draft', summary: 'Restore a unit', status: 200, body: StatusChange, response: Unit },
  { method: 'get', path: '/trees', operationId: 'listOrgTrees', permission: 'organization:read', summary: 'List trees', status: 200, response: named('OrgTreeList', z.array(OrgTreeV1Schema)) },
  { method: 'post', path: '/trees', operationId: 'createOrgTree', permission: 'organization:draft', summary: 'Create the primary tree or an alternate tree', status: 201, body: named('CreateOrgTree', CreateOrgTreeV1Schema), response: named('OrgTree', OrgTreeV1Schema) },
  { method: 'get', path: '/trees/{treeId}/versions', operationId: 'listOrgVersions', permission: 'organization:read', summary: "List a tree's latest 100 versions", status: 200, response: named('OrgHierarchyVersionList', z.array(OrgHierarchyVersionV1Schema)) },
  { method: 'post', path: '/trees/{treeId}/versions', operationId: 'createOrgDraftVersion', permission: 'organization:draft', summary: "Open the tree's draft, copied from the active or a given published version", status: 201, body: named('CreateOrgDraftVersion', CreateOrgDraftVersionV1Schema), response: Version },
  { method: 'get', path: '/trees/{treeId}/active', operationId: 'getActiveOrgVersion', permission: 'organization:read', summary: 'The version in force now or at a given time', status: 200, query: OrgAsOfQuerySchema, response: named('OrgActiveVersion', OrgActiveVersionV1Schema) },
  { method: 'get', path: '/trees/{treeId}/activations', operationId: 'listOrgActivations', permission: 'organization:read', summary: "A tree's activation history, newest first", status: 200, response: named('OrgHierarchyActivationList', z.array(OrgHierarchyActivationV1Schema)) },
  { method: 'get', path: '/versions/{versionId}', operationId: 'getOrgVersion', permission: 'organization:read', summary: 'Read a version (ETag carries its lock version)', status: 200, response: named('OrgHierarchyVersionDetail', OrgHierarchyVersionDetailV1Schema) },
  { method: 'get', path: '/versions/{versionId}/edges', operationId: 'listOrgEdges', permission: 'organization:read', summary: 'One level of a version: its roots or the children of a unit', status: 200, query: OrgEdgeListQuerySchema, response: named('OrgEdgePage', orgPageSchema(OrgEdgeViewV1Schema)) },
  { method: 'patch', path: '/versions/{versionId}/edges', operationId: 'updateOrgDraftEdges', permission: 'organization:draft', summary: 'Place, move or remove units in a draft', status: 200, body: named('UpdateOrgDraftEdges', UpdateOrgDraftEdgesV1Schema), response: Version },
  { method: 'get', path: '/versions/{versionId}/impact', operationId: 'getOrgVersionImpact', permission: 'organization:read', summary: 'What activating the version would change, and whose grants it touches', status: 200, response: named('OrgImpact', OrgImpactV1Schema) },
  { method: 'post', path: '/versions/{versionId}/validate', operationId: 'validateOrgVersion', permission: 'organization:draft', summary: 'Check a draft; valid drafts become validated', status: 200, body: named('OrgVersionCheck', OrgVersionCheckV1Schema), response: named('OrgValidationResult', OrgValidationResultV1Schema) },
  { method: 'post', path: '/versions/{versionId}/submit', operationId: 'submitOrgVersion', permission: 'organization:draft', summary: 'Submit a validated draft for approval', status: 200, body: Transition, response: Version },
  { method: 'post', path: '/versions/{versionId}/withdraw', operationId: 'withdrawOrgVersion', permission: 'organization:draft', summary: 'Withdraw an unsubmitted draft', status: 200, body: Transition, response: Version },
  { method: 'post', path: '/versions/{versionId}/approve', operationId: 'approveOrgVersion', permission: 'organization:approve', summary: 'Approve a submitted version (never its author or submitter)', status: 200, body: Transition, response: Version },
  { method: 'post', path: '/versions/{versionId}/reject', operationId: 'rejectOrgVersion', permission: 'organization:approve', summary: 'Reject a submitted or approved version', status: 200, body: Transition, response: Version },
  { method: 'post', path: '/versions/{versionId}/publish', operationId: 'publishOrgVersion', permission: 'organization:activate', summary: 'Freeze an approved version and build its closure and checksum', status: 200, body: Transition, response: Version },
  { method: 'post', path: '/activations', operationId: 'activateOrgHierarchy', permission: 'organization:activate', summary: 'Activate a published version from now or a later time (idempotent)', status: 201, body: named('ActivateOrgHierarchy', ActivateOrgHierarchyV1Schema), response: named('OrgHierarchyActivation', OrgHierarchyActivationV1Schema) },
  { method: 'get', path: '/grants', operationId: 'listOrgGrants', permission: 'organization:grant', summary: 'List member grants', status: 200, query: OrgGrantListQuerySchema, response: named('OrgScopeGrantPage', orgPageSchema(OrgScopeGrantV1Schema)) },
  { method: 'post', path: '/grants', operationId: 'createOrgGrant', permission: 'organization:grant', summary: 'Grant a member a unit and everything below it (idempotent)', status: 201, body: named('CreateOrgScopeGrant', CreateOrgScopeGrantV1Schema), response: Grant },
  { method: 'post', path: '/grants/{grantId}/revoke', operationId: 'revokeOrgGrant', permission: 'organization:grant', summary: 'Revoke a grant now', status: 200, body: named('RevokeOrgScopeGrant', RevokeOrgScopeGrantV1Schema), response: Grant },
];

export const ORGANIZATION_EVENTS = [
  { type: 'organization.unit-type.changed.v1', schema: OrgUnitTypeChangedEventV1Schema, summary: 'A unit type was created, changed, archived or restored.' },
  { type: 'organization.unit.changed.v1', schema: OrgUnitChangedEventV1Schema, summary: 'A unit was created, changed, archived or restored.' },
  { type: 'organization.hierarchy.activated.v1', schema: OrgHierarchyActivatedEventV1Schema, summary: 'A published version takes effect for a tree from a moment.' },
  { type: 'organization.scope-grant.changed.v1', schema: OrgScopeGrantChangedEventV1Schema, summary: 'A member was granted a unit, or a grant was revoked.' },
] as const;

type JsonObject = Record<string, unknown>;

function jsonSchema(schema: z.ZodTypeAny, io: 'input' | 'output'): JsonObject {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema, { io, unrepresentable: 'any' }) as JsonObject;
  return rest;
}

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
});

export function buildOrganizationOpenApi(): JsonObject {
  const schemas: Record<string, JsonObject> = {
    Error: {
      type: 'object',
      required: ['statusCode', 'message'],
      properties: { statusCode: { type: 'integer' }, message: {}, problems: { type: 'array', items: { type: 'object' } } },
    },
  };
  const paths: Record<string, Record<string, JsonObject>> = {};
  for (const route of ORGANIZATION_ROUTES) {
    schemas[route.response.name] ??= jsonSchema(route.response.schema, 'output');
    if (route.body) schemas[route.body.name] ??= jsonSchema(route.body.schema, 'input');
    const pathParameters = [...route.path.matchAll(/\{([A-Za-z]+)\}/g)].map((match) => ({
      name: match[1],
      in: 'path',
      required: true,
      schema: { type: 'string', minLength: 1, maxLength: 64 },
    }));
    const query = route.query ? jsonSchema(route.query, 'input') : null;
    const required = new Set((query?.required as string[] | undefined) ?? []);
    const queryParameters = Object.entries((query?.properties as Record<string, JsonObject> | undefined) ?? {}).map(([name, schema]) => ({
      name,
      in: 'query',
      required: required.has(name),
      schema,
    }));
    const mutation = route.method !== 'get';
    paths[route.path] ??= {};
    (paths[route.path] as Record<string, JsonObject>)[route.method] = {
      operationId: route.operationId,
      summary: route.summary,
      'x-permission': route.permission,
      ...(pathParameters.length + queryParameters.length > 0 ? { parameters: [...pathParameters, ...queryParameters] } : {}),
      ...(route.body
        ? { requestBody: { required: true, content: { 'application/json': { schema: { $ref: `#/components/schemas/${route.body.name}` } } } } }
        : {}),
      responses: {
        [String(route.status)]: {
          description: 'Success',
          content: { 'application/json': { schema: { $ref: `#/components/schemas/${route.response.name}` } } },
        },
        ...(route.body || route.query ? { '400': { $ref: '#/components/responses/BadRequest' } } : {}),
        '401': { $ref: '#/components/responses/Unauthorized' },
        '403': { $ref: '#/components/responses/Forbidden' },
        ...(pathParameters.length > 0 || route.path === '/activations' || route.path === '/grants' ? { '404': { $ref: '#/components/responses/NotFound' } } : {}),
        ...(mutation ? { '409': { $ref: '#/components/responses/Conflict' }, '422': { $ref: '#/components/responses/Unprocessable' } } : {}),
        '503': { $ref: '#/components/responses/DatabaseUnavailable' },
      },
    };
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'GigaLibs Organization API',
      version: '1.0.0',
      description:
        'WI-OI-109c (ADR-0018). Tenant and actor come from the server-validated session. Optimistic versions ' +
        '(expectedVersion) and idempotency keys travel in request bodies. Drafts never affect runtime scope.',
    },
    servers: [{ url: '/api/v1/tenants/current/organization' }],
    security: [{ sessionBearer: [] }],
    paths,
    components: {
      securitySchemes: { sessionBearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      responses: {
        BadRequest: errorResponse('The request does not match the contract.'),
        Unauthorized: errorResponse('No valid session.'),
        Forbidden: errorResponse('The member lacks the permission, or the step needs a second person.'),
        NotFound: errorResponse('Not found in this tenant.'),
        Conflict: errorResponse('Stale version, duplicate, wrong state or reused idempotency key; reload and retry.'),
        Unprocessable: errorResponse('The change breaks an organization rule; validation problems are listed when known.'),
        DatabaseUnavailable: errorResponse('The database is unavailable.'),
      },
      schemas,
    },
  };
}

export function buildOrganizationAsyncApi(): JsonObject {
  const channels: Record<string, JsonObject> = {};
  const operations: Record<string, JsonObject> = {};
  const messages: Record<string, JsonObject> = {};
  for (const event of ORGANIZATION_EVENTS) {
    const key = event.type.replaceAll('.', '_').replaceAll('-', '_');
    messages[key] = { name: event.type, summary: event.summary, payload: jsonSchema(event.schema, 'output') };
    channels[key] = { address: event.type, messages: { [key]: { $ref: `#/components/messages/${key}` } } };
    operations[`publish_${key}`] = { action: 'send', channel: { $ref: `#/channels/${key}` } };
  }
  return {
    asyncapi: '3.0.0',
    info: {
      title: 'GigaLibs Organization events',
      version: '1.0.0',
      description:
        'Written to platform_outbox_events in the same transaction as the change (aggregateType, aggregateId and ' +
        'aggregateVersion beside the payload). Consumers expand grants from the activated version (ADR-0018 §3).',
    },
    channels,
    operations,
    components: { messages },
  };
}
