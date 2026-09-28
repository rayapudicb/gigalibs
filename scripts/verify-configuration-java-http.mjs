import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const decoderSourcePath = resolve(
  repositoryRoot,
  'clients/configuration-java/src/io/gigalibs/configuration/ConfigurationManifestClient.java',
);
const httpSourcePath = resolve(
  repositoryRoot,
  'clients/configuration-java/src/io/gigalibs/configuration/ConfigurationManifestHttpClient.java',
);
const runtimeManifestUrl = process.env.CONFIGURATION_RUNTIME_MANIFEST_URL?.trim();
const bearerToken = process.env.CONFIGURATION_BEARER_TOKEN?.trim();
const expectedChecksum = process.env.CONFIGURATION_EXPECTED_CHECKSUM?.trim();

if (process.env.NODE_ENV === 'production') {
  throw new Error('Configuration Java HTTP certification must not run in production.');
}
assert.ok(runtimeManifestUrl, 'CONFIGURATION_RUNTIME_MANIFEST_URL is required.');
assert.ok(bearerToken, 'CONFIGURATION_BEARER_TOKEN is required.');
assert.match(expectedChecksum ?? '', /^sha256:[a-f0-9]{64}$/);
const liveEndpoint = new URL(runtimeManifestUrl);
assert.equal(liveEndpoint.protocol, 'http:');
assert.ok(
  ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(liveEndpoint.hostname),
  'Live Java HTTP certification requires an explicitly loopback endpoint.',
);

function execute(command, args, { env = process.env } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
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
  });
}

function javaEnvironment(endpoint, token) {
  return {
    ...process.env,
    CONFIGURATION_RUNTIME_MANIFEST_URL: endpoint,
    CONFIGURATION_BEARER_TOKEN: token,
  };
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function listen(server) {
  return new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      assert.ok(address && typeof address === 'object');
      resolvePromise(address.port);
    });
  });
}

function close(server) {
  if (!server || !server.listening) return Promise.resolve();
  return new Promise((resolvePromise, reject) => {
    server.close((error) => (error ? reject(error) : resolvePromise()));
  });
}

const [decoderSource, httpSource, javacVersionResult, javaVersionResult] = await Promise.all([
  readFile(decoderSourcePath, 'utf8'),
  readFile(httpSourcePath, 'utf8'),
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
assert.ok(Number(majorMatch[1]) >= 11, 'Configuration Java HTTP client requires Java 11 or newer.');

const classDirectory = await mkdtemp(join(tmpdir(), 'gigalibs-configuration-java-http-'));
let hardeningServer;
let evidence;
try {
  const compileResult = await execute('javac', [
    '--release',
    '11',
    '-Xlint:all',
    '-Werror',
    '-d',
    classDirectory,
    decoderSourcePath,
    httpSourcePath,
  ]);
  assert.equal(
    compileResult.code,
    0,
    `Java configuration HTTP client failed to compile:\n${compileResult.stderr}`,
  );

  const runClient = (endpoint, token) =>
    execute(
      'java',
      ['-cp', classDirectory, 'io.gigalibs.configuration.ConfigurationManifestHttpClient'],
      { env: javaEnvironment(endpoint, token) },
    );

  const liveResult = await runClient(runtimeManifestUrl, bearerToken);
  assert.equal(liveResult.code, 0, liveResult.stderr);
  const liveSummary = JSON.parse(liveResult.stdout);
  assert.deepEqual(liveSummary, {
    status: 'passed',
    httpStatus: 200,
    transport: 'loopback-http',
    fieldCount: 1,
    sectionCount: 1,
    checksum: expectedChecksum,
  });

  const invalidBearerToken = randomBytes(32).toString('base64url');
  const unauthorizedResult = await runClient(runtimeManifestUrl, invalidBearerToken);
  assert.equal(unauthorizedResult.code, 3, unauthorizedResult.stderr);
  assert.match(
    unauthorizedResult.stderr,
    /^CONFIGURATION_HTTP_ERROR: code=HTTP_STATUS_UNEXPECTED status=401$/,
  );
  assert.doesNotMatch(unauthorizedResult.stderr, new RegExp(invalidBearerToken, 'u'));

  const nonLoopbackResult = await runClient(
    'http://example.invalid/api/v1/configuration/runtime/manifest?moduleKey=tenant-settings',
    randomBytes(32).toString('base64url'),
  );
  assert.equal(nonLoopbackResult.code, 4, nonLoopbackResult.stderr);
  assert.match(nonLoopbackResult.stderr, /NON_LOOPBACK_HTTP_PROHIBITED/);

  hardeningServer = createServer((request, response) => {
    const authorization = request.headers.authorization;
    if (authorization === 'Bearer redirect-certification-token') {
      response.writeHead(302, { Location: runtimeManifestUrl });
      response.end();
      return;
    }
    if (authorization === 'Bearer content-type-certification-token') {
      response.writeHead(200, { 'Content-Type': 'text/plain' });
      response.end('{}');
      return;
    }
    if (authorization === 'Bearer oversized-certification-token') {
      response.writeHead(200, {
        'Content-Type': 'application/json',
        'Content-Length': '2000001',
      });
      response.end();
      return;
    }
    response.writeHead(500, { 'Content-Type': 'application/json' });
    response.end('{}');
  });
  const hardeningPort = await listen(hardeningServer);
  const hardeningEndpoint = `http://127.0.0.1:${hardeningPort}/api/v1/configuration/runtime/manifest?moduleKey=tenant-settings`;

  const redirectResult = await runClient(hardeningEndpoint, 'redirect-certification-token');
  assert.equal(redirectResult.code, 3, redirectResult.stderr);
  assert.match(
    redirectResult.stderr,
    /^CONFIGURATION_HTTP_ERROR: code=HTTP_STATUS_UNEXPECTED status=302$/,
  );

  const contentTypeResult = await runClient(hardeningEndpoint, 'content-type-certification-token');
  assert.equal(contentTypeResult.code, 3, contentTypeResult.stderr);
  assert.match(
    contentTypeResult.stderr,
    /^CONFIGURATION_HTTP_ERROR: code=CONTENT_TYPE_INVALID status=200$/,
  );

  const oversizedResult = await runClient(hardeningEndpoint, 'oversized-certification-token');
  assert.equal(oversizedResult.code, 3, oversizedResult.stderr);
  assert.match(
    oversizedResult.stderr,
    /^CONFIGURATION_HTTP_ERROR: code=RESPONSE_TOO_LARGE status=200$/,
  );

  const outcomes = [
    'real-control-plane-bearer-runtime-manifest-decoded-by-java-11',
    'invalid-bearer-denied-without-response-body-or-token-disclosure',
    'non-loopback-cleartext-http-rejected-before-network-use',
    'redirect-not-followed',
    'non-json-response-rejected',
    'oversized-response-rejected-before-body-read',
  ];
  evidence = {
    certification: 'WI-OI-039-java-live-http-client',
    javaVersion,
    javacVersion,
    httpStatus: liveSummary.httpStatus,
    transport: liveSummary.transport,
    manifestChecksum: liveSummary.checksum,
    fieldCount: liveSummary.fieldCount,
    sectionCount: liveSummary.sectionCount,
    decoderSourceSha256: sha256(decoderSource),
    httpSourceSha256: sha256(httpSource),
    outcomes,
    outcomeCount: outcomes.length,
    temporaryClassDirectoryRetained: false,
    rawCredentialPersistedInEvidence: false,
    limitations: [
      'The live API leg is isolated loopback HTTP; the client requires HTTPS for non-loopback endpoints, but target-profile TLS and trust-chain behavior are not certified here.',
      'Redirect, content-type and response-size failures use an isolated loopback negative-test server and do not claim server implementation behavior.',
      'Consumer-specific rendering, deployment profiles and independent API/client acceptance remain required.',
    ],
    releaseAcceptance: false,
  };
} finally {
  await close(hardeningServer).catch(() => undefined);
  await rm(classDirectory, { recursive: true, force: true });
}

assert.ok(evidence, 'Java HTTP certification did not produce evidence.');
console.log(JSON.stringify(evidence, null, 2));
