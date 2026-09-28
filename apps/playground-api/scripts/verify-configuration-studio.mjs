import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes } from 'node:crypto';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
if (process.env.NODE_ENV === 'production') {
  throw new Error('Configuration Studio certification must not run with NODE_ENV=production');
}
const certificationDatabaseName = decodeURIComponent(
  new URL(process.env.DATABASE_URL).pathname.replace(/^\//, ''),
);
if (!/^gigalibs_(?:configuration|config)_(?:cert|uat|test)_[a-z0-9_]+$/i.test(certificationDatabaseName)) {
  throw new Error(
    'Configuration Studio certification requires a disposable database named gigalibs_configuration_cert_*, gigalibs_config_uat_*, or gigalibs_config_test_*',
  );
}
const [{ prisma }, { ConfigurationStudioService }] = await Promise.all([
  import('../../../packages/db/dist/index.js'),
  import('../dist/configuration-studio.service.js'),
]);

const suffix = `${Date.now()}-${randomBytes(4).toString('hex')}`;
const service = new ConfigurationStudioService();
let tenant;
let secondTenant;
let author;
let reviewer;
const outcomes = [];
const packageSigning = generateKeyPairSync('ed25519');
process.env.CONFIGURATION_PACKAGE_SIGNING_KEY_ID = `uat-configuration-${suffix}`;
process.env.CONFIGURATION_PACKAGE_SIGNING_PRIVATE_KEY_BASE64 = packageSigning.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');

const profileDefinition = {
  contractVersion: '1.0',
  moduleKey: 'tenant-settings',
  entityKey: 'tenant-profile',
  surfaceKey: 'profile-extension',
  mode: 'EDIT',
  title: 'UAT tenant extensions',
  fields: [{ key: 'industry-code', label: 'Industry code', type: 'TEXT', component: 'text-input', required: true, readOnly: false, classification: 'INTERNAL', maxLength: 30 }],
  sections: [{ key: 'business-details', title: 'Business details', columns: 1, fieldKeys: ['industry-code'] }],
};

const applicationDefinition = {
  contractVersion: '1.0',
  moduleKey: 'tenant-apps',
  entityKey: `uat-inspections-${suffix}`.slice(0, 70),
  surfaceKey: 'inspection-form',
  mode: 'CREATE',
  title: 'UAT inspections',
  fields: [
    { key: 'reference', label: 'Reference', type: 'TEXT', component: 'text-input', required: true, readOnly: false, classification: 'INTERNAL', maxLength: 40 },
    { key: 'passed', label: 'Passed', type: 'BOOLEAN', component: 'checkbox', required: false, readOnly: false, classification: 'INTERNAL' },
    { key: 'internal-cost', label: 'Internal cost', type: 'CURRENCY', component: 'number-input', required: false, readOnly: false, classification: 'RESTRICTED', readPermission: 'configuration-sensitive:read', writePermission: 'configuration-sensitive:write', minimum: 0 },
    { key: 'status-code', label: 'Status code', type: 'SELECT', component: 'select', required: true, readOnly: false, classification: 'INTERNAL', options: [{ value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }] },
    { key: 'notes', label: 'Notes', type: 'TEXT', component: 'text-input', required: false, readOnly: false, classification: 'INTERNAL', maxLength: 100 },
    { key: 'failure-detail', label: 'Failure detail', type: 'TEXTAREA', component: 'textarea', required: false, readOnly: false, classification: 'INTERNAL', visibleWhen: { kind: 'PREDICATE', fieldKey: 'passed', operator: 'EQUALS', value: false }, requiredWhen: { kind: 'PREDICATE', fieldKey: 'passed', operator: 'EQUALS', value: false } },
    { key: 'cost-approval', label: 'Cost approval', type: 'TEXT', component: 'text-input', required: false, readOnly: false, classification: 'INTERNAL', visibleWhen: { kind: 'PREDICATE', fieldKey: 'internal-cost', operator: 'GREATER_THAN', value: 100 } },
  ],
  sections: [{ key: 'inspection', title: 'Inspection', columns: 2, fieldKeys: ['reference', 'passed', 'internal-cost', 'status-code', 'notes', 'failure-detail', 'cost-approval'] }],
};

async function publishAndActivate(definition) {
  const idempotencyKey = `draft-${randomBytes(12).toString('hex')}`;
  const draft = await service.createChangeSet(tenant.id, author.id, { definition, reason: 'Isolated Configuration Studio certification', idempotencyKey });
  assert.equal(draft.status, 'VALIDATED');
  const replay = await service.createChangeSet(tenant.id, author.id, { definition, reason: 'Isolated Configuration Studio certification', idempotencyKey });
  assert.equal(replay.id, draft.id);
  const submitted = await service.submit(tenant.id, author.id, draft.id, { reason: 'Submit compiled configuration', expectedVersion: draft.version });
  await assert.rejects(() => service.approve(tenant.id, author.id, draft.id, { reason: 'Self approval must fail', expectedVersion: submitted.version }), /author cannot approve/i);
  const approved = await service.approve(tenant.id, reviewer.id, draft.id, { reason: 'Independent UAT approval', expectedVersion: submitted.version });
  const published = await service.publish(tenant.id, reviewer.id, draft.id, { reason: 'Publish reviewed checksum', expectedVersion: approved.version });
  const activation = await service.activate(tenant.id, reviewer.id, { publishedVersionId: published.id, environmentKey: 'local-uat', cohortKey: 'all-users', reason: 'Activate isolated UAT version', idempotencyKey: `activate-${randomBytes(12).toString('hex')}` });
  const runtime = await service.runtimeManifest(tenant.id, definition.moduleKey, definition.entityKey, definition.surfaceKey, 'local-uat', 'all-users', ['*']);
  assert.equal(runtime.checksum, published.checksum);
  assert.equal(runtime.publishedVersionId, published.id);
  assert.equal(activation.publishedVersionId, published.id);
  return published;
}

try {
  const registeredSurfaces = service.listSurfaces();
  assert.deepEqual(
    registeredSurfaces.map((surface) => surface.registrationKey),
    [
      'tenant-profile-extension',
      'tenant-record-application',
      'ar-customer-record',
      'ar-invoice-draft',
    ],
  );
  const arSurfaces = registeredSurfaces.filter(
    (surface) => surface.moduleKey === 'accounts-receivable',
  );
  assert.equal(arSurfaces.length, 2);
  assert.ok(arSurfaces.every((surface) => surface.authoringEnabled === false));
  assert.ok(arSurfaces.every((surface) => surface.coreFields.length > 0));
  outcomes.push('control-plane-surface-registry-is-authoritative');

  const [staleTenants, staleUsers] = await Promise.all([
    prisma.tenant.findMany({ where: { slug: { startsWith: 'uat-config-' }, status: { not: 'CANCELLED' } }, select: { id: true } }),
    prisma.user.findMany({ where: { email: { startsWith: 'uat.config.' }, status: { not: 'DEACTIVATED' } }, select: { id: true } }),
  ]);
  await prisma.$transaction([
    prisma.tenantMember.updateMany({ where: { OR: [{ tenantId: { in: staleTenants.map((item) => item.id) } }, { userId: { in: staleUsers.map((item) => item.id) } }] }, data: { status: 'SUSPENDED' } }),
    prisma.tenant.updateMany({ where: { id: { in: staleTenants.map((item) => item.id) } }, data: { status: 'CANCELLED', features: [] } }),
    prisma.user.updateMany({ where: { id: { in: staleUsers.map((item) => item.id) } }, data: { status: 'DEACTIVATED' } }),
  ]);
  [author, reviewer] = await prisma.$transaction([
    prisma.user.create({ data: { email: `uat.config.author.${suffix}@gigalibs.invalid`, name: 'UAT Configuration Author', status: 'ACTIVE' } }),
    prisma.user.create({ data: { email: `uat.config.reviewer.${suffix}@gigalibs.invalid`, name: 'UAT Configuration Reviewer', status: 'ACTIVE' } }),
  ]);
  [tenant, secondTenant] = await prisma.$transaction([
    prisma.tenant.create({ data: { slug: `uat-config-${suffix}`.slice(0, 63), name: 'UAT Configuration Tenant', status: 'ACTIVE', features: ['dynamic-forms'] } }),
    prisma.tenant.create({ data: { slug: `uat-config-other-${suffix}`.slice(0, 63), name: 'UAT Configuration Isolation Tenant', status: 'ACTIVE' } }),
  ]);
  await prisma.tenantMember.createMany({ data: [
    { tenantId: tenant.id, userId: author.id, role: 'TENANT_ADMIN', status: 'ACTIVE' },
    { tenantId: tenant.id, userId: reviewer.id, role: 'TENANT_ADMIN', status: 'ACTIVE' },
  ] });

  const profileVersion = await publishAndActivate(profileDefinition);
  outcomes.push('draft-compile-maker-checker-publish-activate-runtime');
  await assert.rejects(() => service.runtimeManifest(secondTenant.id, 'tenant-settings', 'tenant-profile', 'profile-extension', 'local-uat', 'all-users', ['*']), /No active configuration/i);
  outcomes.push('cross-tenant-runtime-denied');

  const profileDefinitionV2 = {
    ...profileDefinition,
    title: 'UAT tenant extensions v2',
    fields: [...profileDefinition.fields, { key: 'region-code', label: 'Region code', type: 'TEXT', component: 'text-input', required: false, readOnly: false, classification: 'INTERNAL', maxLength: 20 }],
    sections: [{ ...profileDefinition.sections[0], fieldKeys: ['industry-code', 'region-code'] }],
  };
  const profileVersionV2 = await publishAndActivate(profileDefinitionV2);
  const rollback = await service.rollback(tenant.id, reviewer.id, { publishedVersionId: profileVersion.id, environmentKey: 'local-uat', cohortKey: 'all-users', reason: 'Rehearse explicit last-good rollback', idempotencyKey: `rollback-${randomBytes(12).toString('hex')}` });
  assert.equal(rollback.publishedVersionId, profileVersion.id);
  await assert.rejects(() => service.rollback(tenant.id, reviewer.id, { publishedVersionId: profileVersionV2.id, environmentKey: 'local-uat', cohortKey: 'all-users', reason: 'Forward activation is not rollback', idempotencyKey: `rollback-${randomBytes(12).toString('hex')}` }), /older published version/i);
  outcomes.push('explicit-last-good-rollback-and-forward-target-denied');

  const savedValues = await service.saveExtensionValues(tenant.id, author.id, 'tenant-profile', tenant.id, { publishedVersionId: profileVersion.id, expectedVersion: 0, values: { 'industry-code': 'MANUFACTURING' }, reason: 'Persist UAT tenant extension', idempotencyKey: `values-${randomBytes(12).toString('hex')}` }, ['*']);
  assert.deepEqual(savedValues.values, { 'industry-code': 'MANUFACTURING' });
  await assert.rejects(() => service.saveExtensionValues(tenant.id, author.id, 'tenant-profile', tenant.id, { publishedVersionId: profileVersionV2.id, expectedVersion: savedValues.version, values: { 'industry-code': 'LOGISTICS' }, reason: 'Inactive manifest write must fail', idempotencyKey: `values-${randomBytes(12).toString('hex')}` }, ['*']), /manifest is not active/i);
  await assert.rejects(() => service.saveExtensionValues(tenant.id, author.id, 'tenant-profile', secondTenant.id, { publishedVersionId: profileVersion.id, expectedVersion: 0, values: { 'industry-code': 'INVALID' }, reason: 'Cross tenant owner test', idempotencyKey: `values-${randomBytes(12).toString('hex')}` }, ['*']), /owner is not registered/i);
  outcomes.push('version-bound-extension-values-and-owner-boundary');

  const incompatibleProfileDefinition = {
    ...profileDefinition,
    title: 'UAT incompatible tenant extensions',
    fields: [],
    sections: [],
  };
  const incompatibleDraft = await service.createChangeSet(tenant.id, author.id, { definition: incompatibleProfileDefinition, reason: 'Evaluate removal against persisted values', idempotencyKey: `impact-${randomBytes(12).toString('hex')}` });
  const impact = await service.changeSetImpact(tenant.id, incompatibleDraft.id);
  assert.equal(impact.classification, 'BREAKING');
  assert.equal(impact.incompatible.extensionValues, 1);
  assert.equal(impact.activationAllowed, false);
  assert.deepEqual(impact.incompatible.samples[0].fieldKeys, ['industry-code']);
  const incompatibleSubmitted = await service.submit(tenant.id, author.id, incompatibleDraft.id, { reason: 'Submit impact-tested change', expectedVersion: incompatibleDraft.version });
  const incompatibleApproved = await service.approve(tenant.id, reviewer.id, incompatibleDraft.id, { reason: 'Approve for activation guard certification', expectedVersion: incompatibleSubmitted.version });
  const incompatiblePublished = await service.publish(tenant.id, reviewer.id, incompatibleDraft.id, { reason: 'Publish without activating unsafe definition', expectedVersion: incompatibleApproved.version });
  await assert.rejects(() => service.activate(tenant.id, reviewer.id, { publishedVersionId: incompatiblePublished.id, environmentKey: 'local-uat', cohortKey: 'all-users', reason: 'Unsafe activation must be denied', idempotencyKey: `impact-${randomBytes(12).toString('hex')}` }), /persisted records are incompatible/i);
  outcomes.push('record-aware-impact-and-unsafe-activation-denied');

  const appVersion = await publishAndActivate(applicationDefinition);
  const apps = await service.listRuntimeApplications(tenant.id, ['*']);
  assert.ok(apps.some((app) => app.entityKey === applicationDefinition.entityKey));
  const restrictedApps = await service.listRuntimeApplications(tenant.id, ['configuration-apps:read']);
  const restrictedManifest = restrictedApps.find((app) => app.entityKey === applicationDefinition.entityKey).manifest;
  assert.equal(restrictedManifest.fields.some((field) => field.key === 'internal-cost'), false);
  assert.equal(restrictedManifest.fields.some((field) => field.key === 'cost-approval'), false);
  await assert.rejects(() => service.createApplicationRecord(tenant.id, author.id, applicationDefinition.entityKey, { publishedVersionId: appVersion.id, values: { reference: 'INS-CONDITIONAL', passed: false, 'status-code': 'open' }, reason: 'Conditional requiredness denial test', idempotencyKey: `record-${randomBytes(12).toString('hex')}` }, ['*']), /failed validation/i);
  const record = await service.createApplicationRecord(tenant.id, author.id, applicationDefinition.entityKey, { publishedVersionId: appVersion.id, values: { reference: 'INS-001', passed: true, 'internal-cost': 125, 'status-code': 'open', notes: 'requires review' }, reason: 'Create UAT application record', idempotencyKey: `record-${randomBytes(12).toString('hex')}` }, ['*']);
  assert.equal((await service.listApplicationRecords(tenant.id, applicationDefinition.entityKey, ['*'])).records.length, 1);
  const restrictedRecords = (await service.listApplicationRecords(tenant.id, applicationDefinition.entityKey, ['configuration-apps:read'])).records;
  assert.equal(Object.prototype.hasOwnProperty.call(restrictedRecords[0].values, 'internal-cost'), false);
  await assert.rejects(() => service.updateApplicationRecord(tenant.id, author.id, applicationDefinition.entityKey, record.id, { publishedVersionId: appVersion.id, expectedVersion: record.version, values: { 'internal-cost': 250 }, reason: 'Unauthorized sensitive write test', idempotencyKey: `record-${randomBytes(12).toString('hex')}` }, ['configuration-apps:write']), /cannot be changed/i);
  const updated = await service.updateApplicationRecord(tenant.id, author.id, applicationDefinition.entityKey, record.id, { publishedVersionId: appVersion.id, expectedVersion: record.version, values: { reference: 'INS-001-R', passed: false, 'failure-detail': 'Seal failed inspection' }, reason: 'Update UAT application record', idempotencyKey: `record-${randomBytes(12).toString('hex')}` }, ['configuration-apps:read', 'configuration-apps:write']);
  assert.equal(updated.values['internal-cost'], 125);
  const incompatibleApplicationDefinition = {
    ...applicationDefinition,
    title: 'UAT incompatible inspections',
    fields: [
      ...applicationDefinition.fields.map((field) => {
        if (field.key === 'reference') return { ...field, type: 'INTEGER', component: 'number-input', maxLength: undefined };
        if (field.key === 'passed') return { ...field, required: true };
        if (field.key === 'status-code') return { ...field, options: [{ value: 'closed', label: 'Closed' }] };
        if (field.key === 'notes') return { ...field, maxLength: 3 };
        return field;
      }),
      { key: 'mandatory-code', label: 'Mandatory code', type: 'TEXT', component: 'text-input', required: true, readOnly: false, classification: 'INTERNAL' },
    ],
    sections: [{ ...applicationDefinition.sections[0], fieldKeys: [...applicationDefinition.sections[0].fieldKeys, 'mandatory-code'] }],
  };
  const appImpactDraft = await service.createChangeSet(tenant.id, author.id, { definition: incompatibleApplicationDefinition, reason: 'Inspect all breaking field change categories', idempotencyKey: `impact-${randomBytes(12).toString('hex')}` });
  const appImpact = await service.changeSetImpact(tenant.id, appImpactDraft.id);
  const appImpactKinds = new Set(appImpact.changes.map((change) => change.kind));
  assert.ok(appImpactKinds.has('TYPE_CHANGED'));
  assert.ok(appImpactKinds.has('REQUIRED_ADDED'));
  assert.ok(appImpactKinds.has('OPTIONS_REMOVED'));
  assert.ok(appImpactKinds.has('CONSTRAINT_TIGHTENED'));
  assert.ok(appImpactKinds.has('FIELD_ADDED'));
  assert.equal(appImpact.incompatible.configurationRecords, 1);
  assert.equal(appImpact.activationAllowed, false);
  await assert.rejects(() => service.updateApplicationRecord(tenant.id, author.id, applicationDefinition.entityKey, record.id, { publishedVersionId: appVersion.id, expectedVersion: record.version, values: { reference: 'STALE', passed: true }, reason: 'Stale version test', idempotencyKey: `record-${randomBytes(12).toString('hex')}` }, ['*']), /changed; reload/i);
  await service.deleteApplicationRecord(tenant.id, author.id, applicationDefinition.entityKey, record.id, { expectedVersion: updated.version, reason: 'Delete UAT application record', idempotencyKey: `record-${randomBytes(12).toString('hex')}` });
  assert.equal((await service.listApplicationRecords(tenant.id, applicationDefinition.entityKey, ['*'])).records.length, 0);
  outcomes.push('tenant-app-conditional-validation-field-security-create-update-conflict-soft-delete');

  const exportedPackage = await service.exportPackage(tenant.id, reviewer.id, { publishedVersionIds: [profileVersion.id, appVersion.id], reason: 'Export definition-only UAT package', idempotencyKey: `package-${randomBytes(12).toString('hex')}` });
  const imported = await service.importPackage(tenant.id, author.id, { package: exportedPackage, reason: 'Import verified package as reviewed drafts', idempotencyKey: `package-${randomBytes(12).toString('hex')}` });
  assert.equal(imported.importedChangeSets.length, 2);
  assert.ok(imported.importedChangeSets.every((item) => item.status === 'VALIDATED'));
  const tamperedPackage = structuredClone(exportedPackage);
  tamperedPackage.payload.definitions[0].definition.title = 'Tampered title';
  await assert.rejects(() => service.importPackage(tenant.id, author.id, { package: tamperedPackage, reason: 'Tampered package rejection test', idempotencyKey: `package-${randomBytes(12).toString('hex')}` }), /checksum is invalid/i);
  outcomes.push('signed-definition-package-export-import-and-tamper-denial');

  const [auditCount, outboxCount] = await Promise.all([
    prisma.auditLog.count({ where: { tenantId: tenant.id, resource: { startsWith: 'configuration-' } } }),
    prisma.controlOutboxEvent.count({ where: { tenantId: tenant.id, eventType: { startsWith: 'configuration.' } } }),
  ]);
  assert.ok(auditCount >= 10);
  assert.ok(outboxCount >= 6);
  outcomes.push('audit-and-outbox-evidence');

  console.log(JSON.stringify({ certification: 'WI-OI-039-configuration-studio', database: 'PostgreSQL', testData: 'isolated-attributed-and-deactivated', outcomes }, null, 2));
} finally {
  const tenantIds = [tenant?.id, secondTenant?.id].filter(Boolean);
  const userIds = [author?.id, reviewer?.id].filter(Boolean);
  if (tenantIds.length > 0 || userIds.length > 0) {
    await prisma.$transaction([
      prisma.tenantMember.updateMany({ where: { OR: [{ tenantId: { in: tenantIds } }, { userId: { in: userIds } }] }, data: { status: 'SUSPENDED' } }),
      prisma.tenant.updateMany({ where: { id: { in: tenantIds } }, data: { status: 'CANCELLED', features: [] } }),
      prisma.user.updateMany({ where: { id: { in: userIds } }, data: { status: 'DEACTIVATED' } }),
    ]);
  }
  await prisma.$disconnect();
}
