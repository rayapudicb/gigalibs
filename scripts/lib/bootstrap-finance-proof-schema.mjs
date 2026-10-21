// WI-OI-120bq: install gigalibs_finance through the module migration runner on PROOF_DATABASE_URL
// so legacy WI-OI-094–118 certification scripts see migrations 1–15 (not a stale v1-only row check).
import { randomUUID } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = new URL('../../', import.meta.url).pathname;

function pgImportPath() {
  const pgDirectory = readdirSync(join(root, 'node_modules/.pnpm')).find((name) => /^pg@\d/.test(name));
  if (!pgDirectory) throw new Error('pg package not found in pnpm store');
  return join(root, 'node_modules/.pnpm', pgDirectory, 'node_modules/pg/lib/index.js');
}

/** @param {string} adminUrl superuser or migration URL on the isolated proof database */
export async function bootstrapFinanceProofSchema(adminUrl) {
  const modules = JSON.parse(readFileSync(join(root, 'infra/compose/generated/modules.json'), 'utf8'));
  const module = modules['financial-operations'];
  if (!module) throw new Error('financial-operations missing from generated modules.json');

  const listed = readFileSync(join(root, module.directory, 'db/runtime-manifest.txt'), 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
  const migrationVersion = Number(/^(\d+)_/.exec(listed.at(-1))[1]);
  if (migrationVersion !== module.migrationVersion) {
    throw new Error(
      `Finance migrationVersion ${module.migrationVersion} != runtime-manifest tail ${migrationVersion}`,
    );
  }

  const { default: pg } = await import(pgImportPath());
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    for (const extension of ['pgcrypto', 'ltree', 'btree_gist']) {
      await admin.query(`CREATE EXTENSION IF NOT EXISTS ${extension} WITH SCHEMA public`);
    }
  } finally {
    await admin.end();
  }

  const work = mkdtempSync(join(tmpdir(), 'finance-proof-bootstrap-'));
  cpSync(join(root, 'infra/compose/docker/run-module-migrations.mjs'), join(work, 'run.mjs'));
  mkdirSync(join(work, 'node_modules'));
  const pgDirectory = readdirSync(join(root, 'node_modules/.pnpm')).find((name) => /^pg@\d/.test(name));
  symlinkSync(join(root, 'node_modules/.pnpm', pgDirectory, 'node_modules/pg'), join(work, 'node_modules/pg'));

  const runtimePassword = randomUUID().replaceAll('-', '');
  const runtimeUrl = new URL(adminUrl);
  runtimeUrl.username = `${module.schema}_proof`;
  runtimeUrl.password = runtimePassword;

  const run = spawnSync(process.execPath, [join(work, 'run.mjs')], {
    encoding: 'utf8',
    env: {
      ...process.env,
      DATABASE_URL: adminUrl,
      MODULE_RUNTIME_DATABASE_URL: runtimeUrl.toString(),
      MODULE_MIGRATIONS_DIRECTORY: join(root, module.directory, 'db/migrations'),
      MODULE_SCHEMA: module.schema,
      MODULE_EXPECTED_MIGRATION_VERSION: String(migrationVersion),
      MODULE_APPEND_ONLY_TABLES: (module.appendOnlyTables ?? []).join(','),
      MODULE_READ_ONLY_TABLES: (module.readOnlyTables ?? []).join(','),
    },
  });
  if (run.status !== 0) {
    throw new Error(
      `Finance proof bootstrap failed:\n${run.stdout}\n${run.stderr}`.trim(),
    );
  }

  const proofUser = decodeURIComponent(new URL(adminUrl).username);
  const adminAfter = new pg.Client({ connectionString: adminUrl });
  await adminAfter.connect();
  try {
    // Legacy WI-OI-094–118 scripts connect as the proof URL user (not the module runtime role). M1 revokes PUBLIC
    // execute on SECURITY DEFINER functions; grant the proof runner what it needs for certification SQL.
    await adminAfter.query(`GRANT USAGE ON SCHEMA ${module.schema} TO ${quoteIdent(proofUser)}`);
    await adminAfter.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${module.schema} TO ${quoteIdent(proofUser)}`,
    );
    await adminAfter.query(
      `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ${module.schema} TO ${quoteIdent(proofUser)}`,
    );
    await adminAfter.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rls_test_user') THEN
          CREATE ROLE rls_test_user LOGIN;
        END IF;
      END $$;
    `);
    await adminAfter.query(`GRANT USAGE ON SCHEMA ${module.schema} TO rls_test_user`);
    await adminAfter.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${module.schema} TO rls_test_user`,
    );
    await adminAfter.query(
      `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ${module.schema} TO rls_test_user`,
    );
  } finally {
    await adminAfter.end();
  }

  return { migrationVersion, schema: module.schema };
}

function quoteIdent(name) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Refusing unsafe SQL identifier: ${name}`);
  }
  return `"${name}"`;
}
