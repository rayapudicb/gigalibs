import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import addFormats from 'ajv-formats';
import Ajv2020 from 'ajv/dist/2020.js';
import yaml from 'js-yaml';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestSchemaPath = resolve(
  repositoryRoot,
  'docs/contracts/configuration-studio/configuration-manifest.schema.json',
);
const openApiPath = resolve(repositoryRoot, 'docs/contracts/configuration-studio/openapi.yaml');
const controllerPath = resolve(
  repositoryRoot,
  'apps/playground-api/src/configuration-studio.controller.ts',
);
const contractSourcePath = resolve(repositoryRoot, 'packages/contracts/src/configuration/index.ts');
const compilerSourcePath = resolve(repositoryRoot, 'packages/configuration-core/src/index.ts');
const compatibilitySourcePath = resolve(
  repositoryRoot,
  'packages/configuration-core/src/compatibility.ts',
);
const evidencePath = process.env.CONFIGURATION_CONTRACT_EVIDENCE_PATH?.trim();

const [
  manifestSchemaRaw,
  openApiRaw,
  controllerSource,
  contractSource,
  compilerSource,
  compatibilitySource,
] = await Promise.all([
  readFile(manifestSchemaPath, 'utf8'),
  readFile(openApiPath, 'utf8'),
  readFile(controllerPath, 'utf8'),
  readFile(contractSourcePath, 'utf8'),
  readFile(compilerSourcePath, 'utf8'),
  readFile(compatibilitySourcePath, 'utf8'),
]);

const manifestSchema = JSON.parse(manifestSchemaRaw);
const openApi = yaml.load(openApiRaw);
assert.ok(openApi && typeof openApi === 'object' && !Array.isArray(openApi));

const {
  CONFIGURATION_MAX_FIELDS,
  ConfigurationComponentKeySchema,
  ConfigurationDefinitionSchema,
  ConfigurationFieldTypeSchema,
  ConfigurationImpactChangeSchema,
} = await import('../packages/contracts/dist/index.js');
const { CONFIGURATION_COMPILER_VERSION, compileConfiguration } = await import(
  '../packages/configuration-core/dist/index.js'
);

const fieldTypes = [...ConfigurationFieldTypeSchema.options];
const componentTypes = [...ConfigurationComponentKeySchema.options];
assert.equal(manifestSchema.properties.fields.maxItems, CONFIGURATION_MAX_FIELDS);
assert.equal(manifestSchema.properties.compilerVersion.const, CONFIGURATION_COMPILER_VERSION);
assert.deepEqual(manifestSchema.$defs.field.properties.type.enum, fieldTypes);
assert.deepEqual(manifestSchema.$defs.field.properties.component.enum, componentTypes);
assert.deepEqual(manifestSchema.properties.mode.enum, ['CREATE', 'EDIT', 'READ', 'LIST']);

const fieldDefinitions = [
  ['TEXT', 'text-input'],
  ['TEXTAREA', 'textarea'],
  ['NUMBER', 'number-input'],
  ['INTEGER', 'number-input'],
  ['BOOLEAN', 'checkbox'],
  ['DATE', 'date-input'],
  ['DATETIME', 'datetime-input'],
  ['EMAIL', 'text-input'],
  ['PHONE', 'text-input'],
  ['URL', 'text-input'],
  ['CURRENCY', 'number-input'],
  ['SELECT', 'select'],
  ['MULTI_SELECT', 'multi-select'],
].map(([type, component], index) => ({
  key: `portable-field-${index}`,
  label: `Portable field ${index}`,
  type,
  component,
  required: false,
  readOnly: false,
  classification: 'INTERNAL',
  ...(type === 'SELECT' || type === 'MULTI_SELECT'
    ? { options: [{ value: 'portable-option', label: 'Portable option' }] }
    : {}),
}));
const definition = {
  contractVersion: '1.0',
  moduleKey: 'tenant-apps',
  entityKey: 'portable-record',
  surfaceKey: 'custom-form',
  mode: 'EDIT',
  title: 'Portable manifest conformance',
  description: 'Cross-language contract certification fixture.',
  fields: fieldDefinitions,
  sections: [
    {
      key: 'portable-fields',
      title: 'Portable fields',
      columns: 2,
      fieldKeys: fieldDefinitions.map(({ key }) => key),
    },
  ],
  listView: {
    columnKeys: fieldDefinitions.slice(0, 5).map(({ key }) => key),
    defaultSortKey: fieldDefinitions[0].key,
    defaultSortDirection: 'DESC',
    searchableFieldKeys: [fieldDefinitions[0].key],
    quickFilters: [
      {
        label: 'Has value',
        fieldKey: fieldDefinitions[0].key,
        operator: 'IS_NOT_EMPTY',
      },
    ],
  },
};
assert.equal(ConfigurationDefinitionSchema.safeParse(definition).success, true);
const compiled = compileConfiguration(definition);
assert.equal(compiled.valid, true);
assert.ok(compiled.manifest);

const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
addFormats(ajv);
const validateManifest = ajv.compile(manifestSchema);
assert.equal(
  validateManifest(compiled.manifest),
  true,
  `Compiled manifest failed portable schema: ${ajv.errorsText(validateManifest.errors)}`,
);
assert.equal(
  validateManifest({ ...compiled.manifest, executableCode: 'fetch("https://invalid")' }),
  false,
  'Portable schema must reject unknown executable metadata.',
);
assert.equal(
  validateManifest({
    ...compiled.manifest,
    fields: Array.from({ length: CONFIGURATION_MAX_FIELDS + 1 }, (_, index) => ({
      ...fieldDefinitions[0],
      key: `overflow-field-${index}`,
    })),
  }),
  false,
  'Portable schema must enforce the shared field ceiling.',
);

const decoratorPattern = /@(Get|Post|Patch|Put|Delete)\('([^']+)'\)/g;
const controllerOperations = [];
for (const match of controllerSource.matchAll(decoratorPattern)) {
  const method = match[1].toLowerCase();
  const path = `/${match[2].replaceAll(/:([A-Za-z][A-Za-z0-9]*)/g, '{$1}')}`;
  controllerOperations.push(`${method} ${path}`);
}
const httpMethods = new Set(['get', 'post', 'patch', 'put', 'delete']);
const documentedOperations = [];
const operationIds = [];
const successResponseByOperation = new Map();
for (const [path, pathItem] of Object.entries(openApi.paths ?? {})) {
  for (const [method, operation] of Object.entries(pathItem)) {
    if (!httpMethods.has(method)) continue;
    documentedOperations.push(`${method} ${path}`);
    assert.ok(operation.operationId, `${method.toUpperCase()} ${path} lacks operationId.`);
    operationIds.push(operation.operationId);
    assert.ok(operation.responses?.['401'], `${method.toUpperCase()} ${path} lacks 401 response.`);
    assert.ok(operation.responses?.['403'], `${method.toUpperCase()} ${path} lacks 403 response.`);
    assert.ok(operation.responses?.['503'], `${method.toUpperCase()} ${path} lacks 503 response.`);
    const successResponse = operation.responses?.['200'] ?? operation.responses?.['201'];
    assert.ok(successResponse, `${method.toUpperCase()} ${path} lacks a success response.`);
    successResponseByOperation.set(
      operation.operationId,
      successResponse.$ref ?? successResponse.content?.['application/json']?.schema?.$ref,
    );
  }
}
assert.deepEqual(
  documentedOperations.sort(),
  controllerOperations.sort(),
  'OpenAPI paths/methods diverge from ConfigurationStudioController.',
);
assert.equal(
  new Set(operationIds).size,
  operationIds.length,
  'OpenAPI operationId values must be unique.',
);
assert.equal(openApi.openapi, '3.1.0');
assert.equal(openApi.info.version, '1.0.0');
assert.equal(openApi.servers?.[0]?.url, '/api/v1/configuration');

const expectedSuccessResponses = {
  listConfigurationSurfaces: '#/components/responses/SurfaceList',
  listConfigurationChangeSets: '#/components/responses/ChangeSetList',
  createConfigurationChangeSet: '#/components/responses/ChangeSet',
  updateConfigurationChangeSet: '#/components/responses/ChangeSet',
  getConfigurationChangeSetImpact: '#/components/responses/ImpactReport',
  submitConfigurationChangeSet: '#/components/responses/ChangeSet',
  approveConfigurationChangeSet: '#/components/responses/ChangeSet',
  rejectConfigurationChangeSet: '#/components/responses/ChangeSet',
  publishConfigurationChangeSet: '#/components/responses/PublishedVersion',
  listConfigurationPublishedVersions: '#/components/responses/PublishedVersionList',
  listConfigurationActivations: '#/components/responses/ActivationList',
  activateConfigurationVersion: '#/components/responses/Activation',
  rollbackConfigurationActivation: '#/components/responses/Activation',
  getConfigurationRuntimeManifest: '#/components/schemas/RuntimeManifestResponse',
  getCurrentConfigurationRuntimeManifest: '#/components/schemas/CurrentRuntimeManifestResponse',
  previewConfigurationRuntimeManifest: '#/components/schemas/RuntimeManifestResponse',
  getConfigurationExtensionValues: '#/components/responses/ExtensionValue',
  saveConfigurationExtensionValues: '#/components/responses/ExtensionValue',
  exportConfigurationPackage: '#/components/responses/PackageEnvelope',
  importConfigurationPackage: '#/components/responses/PackageImport',
  listRuntimeApplications: '#/components/responses/RuntimeApplicationList',
  listConfigurationApplicationRecords: '#/components/responses/RecordList',
  createConfigurationApplicationRecord: '#/components/responses/RecordMutation',
  getConfigurationApplicationRecord: '#/components/responses/RecordDetail',
  updateConfigurationApplicationRecord: '#/components/responses/RecordMutation',
  deleteConfigurationApplicationRecord: '#/components/responses/RecordMutation',
  listConfigurationTemplates: '#/components/responses/TemplateList',
  createConfigurationTemplate: '#/components/responses/Template',
  updateConfigurationTemplate: '#/components/responses/TemplateUpdate',
  deleteConfigurationTemplate: '#/components/responses/DeletedResource',
  duplicateConfigurationTemplate: '#/components/responses/Template',
  listConfigurationSavedFilters: '#/components/responses/SavedFilterList',
  createConfigurationSavedFilter: '#/components/responses/SavedFilter',
  deleteConfigurationSavedFilter: '#/components/responses/DeletedSavedFilter',
};
assert.deepEqual(
  Object.fromEntries([...successResponseByOperation.entries()].sort()),
  Object.fromEntries(Object.entries(expectedSuccessResponses).sort()),
  'OpenAPI operations must use the named v1 response contracts.',
);
assert.doesNotMatch(
  openApiRaw,
  /#\/components\/responses\/(?:OkObject|CreatedObject|OkArray)/,
  'Generic object/array success responses are not portable API contracts.',
);
for (const schemaName of [
  'ConfigurationSurfaceResponse',
  'ConfigurationChangeSetResponse',
  'ConfigurationPublishedVersionResponse',
  'ConfigurationActivationResponse',
  'ConfigurationActivationListItemResponse',
  'ConfigurationImpactReportResponse',
  'ConfigurationRuntimeApplicationResponse',
  'ConfigurationExtensionValueResponse',
  'ConfigurationRecordMutationResponse',
  'ConfigurationRecordListItemResponse',
  'ConfigurationRecordDetailResponse',
  'ConfigurationRecordListResponse',
  'ConfigurationTemplateResponse',
  'ConfigurationTemplateListResponse',
  'ConfigurationTemplateUpdateResponse',
  'ConfigurationDeletedResourceResponse',
  'ConfigurationSavedFilterResponse',
  'ConfigurationDeletedSavedFilterResponse',
  'ConfigurationPackageEnvelopeResponse',
  'ConfigurationPackageImportResponse',
  'RuntimeManifestResponse',
  'CurrentRuntimeManifestResponse',
  'RuntimeScopeResponse',
  'RuntimeAdapterResponse',
  'RuntimeErrorResponse',
]) {
  assert.equal(
    openApi.components.schemas[schemaName]?.additionalProperties,
    false,
    `${schemaName} must reject undeclared top-level response fields.`,
  );
}
for (const schemaName of [
  'ConfigurationSurfaceListResponseSchema',
  'ConfigurationChangeSetListResponseSchema',
  'ConfigurationChangeSetResponseSchema',
  'ConfigurationImpactReportSchema',
  'ConfigurationPublishedVersionListResponseSchema',
  'ConfigurationPublishedVersionResponseSchema',
  'ConfigurationActivationListResponseSchema',
  'ConfigurationActivationResponseSchema',
  'ConfigurationRuntimeManifestResponseSchema',
  'ConfigurationRuntimeManifestCurrentResponseSchema',
  'ConfigurationExtensionValueResponseSchema',
  'ConfigurationPackageEnvelopeSchema',
  'ConfigurationPackageImportResponseSchema',
  'ConfigurationRuntimeApplicationListResponseSchema',
  'ConfigurationRecordListResponseSchema',
  'ConfigurationRecordMutationResponseSchema',
  'ConfigurationRecordDetailResponseSchema',
  'ConfigurationTemplateListResponseSchema',
  'ConfigurationTemplateResponseSchema',
  'ConfigurationTemplateUpdateResponseSchema',
  'ConfigurationDeletedResourceResponseSchema',
  'ConfigurationSavedFilterListResponseSchema',
  'ConfigurationSavedFilterResponseSchema',
  'ConfigurationDeletedSavedFilterResponseSchema',
]) {
  assert.ok(
    controllerSource.includes(schemaName),
    `${schemaName} is not enforced at the controller boundary.`,
  );
}

const openApiDefinition = openApi.components.schemas.ConfigurationDefinition;
assert.equal(openApiDefinition.properties.fields.maxItems, CONFIGURATION_MAX_FIELDS);
assert.deepEqual(openApiDefinition.properties.mode.enum, ['CREATE', 'EDIT', 'READ', 'LIST']);
const impactChangeKinds = [...ConfigurationImpactChangeSchema.shape.kind.options];
assert.deepEqual(
  openApi.components.schemas.ConfigurationImpactReportResponse.properties.changes.items.properties
    .kind.enum,
  impactChangeKinds,
  'OpenAPI impact-change kinds diverge from the runtime response contract.',
);
assert.equal(openApi.components.schemas.Key.minLength, 2);
assert.equal(openApi.components.schemas.Key.maxLength, 80);
assert.equal(openApi.components.schemas.Reason.minLength, 3);
assert.equal(openApi.components.schemas.Reason.maxLength, 500);
assert.equal(openApi.components.schemas.IdempotencyKey.minLength, 8);
assert.equal(openApi.components.schemas.IdempotencyKey.maxLength, 200);
assert.deepEqual(openApi.components.schemas.ActivationRequest.required, [
  'publishedVersionId',
  'environmentKey',
  'cohortKey',
  'reason',
  'idempotencyKey',
]);
assert.deepEqual(openApi.components.schemas.RuntimeManifestResponse.required, [
  'activationId',
  'publishedVersionId',
  'activatedAt',
  'manifest',
  'checksum',
]);
assert.deepEqual(openApi.components.schemas.RuntimeScopeResponse.required, [
  'contractVersion',
  'environmentKey',
  'cohortKey',
  'policyKey',
  'entitlementModuleKey',
  'resolutionSource',
]);
assert.equal(openApi.components.parameters.EnvironmentKeyQuery.required, undefined);
assert.equal(openApi.components.parameters.CohortKeyQuery.required, undefined);
assert.equal(openApi.components.parameters.EnvironmentKeyRequiredQuery.required, true);
assert.equal(openApi.components.parameters.CohortKeyRequiredQuery.required, true);
assert.ok(openApi.paths['/change-sets/{id}/publish'].post.responses['200']);
assert.ok(openApi.paths['/activations'].post.responses['201']);
assert.ok(openApi.paths['/activations/rollback'].post.responses['201']);

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const evidence = {
  recordedAt: new Date().toISOString(),
  certification: 'WI-OI-039-configuration-contract-convergence',
  contractVersion: '1.0',
  compilerVersion: CONFIGURATION_COMPILER_VERSION,
  openApiVersion: openApi.info.version,
  controllerOperationCount: controllerOperations.length,
  documentedOperationCount: documentedOperations.length,
  fieldTypeCount: fieldTypes.length,
  componentTypeCount: componentTypes.length,
  impactChangeKindCount: impactChangeKinds.length,
  maximumFields: CONFIGURATION_MAX_FIELDS,
  artifacts: {
    manifestSchemaSha256: sha256(manifestSchemaRaw),
    openApiSha256: sha256(openApiRaw),
    controllerSha256: sha256(controllerSource),
    contractSourceSha256: sha256(contractSource),
    compilerSourceSha256: sha256(compilerSource),
    compatibilitySourceSha256: sha256(compatibilitySource),
  },
  outcomes: [
    'json-schema-2020-12-parsed-and-compiled-with-ajv',
    'real-compiler-output-validates-against-portable-manifest-schema',
    'unknown-executable-metadata-rejected-by-portable-schema',
    'portable-schema-enforces-shared-250-field-ceiling',
    'field-type-component-mode-and-compiler-enums-match-runtime-contracts',
    'openapi-yaml-parses-and-covers-every-controller-method-path',
    'openapi-request-limits-and-runtime-wrapper-match-implemented-contract',
    'openapi-status-codes-match-publish-activation-and-retryable-database-boundaries',
    `all-${documentedOperations.length}-operations-use-named-v1-success-response-contracts`,
    'controller-enforces-strict-response-projections-before-serialization',
    'impact-change-kinds-match-between-runtime-contract-and-openapi',
  ],
  outcomeCount: 11,
  limitations: [
    'Dependency-free Java 11 client conformance is certified separately; this static audit does not prove live Java transport or consumer integration.',
    'Independent architecture, client and API review is still required before release acceptance.',
  ],
  releaseAcceptance: false,
};

if (evidencePath) {
  const target = resolve(repositoryRoot, evidencePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
}
console.log(JSON.stringify(evidence, null, 2));
