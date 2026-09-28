import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const javaSourcePath = resolve(
  repositoryRoot,
  'clients/configuration-java/src/io/gigalibs/configuration/ConfigurationManifestClient.java',
);
const manifestSchemaPath = resolve(
  repositoryRoot,
  'docs/contracts/configuration-studio/configuration-manifest.schema.json',
);
const openApiPath = resolve(repositoryRoot, 'docs/contracts/configuration-studio/openapi.yaml');
const evidencePath = process.env.CONFIGURATION_JAVA_EVIDENCE_PATH?.trim();

if (process.env.NODE_ENV === 'production') {
  throw new Error('Configuration Java-client certification must not run in production.');
}

function execute(command, args, { input } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (stdout.length > 1_000_000) child.kill('SIGKILL');
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      if (stderr.length > 1_000_000) child.kill('SIGKILL');
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      resolvePromise({ code, signal, stdout: stdout.trim(), stderr: stderr.trim() });
    });
    child.stdin.end(input);
  });
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

const [javaSource, manifestSchema, openApi, javacVersionResult, javaVersionResult] =
  await Promise.all([
    readFile(javaSourcePath, 'utf8'),
    readFile(manifestSchemaPath, 'utf8'),
    readFile(openApiPath, 'utf8'),
    execute('javac', ['-version']),
    execute('java', ['-version']),
  ]);
assert.equal(javacVersionResult.code, 0, javacVersionResult.stderr);
assert.equal(javaVersionResult.code, 0, javaVersionResult.stderr);
const javacVersion = `${javacVersionResult.stdout}\n${javacVersionResult.stderr}`.trim();
const javaVersion = `${javaVersionResult.stdout}\n${javaVersionResult.stderr}`
  .trim()
  .split('\n')[0];
const majorMatch = javacVersion.match(/javac\s+(\d+)/);
assert.ok(majorMatch, `Unable to parse Java compiler version: ${javacVersion}`);
assert.ok(Number(majorMatch[1]) >= 11, 'Configuration Java client requires Java 11 or newer.');

const { CONFIGURATION_COMPILER_VERSION, compileConfiguration } = await import(
  '../packages/configuration-core/dist/index.js'
);

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
  key: `java-field-${index}`,
  label: `Java field ${index}`,
  type,
  component,
  required: false,
  readOnly: false,
  classification: 'INTERNAL',
  ...(type === 'SELECT' || type === 'MULTI_SELECT'
    ? { options: [{ value: 'java-option', label: 'Java option' }] }
    : {}),
}));
fieldDefinitions[1] = {
  ...fieldDefinitions[1],
  visibleWhen: {
    kind: 'PREDICATE',
    fieldKey: fieldDefinitions[0].key,
    operator: 'IS_NOT_EMPTY',
  },
};

const definition = {
  contractVersion: '1.0',
  moduleKey: 'tenant-apps',
  entityKey: 'java-portable-record',
  surfaceKey: 'custom-form',
  mode: 'EDIT',
  title: 'Java client manifest conformance',
  description: 'A real compiler fixture decoded by a dependency-free Java 11 client.',
  fields: fieldDefinitions,
  sections: [
    {
      key: 'java-fields',
      title: 'Java fields',
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
const compiled = compileConfiguration(definition);
assert.equal(compiled.valid, true);
assert.ok(compiled.manifest);
assert.equal(compiled.manifest.compilerVersion, CONFIGURATION_COMPILER_VERSION);

const runtimeResponse = {
  activationId: 'java-client-activation',
  publishedVersionId: 'java-client-version',
  activatedAt: '2026-09-16T00:00:00.000Z',
  manifest: compiled.manifest,
  checksum: compiled.manifest.checksum,
};

const classDirectory = await mkdtemp(join(tmpdir(), 'gigalibs-configuration-java-'));
let evidence;
try {
  const compileResult = await execute('javac', [
    '--release',
    '11',
    '-Xlint:all',
    '-Werror',
    '-d',
    classDirectory,
    javaSourcePath,
  ]);
  assert.equal(
    compileResult.code,
    0,
    `Java configuration client failed to compile:\n${compileResult.stderr}`,
  );

  const runClient = (payload) =>
    execute(
      'java',
      ['-cp', classDirectory, 'io.gigalibs.configuration.ConfigurationManifestClient'],
      { input: typeof payload === 'string' ? payload : JSON.stringify(payload) },
    );
  const accepted = await runClient(runtimeResponse);
  assert.equal(accepted.code, 0, accepted.stderr);
  const summary = JSON.parse(accepted.stdout);
  assert.deepEqual(summary, {
    status: 'passed',
    contractVersion: '1.0',
    compilerVersion: '1.0.0',
    fieldCount: 13,
    sectionCount: 1,
    fieldTypeCount: 13,
    componentCount: 8,
    checksum: compiled.manifest.checksum,
  });

  const negativeFixtures = [
    {
      name: 'unknown-runtime-response-property-rejected',
      payload: { ...runtimeResponse, executableCode: 'fetch("https://invalid")' },
    },
    {
      name: 'response-manifest-checksum-disagreement-rejected',
      payload: { ...runtimeResponse, checksum: `sha256:${'0'.repeat(64)}` },
    },
    {
      name: 'unknown-manifest-property-rejected',
      payload: {
        ...runtimeResponse,
        manifest: { ...runtimeResponse.manifest, executableCode: 'System.exit(0)' },
      },
    },
    {
      name: 'incompatible-field-component-rejected',
      payload: {
        ...runtimeResponse,
        manifest: {
          ...runtimeResponse.manifest,
          fields: runtimeResponse.manifest.fields.map((field, index) =>
            index === 0 ? { ...field, component: 'number-input' } : field,
          ),
        },
      },
    },
    {
      name: 'field-limit-overflow-rejected',
      payload: {
        ...runtimeResponse,
        manifest: {
          ...runtimeResponse.manifest,
          fields: Array.from({ length: 251 }, (_, index) => ({
            ...runtimeResponse.manifest.fields[0],
            key: `overflow-field-${index}`,
          })),
        },
      },
    },
    {
      name: 'self-referential-condition-rejected',
      payload: {
        ...runtimeResponse,
        manifest: {
          ...runtimeResponse.manifest,
          fields: runtimeResponse.manifest.fields.map((field, index) =>
            index === 0
              ? {
                  ...field,
                  visibleWhen: {
                    kind: 'PREDICATE',
                    fieldKey: field.key,
                    operator: 'IS_NOT_EMPTY',
                  },
                }
              : field,
          ),
        },
      },
    },
    {
      name: 'invalid-activation-timestamp-rejected',
      payload: { ...runtimeResponse, activatedAt: 'not-a-date' },
    },
    {
      name: 'duplicate-json-property-rejected',
      payload: JSON.stringify(runtimeResponse).replace(
        '{',
        '{"activationId":"duplicate-activation",',
      ),
    },
  ];
  const rejected = [];
  for (const fixture of negativeFixtures) {
    const result = await runClient(fixture.payload);
    assert.equal(result.code, 2, `${fixture.name} unexpectedly exited ${result.code}`);
    assert.match(result.stderr, /^CONFIGURATION_MANIFEST_INVALID:/);
    assert.doesNotMatch(result.stderr, /fetch\(|System\.exit/);
    rejected.push(fixture.name);
  }

  const outcomes = [
    'real-typescript-compiler-manifest-decoded-by-java-11-client',
    'all-13-field-types-and-8-components-decoded',
    'conditional-field-and-list-view-references-validated',
    ...rejected,
  ];
  evidence = {
    recordedAt: new Date().toISOString(),
    certification: 'WI-OI-039-java-client-conformance',
    javaVersion,
    javacVersion,
    contractVersion: summary.contractVersion,
    compilerVersion: summary.compilerVersion,
    fieldTypeCount: summary.fieldTypeCount,
    componentCount: summary.componentCount,
    manifestChecksum: summary.checksum,
    sourceSha256: sha256(javaSource),
    manifestSchemaSha256: sha256(manifestSchema),
    openApiSha256: sha256(openApi),
    outcomes,
    outcomeCount: outcomes.length,
    temporaryClassDirectoryRetained: false,
    limitations: [
      'This proves strict Java 11 decoding of the portable runtime-manifest response; it is not an Android, Spring, browser-rendering or live-network certification.',
      'The server remains authoritative for compilation, authorization and field-value validation.',
      'Independent API/client review and both deployment-profile journeys remain required.',
    ],
    releaseAcceptance: false,
  };
} finally {
  await rm(classDirectory, { recursive: true, force: true });
}

assert.ok(evidence);
if (evidencePath) {
  const target = resolve(repositoryRoot, evidencePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
}
console.log(JSON.stringify(evidence, null, 2));
