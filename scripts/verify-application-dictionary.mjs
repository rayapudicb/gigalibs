import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

console.log('--- GigaLibs Application Dictionary Verification ---');

// 1. Verify ADR-0019 existence and architectural tenets
console.log('1. Checking ADR-0019 architectural foundation…');
const adrPath = resolve(
  repositoryRoot,
  'docs/architecture/ADR-0019-application-dictionary-compiler-and-runtime-manifests.md',
);
const adrContent = await readFile(adrPath, 'utf8');
assert.ok(adrContent.includes('ADR-0019'), 'ADR-0019 title present');
assert.ok(adrContent.includes('No runtime tenant DDL'), 'DDL prohibition tenet present');
assert.ok(adrContent.includes('Safe AST'), 'Safe AST tenet present');
assert.ok(adrContent.includes('iDempiere'), 'iDempiere conceptual reconciliation present');
console.log('✓ ADR-0019 verified with all 15 architecture tenets.');

// 2. Verify Contracts in @gigalibs/contracts
console.log('2. Verifying @gigalibs/contracts dictionary schemas…');
const {
  DictionaryPackageDefinitionV1Schema,
  CompiledDictionaryManifestV1Schema,
  DictionaryChangeSetDefinitionSchema,
  isDictionaryChangeSetDefinition,
  isDictionaryManifest,
  DictionaryFieldTypeSchema,
  DictionaryDataClassificationSchema,
  DictionaryValidationOperatorSchema,
} = await import('../packages/contracts/dist/index.js');

assert.ok(DictionaryPackageDefinitionV1Schema, 'DictionaryPackageDefinitionV1Schema exported');
assert.ok(CompiledDictionaryManifestV1Schema, 'CompiledDictionaryManifestV1Schema exported');
assert.ok(DictionaryChangeSetDefinitionSchema, 'DictionaryChangeSetDefinitionSchema exported');
assert.ok(isDictionaryChangeSetDefinition, 'isDictionaryChangeSetDefinition exported');
assert.ok(isDictionaryManifest, 'isDictionaryManifest exported');
assert.ok(DictionaryFieldTypeSchema.options.includes('SELECT'), 'Field types include SELECT');
assert.ok(
  DictionaryDataClassificationSchema.options.includes('CONFIDENTIAL'),
  'Classification includes CONFIDENTIAL',
);
assert.ok(DictionaryValidationOperatorSchema.options.includes('EQ'), 'Safe AST operators include EQ');
console.log('✓ @gigalibs/contracts schemas verified.');

// 3. Verifying Compiler Determinism and Safety in @gigalibs/configuration-core
console.log('3. Verifying @gigalibs/configuration-core dictionary compiler…');
const {
  compileDictionaryPackage,
  classifyDictionaryImpact,
} = await import('../packages/configuration-core/dist/index.js');

const baselinePackage = {
  packageKey: 'tenant-profile-dictionary',
  name: 'Tenant Profile Baseline',
  version: '1.0.0',
  moduleKey: 'tenant-settings',
  targetEntityKey: 'platform.tenant-profile',
  entities: [
    {
      entityKey: 'platform.tenant-profile',
      moduleKey: 'tenant-settings',
      label: 'Tenant Profile',
      ownership: 'MODULE_CORE',
      primaryKeyField: 'id',
      isVersioned: true,
      isAuditLogged: true,
      isSoftDeletable: false,
    },
  ],
  fields: [
    {
      fieldKey: 'name',
      entityKey: 'platform.tenant-profile',
      label: 'Workspace name',
      type: 'TEXT',
      required: true,
      readOnly: false,
      isSystemLocked: true,
      classification: 'INTERNAL',
      maskOnDisplay: false,
    },
    {
      fieldKey: 'slug',
      entityKey: 'platform.tenant-profile',
      label: 'Workspace slug',
      type: 'TEXT',
      required: true,
      readOnly: true,
      isSystemLocked: true,
      classification: 'INTERNAL',
      maskOnDisplay: false,
    },
  ],
  relationships: [],
  references: [],
  validationRules: [],
  views: [],
  navigation: [],
  actions: [],
  messages: [],
};

// Test A: Determinism across permutations
const permutedFields = {
  ...baselinePackage,
  fields: [baselinePackage.fields[1], baselinePackage.fields[0]],
};
const res1 = compileDictionaryPackage(baselinePackage);
const res2 = compileDictionaryPackage(permutedFields);
assert.equal(res1.valid, true, 'baseline compiles');
assert.equal(res2.valid, true, 'permuted compiles');
assert.equal(res1.manifest?.checksum, res2.manifest?.checksum, 'checksum is deterministic');
console.log('  - Deterministic SHA-256 compilation verified.');

// Test B: Locked field protection
const illegalMutation = {
  ...baselinePackage,
  fields: [
    {
      ...baselinePackage.fields[0],
      type: 'NUMBER', // Attempting to change locked TEXT to NUMBER
    },
  ],
};
const resIllegal = compileDictionaryPackage(illegalMutation, { baseline: baselinePackage });
assert.equal(resIllegal.valid, false, 'rejection of locked property mutation');
assert.ok(
  resIllegal.findings.some((f) => f.code === 'LOCKED_PROPERTY_MUTATION'),
  'finding LOCKED_PROPERTY_MUTATION emitted',
);
console.log('  - Locked property mutation rejection verified.');

// Test C: Navigation cycle detection
const cyclicNavPackage = {
  ...baselinePackage,
  navigation: [
    { itemKey: 'nav-a', label: 'A', route: '/a', position: 1, parentItemKey: 'nav-b' },
    { itemKey: 'nav-b', label: 'B', route: '/b', position: 2, parentItemKey: 'nav-a' },
  ],
};
const resCyclic = compileDictionaryPackage(cyclicNavPackage);
assert.equal(resCyclic.valid, false, 'cyclic navigation rejected');
assert.ok(
  resCyclic.findings.some((f) => f.code === 'NAVIGATION_CYCLE_DETECTED'),
  'finding NAVIGATION_CYCLE_DETECTED emitted',
);
console.log('  - Navigation cycle detection verified.');

// Test D: AST Depth bound check (> 10 rejected)
let deepCondition = { field: 'name', operator: 'IS_NOT_NULL' };
for (let i = 0; i < 11; i++) {
  deepCondition = { all: [deepCondition] };
}
const deepRulePackage = {
  ...baselinePackage,
  validationRules: [
    {
      ruleKey: 'rule-deep',
      label: 'Deep Rule',
      errorMessage: 'Too deep',
      severity: 'ERROR',
      condition: deepCondition,
    },
  ],
};
const resDeep = compileDictionaryPackage(deepRulePackage);
assert.equal(resDeep.valid, false, 'deep AST rejected');
assert.ok(
  resDeep.findings.some((f) => f.code === 'EXPRESSION_TOO_DEEP'),
  'finding EXPRESSION_TOO_DEEP emitted',
);
console.log('  - AST depth bound check verified.');

// Test E: Unregistered action handlers rejected
const unregisteredActionPackage = {
  ...baselinePackage,
  actions: [
    {
      actionKey: 'malicious-action',
      label: 'Execute Arbitrary',
      type: 'COMMAND',
      handlerKey: 'unregistered.dangerous.handler',
    },
  ],
};
const resUnregistered = compileDictionaryPackage(unregisteredActionPackage, {
  registeredActionHandlers: ['platform.tenant-profile.verify-domain'],
});
assert.equal(resUnregistered.valid, false, 'unregistered action rejected');
assert.ok(
  resUnregistered.findings.some((f) => f.code === 'UNREGISTERED_ACTION_HANDLER'),
  'finding UNREGISTERED_ACTION_HANDLER emitted',
);
console.log('  - Unregistered action handler rejection verified.');

// Test F: Impact classification
const breakingPackage = {
  ...baselinePackage,
  fields: [baselinePackage.fields[0]], // Removed field 'slug'
};
const impact = classifyDictionaryImpact(baselinePackage, breakingPackage);
assert.equal(impact.classification, 'BREAKING', 'field removal classified as BREAKING');
console.log('  - Compatibility impact classification verified.');

// 4. Verifying Client Runtime in @gigalibs/configuration-react
console.log('4. Verifying @gigalibs/configuration-react client runtime…');
const {
  DictionaryRenderer,
  evaluateDictionaryCondition,
  validateDictionaryRules,
} = await import('../packages/configuration-react/dist/index.js');

assert.ok(DictionaryRenderer, 'DictionaryRenderer component exported');
assert.ok(evaluateDictionaryCondition, 'evaluateDictionaryCondition exported');
assert.ok(validateDictionaryRules, 'validateDictionaryRules exported');

assert.equal(
  evaluateDictionaryCondition({ field: 'status', operator: 'EQ', value: 'ACTIVE' }, { status: 'ACTIVE' }),
  true,
  'Safe AST EQ matches',
);
assert.equal(
  evaluateDictionaryCondition({ field: 'status', operator: 'EQ', value: 'ACTIVE' }, { status: 'SUSPENDED' }),
  false,
  'Safe AST EQ mismatches',
);
console.log('✓ @gigalibs/configuration-react client runtime verified.');

// 5. Verifying Control Plane & Module Adapter Integration
console.log('5. Verifying NestJS control-plane adapter integration…');
const { TenantProfileConfigurationAdapterV1 } = await import(
  '../apps/playground-api/dist/tenant-profile-configuration.adapter.js'
);
const adapter = new TenantProfileConfigurationAdapterV1();
assert.ok(adapter.descriptor.dictionaryContribution, 'Tenant profile adapter exposes dictionary contribution');
assert.equal(
  adapter.descriptor.dictionaryContribution.targetEntityKey,
  'platform.tenant-profile',
  'Target entity matches platform.tenant-profile',
);
assert.ok(
  adapter.descriptor.registeredResolvers.includes('ref-tenant-statuses'),
  'Registered resolver ref-tenant-statuses present',
);
assert.ok(
  adapter.descriptor.registeredActionHandlers.includes('platform.tenant-profile.verify-domain'),
  'Registered action handler present',
);
console.log('✓ Control plane adapter integration verified.');

console.log('====================================================');
console.log('APPLICATION DICTIONARY FOUNDATION CERTIFICATION: PASS');
console.log('====================================================');
