import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';

const root = new URL('../', import.meta.url).pathname;
const profilePath = join(
  root,
  'config/deployment-profiles/configuration-local-development-v1.json',
);
const composePath = join(root, 'infra/compose/compose.yaml');
const envExamplePath = join(root, 'infra/compose/.env.example');
const runtimeConfigPath = join(root, 'apps/playground-api/src/config/runtime-config.ts');
const dockerfilePath = join(root, 'infra/compose/docker/Dockerfile');
const dockerWorkspacePath = join(root, 'infra/compose/docker/pnpm-workspace.yaml');
const canonicalWorkspacePath = join(root, 'pnpm-workspace.yaml');
const apiControllerPath = join(root, 'apps/playground-api/src/platform.controller.ts');
const webLivePath = join(root, 'apps/workflow-platform/app/api/health/live/route.ts');
const webReadyPath = join(root, 'apps/workflow-platform/app/api/health/ready/route.ts');
const webConfigPath = join(root, 'apps/workflow-platform/next.config.mjs');
const databasePackagePath = join(root, 'packages/db/package.json');
const migrationsRuntimePackagePath = join(root, 'packages/db-migrations-runtime/package.json');
const migrationsRuntimeConfigPath = join(root, 'packages/db-migrations-runtime/prisma.config.mjs');
const prismaEngineCopyPath = join(root, 'packages/db/scripts/copy-prisma-engines.mjs');
const imageBuildScriptPath = join(root, 'infra/compose/scripts/build-images.sh');
const dockerIgnorePath = join(root, '.dockerignore');

const profile = JSON.parse(readFileSync(profilePath, 'utf8'));
const composeText = readFileSync(composePath, 'utf8');
const compose = yaml.load(composeText);
const envExample = readFileSync(envExamplePath, 'utf8');
const runtimeConfig = readFileSync(runtimeConfigPath, 'utf8');
const dockerfile = readFileSync(dockerfilePath, 'utf8');
const dockerWorkspace = yaml.load(readFileSync(dockerWorkspacePath, 'utf8'));
const canonicalWorkspace = yaml.load(readFileSync(canonicalWorkspacePath, 'utf8'));
const apiController = readFileSync(apiControllerPath, 'utf8');
const webLiveRoute = readFileSync(webLivePath, 'utf8');
const webReadyRoute = readFileSync(webReadyPath, 'utf8');
const webConfig = readFileSync(webConfigPath, 'utf8');
const databasePackage = JSON.parse(readFileSync(databasePackagePath, 'utf8'));
const migrationsRuntimePackage = JSON.parse(readFileSync(migrationsRuntimePackagePath, 'utf8'));
const migrationsRuntimeConfig = readFileSync(migrationsRuntimeConfigPath, 'utf8');
const prismaEngineCopy = readFileSync(prismaEngineCopyPath, 'utf8');
const imageBuildScript = readFileSync(imageBuildScriptPath, 'utf8');
const dockerIgnore = readFileSync(dockerIgnorePath, 'utf8');
const violations = [];

expect(profile.contractVersion === 1, 'PROFILE_VERSION', 'contractVersion must be 1.');
expect(
  profile.profileKey === 'configuration-local-development-v1',
  'PROFILE_KEY',
  'The current profile key must be configuration-local-development-v1.',
);
expect(
  profile.executionClass === 'LOCAL_DEVELOPMENT',
  'EXECUTION_CLASS',
  'The current execution class must be LOCAL_DEVELOPMENT.',
);
expect(
  profile.dependencyAuthority?.redis?.required === false,
  'REDIS_AUTHORITY',
  'Redis must not be a Configuration profile dependency.',
);

const services = compose?.services ?? {};
const actualServiceNames = Object.keys(services).sort();
const expectedServiceNames = Object.keys(profile.components).sort();
expect(
  JSON.stringify(actualServiceNames) === JSON.stringify(expectedServiceNames),
  'SERVICE_SET',
  `Compose services must be exactly: ${expectedServiceNames.join(', ')}.`,
);

for (const [serviceName, component] of Object.entries(profile.components)) {
  const service = services[serviceName];
  if (!service) continue;
  const environment = normalizeEnvironment(service.environment);
  const allowed = new Set([
    ...(component.requiredEnvironment ?? []),
    ...(component.optionalEnvironment ?? []),
  ]);

  for (const key of component.requiredEnvironment ?? []) {
    expect(
      Object.hasOwn(environment, key),
      'ENV_REQUIRED',
      `${serviceName} must map required environment key ${key}.`,
    );
  }
  for (const key of Object.keys(environment)) {
    expect(
      allowed.has(key),
      'ENV_UNKNOWN',
      `${serviceName} maps uncontracted environment key ${key}.`,
    );
  }
  for (const forbidden of profile.forbiddenEnvironment ?? []) {
    expect(
      !Object.hasOwn(environment, forbidden),
      'ENV_FORBIDDEN',
      `${serviceName} must not map obsolete/unused key ${forbidden}.`,
    );
  }

  expect(
    service.pull_policy === profile.artifactPolicy.pullPolicy,
    'PULL_POLICY',
    `${serviceName} must use pull_policy ${profile.artifactPolicy.pullPolicy}.`,
  );
  expect(
    component.dockerfile === 'infra/compose/docker/Dockerfile' &&
      dockerfile.includes(`AS ${component.target}`),
    'IMAGE_TARGET',
    `${serviceName} must have a checked-in Docker target.`,
  );
  expect(
    String(service.image ?? '').includes(`\${${component.imageInput}:?`),
    'IMAGE_INPUT',
    `${serviceName} image must fail closed through ${component.imageInput}.`,
  );
  expect(
    service.labels?.['com.gigalibs.profile-key'] === '${PROFILE_KEY:?PROFILE_KEY is required}',
    'PROFILE_LABEL',
    `${serviceName} must carry the fail-closed profile-key label.`,
  );
  expect(
    service.labels?.['org.opencontainers.image.revision'] ===
      '${SOURCE_REVISION:?SOURCE_REVISION is required}',
    'REVISION_LABEL',
    `${serviceName} must carry the source-revision label.`,
  );
  expect(
    service.labels?.['com.gigalibs.source-state-sha256'] ===
      '${SOURCE_STATE_SHA256:?SOURCE_STATE_SHA256 is required}',
    'SOURCE_STATE_LABEL',
    `${serviceName} must carry the source-state fingerprint.`,
  );
}

expect(
  dockerfile.includes(`FROM ${profile.artifactPolicy.baseImage}`),
  'BASE_IMAGE_PIN',
  'The application base image must use the contract-pinned digest.',
);
expect(
  dockerfile.includes(`FROM ${profile.artifactPolicy.finalRuntimeImage} AS api`) &&
    dockerfile.includes(`FROM ${profile.artifactPolicy.finalRuntimeImage} AS web`) &&
    dockerfile.includes(`FROM ${profile.artifactPolicy.finalRuntimeImage} AS migrations`),
  'FINAL_RUNTIME_PIN',
  'All three shipped images must use the contract-pinned final runtime digest.',
);
expect(
  profile.artifactPolicy.runtimeUidGid === '65532:65532' &&
    dockerfile.includes('USER 65532:65532') &&
    dockerfile.includes('--chown=65532:65532'),
  'FINAL_RUNTIME_NONROOT',
  'All shipped images must use the reviewed distroless non-root UID/GID.',
);
for (const [packageName, packageVersion] of Object.entries(
  profile.artifactPolicy.baseOsPackages ?? {},
)) {
  expect(
    dockerfile.includes(`${packageName}=${packageVersion}`),
    'BASE_OS_PACKAGE_PIN',
    `The Dockerfile must pin ${packageName}=${packageVersion}.`,
  );
}
expect(
  dockerfile.includes('COPY infra/compose/docker/pnpm-workspace.yaml ./pnpm-workspace.yaml'),
  'BOUNDED_WORKSPACE',
  'The local image build must replace the broad monorepo workspace with its reviewed dependency closure.',
);
for (const requiredWorkspace of [
  'apps/playground-api',
  'apps/workflow-platform',
  'packages/audit-core',
  'packages/db',
  'packages/db-migrations-runtime',
]) {
  expect(
    dockerWorkspace?.packages?.includes(requiredWorkspace),
    'WORKSPACE_REQUIRED',
    `The Docker workspace must include ${requiredWorkspace}.`,
  );
}
// WI-OI-038: only the CMMS core API enters the image workspace, for its own module image; the rest of the
// CMMS tree (import/export, prototypes) stays out and the control-plane build never filters it in. WI-OI-083b adds
// the CMMS web package (its screens and API client, built into the web image).
expect(
  JSON.stringify((dockerWorkspace?.packages ?? []).filter((entry) => entry.includes('physical-operations-cmms'))) ===
    JSON.stringify(['modules/physical-operations-cmms/apps/api', 'modules/physical-operations-cmms/web']),
  'FROZEN_SCOPE_INCLUDED',
  'Only the CMMS core API and web package may enter the image workspace.',
);
expect(
  JSON.stringify(Object.keys(dockerWorkspace?.allowBuilds ?? {}).sort()) ===
    JSON.stringify([...profile.artifactPolicy.allowedLifecycleBuilds].sort()) &&
    Object.values(dockerWorkspace?.allowBuilds ?? {}).every((value) => value === true),
  'LIFECYCLE_BUILD_ALLOWLIST',
  'Docker dependency lifecycle scripts must match the exact reviewed allowlist.',
);
const expectedOverrides = {
  '@prisma/config@6.19.3>deepmerge-ts': '8.0.2',
  '@nestjs/platform-express@11.2.3>multer': '2.4.0',
  'next@15.5.24>postcss': '8.5.28',
};
expect(
  JSON.stringify(dockerWorkspace?.overrides ?? {}) === JSON.stringify(expectedOverrides) &&
    JSON.stringify(canonicalWorkspace?.overrides ?? {}) === JSON.stringify(expectedOverrides),
  'SECURITY_OVERRIDE_DRIFT',
  'Canonical and bounded workspaces must retain the reviewed fixed transitive dependency paths.',
);
expect(
  migrationsRuntimePackage.name === '@gigalibs/db-migrations-runtime' &&
    migrationsRuntimePackage.dependencies?.prisma === '6.19.3' &&
    !migrationsRuntimePackage.dependencies?.['@gigalibs/db'] &&
    !migrationsRuntimePackage.devDependencies &&
    migrationsRuntimeConfig.includes("join(runtimeRoot, 'database')") &&
    dockerfile.includes('pnpm install --frozen-lockfile --prod --no-optional') &&
    dockerfile.includes(
      'pnpm --filter @gigalibs/db-migrations-runtime deploy --prod --no-optional --legacy',
    ) &&
    dockerfile.includes(
      'COPY packages/db/schema.prisma /output/migrations/database/schema.prisma',
    ) &&
    dockerfile.includes('COPY packages/db/migrations/ /output/migrations/database/migrations/') &&
    dockerfile.includes('COPY --from=migrations-build --chown=65532:65532 /output/migrations/ ./'),
  'MIGRATIONS_RUNTIME_PRUNING',
  'The migrations image must deploy only the production migration CLI plus the canonical schema and migrations.',
);
expect(
  profile.artifactPolicy.vulnerabilityScanner === 'trivy@0.74.0' &&
    profile.artifactPolicy.vulnerabilityPolicy?.maximumCritical === 0 &&
    profile.artifactPolicy.vulnerabilityPolicy?.maximumHigh === 0 &&
    profile.artifactPolicy.vulnerabilityPolicy?.ignoreUnfixed === false,
  'VULNERABILITY_POLICY',
  'The local profile must fail closed on every Critical or High Trivy finding.',
);
expect(
  dockerfile.includes('--sort --workspace-concurrency=1'),
  'TOPOLOGICAL_BUILD',
  'Workspace package builds must run in deterministic topological order.',
);
expect(
  databasePackage.scripts?.build?.includes('node scripts/copy-prisma-engines.mjs') &&
    prismaEngineCopy.includes('Prisma generation did not produce a native query engine'),
  'PRISMA_ENGINE_PACKAGE',
  'The database package build must fail closed and copy the generated native Prisma engine into dist.',
);
expect(
  imageBuildScript.includes(
    'node_modules/@gigalibs/db/dist/generated/prisma/.*query_engine.*\\.node',
  ),
  'PRISMA_ENGINE_IMAGE_CHECK',
  'The image build must verify that the deployable API contains the Prisma engine.',
);
expect(
  webConfig.includes('fileURLToPath(import.meta.url)') &&
    imageBuildScript.includes("grep -qx 'app/next.config.mjs'") &&
    imageBuildScript.includes("grep -qx 'app/next.config.ts'"),
  'WEB_RUNTIME_CONFIG',
  'The production web image must use native ESM configuration and must not require TypeScript at startup.',
);
expect(
  dockerfile.includes('CMD ["dist/main.js"]') &&
    dockerfile.includes('CMD ["node_modules/next/dist/bin/next"') &&
    dockerfile.includes('CMD ["node_modules/prisma/build/index.js"'),
  'DISTROLESS_ENTRYPOINTS',
  'Shipped images must use direct JavaScript entrypoints compatible with a shell-free runtime.',
);
expect(
  dockerIgnore.includes('**/.env') &&
    dockerIgnore.includes('**/.env.*') &&
    imageBuildScript.includes('\\.env(\\.[^/]*)?$'),
  'ENV_FILE_IMAGE_EXCLUSION',
  'All nested environment files must be excluded from build context and rejected in final images.',
);
expect(
  !/^FROM\s+[^\s]+:(?:latest|[0-9]+(?:\.[0-9]+)*)\s/im.test(dockerfile),
  'FLOATING_BASE_IMAGE',
  'Every Dockerfile FROM must be digest-pinned.',
);
expect(
  apiController.includes("@Get('health')") && apiController.includes("@Get('ready')"),
  'API_PROBE_SOURCE',
  'API liveness and readiness controller routes must exist.',
);
expect(
  webLiveRoute.includes("status: 'ok'") && !webLiveRoute.includes('controlPlaneUrl'),
  'WEB_LIVENESS_SOURCE',
  'Web liveness must not depend on the control plane.',
);
expect(
  webReadyRoute.includes("controlPlaneUrl('/api/v1/ready')") &&
    webReadyRoute.includes("status: 'not-ready'") &&
    webReadyRoute.includes('status: 503'),
  'WEB_READINESS_SOURCE',
  'Web readiness must fail closed on control-plane readiness.',
);

expect(
  services.api?.depends_on?.migrations?.condition === 'service_completed_successfully',
  'MIGRATION_GATE',
  'API startup must wait for successful migration completion.',
);
expect(
  services.web?.depends_on?.api?.condition === 'service_healthy',
  'API_GATE',
  'Web startup must wait for API readiness.',
);
expect(
  JSON.stringify(services.api?.healthcheck?.test ?? []).includes(profile.components.api.readiness),
  'API_PROBE',
  `API healthcheck must call ${profile.components.api.readiness}.`,
);
expect(
  JSON.stringify(services.web?.healthcheck?.test ?? []).includes(profile.components.web.readiness),
  'WEB_PROBE',
  `Web healthcheck must call ${profile.components.web.readiness}.`,
);

for (const prohibitedService of [
  'postgres',
  'control-postgres',
  'minio',
  'redis',
  'control-redis',
]) {
  expect(
    !Object.hasOwn(services, prohibitedService),
    'DEPENDENCY_DUPLICATED',
    `${prohibitedService} must remain owned by docker/docker-compose.dev.yml.`,
  );
}

const requiredByRuntimeConfig = new Set(['CORS_ORIGINS']);
for (const match of runtimeConfig.matchAll(
  /require(?:String|Port|PositiveInteger|Boolean|HostAllowlist|PortAllowlist)\('([^']+)'\)/g,
)) {
  requiredByRuntimeConfig.add(match[1]);
}
for (const key of requiredByRuntimeConfig) {
  expect(
    profile.components.api.requiredEnvironment.includes(key),
    'SOURCE_DRIFT',
    `API source requires ${key}, but the local profile contract does not.`,
  );
}

const declaredExampleKeys = new Set(
  envExample
    .split(/\r?\n/)
    .filter((line) => /^[A-Z][A-Z0-9_]*=/.test(line))
    .map((line) => line.slice(0, line.indexOf('='))),
);
const composeInputs = new Set(
  [...composeText.matchAll(/\$\{([A-Z][A-Z0-9_]*)(?::\?|-)/g)].map((match) => match[1]),
);
for (const input of composeInputs) {
  expect(
    declaredExampleKeys.has(input),
    'ENV_EXAMPLE_DRIFT',
    `.env.example must declare Compose input ${input}.`,
  );
}
for (const secret of profile.secretInputs ?? []) {
  expect(
    declaredExampleKeys.has(secret),
    'SECRET_EXAMPLE_DRIFT',
    `.env.example must declare secret input ${secret} without a working value.`,
  );
}

expect(
  services.api?.environment?.CONNECTOR_HTTP_ALLOW_INSECURE === 'false' &&
    services.api?.environment?.CONNECTOR_HTTP_ALLOW_PRIVATE_NETWORKS === 'false' &&
    services.api?.environment?.CONNECTOR_DATABASE_ALLOW_PRIVATE_NETWORKS === 'false',
  'CONNECTOR_DENY_DEFAULT',
  'Connector insecure/private-network policy must be statically deny-by-default.',
);
expect(
  services.api?.environment?.STORAGE_ALLOW_INSECURE === 'true',
  'LOCAL_STORAGE_CLASS',
  'The Local Development MinIO exception must be explicit.',
);
expect(
  runtimeConfig.includes('configurationRuntimeEnvironmentKey: requireConfigurationKey(') &&
    runtimeConfig.includes("'CONFIGURATION_RUNTIME_ENVIRONMENT_KEY'") &&
    services.api?.environment?.CONFIGURATION_RUNTIME_ENVIRONMENT_KEY ===
      '${CONFIGURATION_RUNTIME_ENVIRONMENT_KEY:?CONFIGURATION_RUNTIME_ENVIRONMENT_KEY is required}',
  'CONFIGURATION_RUNTIME_SCOPE',
  'The API must validate and receive the required server-owned Configuration runtime environment key.',
);
expect(
  services.web?.environment?.COOKIE_SECURE === 'false',
  'LOCAL_COOKIE_CLASS',
  'The loopback HTTP cookie exception must be explicit in the Local Development profile.',
);

if (violations.length > 0) {
  console.error(
    JSON.stringify({ status: 'failed', profile: profile.profileKey, violations }, null, 2),
  );
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: 'passed',
      profile: profile.profileKey,
      executionClass: profile.executionClass,
      services: actualServiceNames,
      requiredApiEnvironmentKeys: profile.components.api.requiredEnvironment.length,
      deferredExternal: profile.deferredExternal,
    },
    null,
    2,
  ),
);

function normalizeEnvironment(environment) {
  if (!environment) return {};
  if (!Array.isArray(environment)) return environment;
  return Object.fromEntries(
    environment.map((entry) => {
      const separator = entry.indexOf('=');
      return separator === -1
        ? [entry, null]
        : [entry.slice(0, separator), entry.slice(separator + 1)];
    }),
  );
}

function expect(condition, code, message) {
  if (!condition) violations.push({ code, message });
}
