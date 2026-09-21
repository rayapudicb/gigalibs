import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const root = new URL('../', import.meta.url).pathname;

console.log('=== GigaLibs Live PostgreSQL Migration Verification ===\n');

const databaseUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/gigalibs';
console.log(`Connecting to: ${databaseUrl.replace(/:[^:@]+@/, ':****@')}`);

const migrations = [
  {
    name: 'Canonical Departments & Memberships',
    path: 'packages/db/migrations/20260920000000_canonical_departments_and_workforce_memberships/migration.sql',
  },
  {
    name: 'Tenant-Safe Department Relationships',
    path: 'packages/db/migrations/20260921000000_tenant_safe_department_relationships/migration.sql',
  },
  {
    name: 'CMMS Workforce Allocations & Capabilities',
    path: 'modules/physical-operations-cmms/db/migrations/000003_workforce_allocations_and_capabilities.up.sql',
  },
  {
    name: 'CMMS Workforce Integrity, Audit & Metering',
    path: 'modules/physical-operations-cmms/db/migrations/000004_workforce_integrity_audit_and_metering.up.sql',
  },
  {
    name: 'CMMS Department Scope Columns',
    path: 'modules/physical-operations-cmms/db/migrations/000005_cmms_department_scope_columns.up.sql',
  },
];

// Check files exist
for (const m of migrations) {
  const fullPath = join(root, m.path);
  if (!existsSync(fullPath)) {
    console.error(`❌ Migration file missing: ${m.path}`);
    process.exit(1);
  }
}

console.log('All migration files located. Testing connection...');

try {
  execSync(`psql "${databaseUrl}" -c "SELECT 1;"`, { stdio: 'pipe' });
  console.log('✅ PostgreSQL connection established.');
} catch (err) {
  console.log('⚠️ PostgreSQL instance not reachable at specified DATABASE_URL.');
  console.log('To run this verification against a live database:');
  console.log('  1. Ensure PostgreSQL is running (e.g., brew services start postgresql@16 or docker compose up -d postgres)');
  console.log('  2. Run: DATABASE_URL="postgresql://user:pass@localhost:5432/dbname" node scripts/verify-live-postgres-migrations.mjs');
  process.exit(0);
}

// If connected, apply migrations
for (const m of migrations) {
  process.stdout.write(`Applying ${m.name}... `);
  try {
    const fullPath = join(root, m.path);
    execSync(`psql "${databaseUrl}" -f "${fullPath}"`, { stdio: 'pipe' });
    console.log('✅ Applied');
  } catch (err) {
    console.log('❌ Failed');
    console.error(err.stderr?.toString() || err.message);
    process.exit(1);
  }
}

console.log('\n✅ All migrations applied successfully to live PostgreSQL.');
