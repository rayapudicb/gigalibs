#!/usr/bin/env bash
# WI-OI-104c step 2 smoke: the built kernel worker against a throwaway PostgreSQL and Redis (127.0.0.1 only, removed
# afterwards) and a stub Analytics module that verifies the signed context.
set -euo pipefail
REPO="$HOME/dev/gigalibs"
SP="$(cd "$(dirname "$0")" && pwd)"
PG=gl-104c-smoke-pg RD=gl-104c-smoke-redis PGPORT=55442 RDPORT=56389 STUBPORT=55443 HEALTHPORT=55444
WORKER="" STUB=""
cleanup() {
  [[ -n "$WORKER" ]] && kill "$WORKER" 2>/dev/null || true
  [[ -n "$STUB" ]] && kill "$STUB" 2>/dev/null || true
  docker rm -f "$PG" "$RD" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker run -d --name "$PG" -p 127.0.0.1:$PGPORT:5432 -e POSTGRES_USER=gigalibs -e POSTGRES_PASSWORD=smoke -e POSTGRES_DB=gigalibs postgres:16-alpine >/dev/null
docker run -d --name "$RD" -p 127.0.0.1:$RDPORT:6379 redis:7-alpine redis-server --requirepass smoke --save "" --appendonly no --maxmemory-policy noeviction >/dev/null
until docker exec "$PG" pg_isready -U gigalibs -d gigalibs >/dev/null 2>&1; do sleep 1; done
sleep 2
export DATABASE_URL="postgresql://gigalibs:smoke@127.0.0.1:$PGPORT/gigalibs"
psql() { docker exec -i "$PG" psql -U gigalibs -d gigalibs -v ON_ERROR_STOP=1 -qAt "$@"; }
# Prisma wraps each migration in a transaction and 20260924000000 fails on a fresh database (enum value added and used
# in one transaction); psql applies statement by statement.
# The three D2 migrations that alter CMMS/Workforce schemas (finding A1) need those modules and are skipped here.
for migration in "$REPO"/packages/db/migrations/*/migration.sql; do
  [[ "$migration" == *phase3_thingsboard* || "$migration" == *phase4_workforce* || "$migration" == *phase5_cmms* ]] && continue
  psql <"$migration" >/dev/null || { echo "FAILED $migration"; exit 1; }; done
echo "core migrations applied: $(ls -d "$REPO"/packages/db/migrations/*/ | wc -l | tr -d ' ')"
psql <<'SQL'
INSERT INTO tenants (id, slug, name, status, plan, "updatedAt") VALUES ('smoke-tenant', 'smoke', 'Smoke farm', 'ACTIVE', 'TRIAL', now());
INSERT INTO tenant_settings (id, "tenantId", branding, security, localization, features, metadata, "updatedAt")
  VALUES ('smoke-settings', 'smoke-tenant', '{}', '{"enforceMfa": false}', '{}', '{}', '{}', now());
INSERT INTO users (id, email, name, status, "updatedAt") VALUES ('smoke-owner', 'owner@smoke.test', 'Owner', 'ACTIVE', now());
INSERT INTO tenant_members (id, role, status, "userId", "tenantId", permissions, "updatedAt")
  VALUES ('smoke-member', 'MEMBER', 'ACTIVE', 'smoke-owner', 'smoke-tenant', ARRAY['analytics:reports:write'], now());
INSERT INTO tenant_module_entitlements (id, "moduleKey", status, source, reason, "updatedById", "tenantId", "updatedAt")
  VALUES ('smoke-ent', 'analytics-studio', 'ENABLED', 'PLAN', 'smoke', 'smoke-owner', 'smoke-tenant', now());
SQL

KEYS="$(node -e "const {generateKeyPairSync}=require('node:crypto');const k=generateKeyPairSync('ed25519');process.stdout.write(k.privateKey.export({format:'der',type:'pkcs8'}).toString('base64')+' '+Buffer.from(k.publicKey.export({format:'pem',type:'spki'})).toString('base64'))")"
PRIVATE="${KEYS% *}" PUBLIC_PEM_B64="${KEYS#* }"

# Stub Analytics: verifies the token for its audience and records what it saw.
cat >"$SP/smoke-stub.mjs" <<'JS'
import { createServer } from 'node:http';
import { verifyPlatformContextToken } from '@gigalibs/auth-core';
const publicKey = Buffer.from(process.env.PUBLIC_PEM_B64, 'base64').toString();
createServer((request, response) => {
  let body = '';
  request.on('data', (chunk) => (body += chunk));
  request.on('end', () => {
    try {
      const claims = verifyPlatformContextToken(request.headers.authorization.replace('Bearer ', ''), publicKey, 'gigalibs-analytics-api');
      console.log(`STUB ${request.method} ${request.url} sub=${claims.sub} tenant=${claims.tenant_id} module=${claims.entitlement.module_key} scopes=${claims.granted_scopes.join('|')} correlation=${request.headers['x-correlation-id']} body=${body}`);
      response.writeHead(202, { 'Content-Type': 'application/json' }).end(JSON.stringify({ id: 'run-smoke', status: 'SUCCEEDED' }));
    } catch (error) {
      console.log(`STUB REJECTED ${error.message}`);
      response.writeHead(401).end();
    }
  });
}).listen(Number(process.env.STUBPORT), '127.0.0.1');
JS
cp "$SP/smoke-stub.mjs" "$REPO/apps/playground-api/.smoke-stub.mjs"
PUBLIC_PEM_B64="$PUBLIC_PEM_B64" STUBPORT=$STUBPORT node "$REPO/apps/playground-api/.smoke-stub.mjs" >"$SP/smoke-stub.log" 2>&1 &
STUB=$!

WORKER_ENV=(JWT_ACCESS_SECRET="$(openssl rand -hex 32)" JWT_ACCESS_EXPIRES_IN=15m JWT_REFRESH_EXPIRES_IN=30d
  CONTROL_PAYLOAD_KEY_VERSION=v1 CONTROL_PAYLOAD_ENCRYPTION_KEY="$(openssl rand -base64 32)")
echo "--- owner context"
(cd "$REPO/apps/playground-api" && env "${WORKER_ENV[@]}" node --input-type=module -e "
import { AuthService } from '@gigalibs/auth-nest';
try { const c = await new AuthService().getSubjectContext('smoke-owner', 'smoke-tenant', 'job:diag');
  console.log('owner ok', c.roles.join('|'), c.permissions.filter((p) => p.startsWith('analytics')).join('|'), c.tenant.entitlements.map((e) => e.moduleKey).join('|')); }
catch (e) { console.log('owner refused', e.constructor.name, e.message); }
process.exit(0);")

# Two schedules via the real scheduler (payload validation), then made due now.
cat >"$REPO/apps/playground-api/.smoke-schedules.mjs" <<'JS'
import { JobRegistry, KernelJobs, KernelScheduler, PostgresJobStore, PostgresScheduleStore } from '@gigalibs/jobs';
import { Pool } from 'pg';
import { moduleCallJob } from './dist/kernel-worker/module-call.job.js';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const registry = new JobRegistry();
registry.register(moduleCallJob({ getSubjectContext: async () => { throw new Error('not used'); } }));
const scheduler = new KernelScheduler({ store: new PostgresScheduleStore(pool), jobs: new KernelJobs({ store: new PostgresJobStore(pool), registry }), registry, resolveOwner: async () => null });
const payload = { operation: 'analytics.report-run', reportDefinitionId: '00000000-0000-4000-8000-0000000000aa' };
for (const [name, owner] of [['Nightly yield', 'smoke-owner'], ['Left the farm', 'ghost-owner']]) {
  await scheduler.create({ tenantId: 'smoke-tenant', name, jobType: 'module.call', jobVersion: 1, payload, cron: '0 2 * * *', timeZone: 'Asia/Kolkata', ownerSubjectId: owner });
}
await pool.end();
JS
(cd "$REPO/apps/playground-api" && node .smoke-schedules.mjs)
psql -c "UPDATE kernel_job_schedules SET \"nextRunAt\" = now() - interval '1 second'"

(cd "$REPO/apps/playground-api" && env REDIS_URL="redis://:smoke@127.0.0.1:$RDPORT/0" \
  JWT_ACCESS_SECRET="$(openssl rand -hex 32)" JWT_ACCESS_EXPIRES_IN=15m JWT_REFRESH_EXPIRES_IN=30d \
  CONTROL_PAYLOAD_KEY_VERSION=v1 CONTROL_PAYLOAD_ENCRYPTION_KEY="$(openssl rand -base64 32)" \
  ANALYTICS_API_URL="http://127.0.0.1:$STUBPORT" ANALYTICS_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64="$PRIVATE" \
  KERNEL_WORKER_TICK_MS=1000 KERNEL_WORKER_HEALTH_PORT=$HEALTHPORT \
  node "$REPO/apps/playground-api/dist/kernel-worker/main.js" >"$SP/smoke-worker.log" 2>&1) &
WORKER=$!
sleep 8

echo "--- health"; curl -s -w ' %{http_code}\n' "http://127.0.0.1:$HEALTHPORT/health"
echo "--- schedules"; psql -c "SELECT name, status, coalesce(\"pausedReason\", '-'), to_char(\"nextRunAt\" AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') FROM kernel_job_schedules ORDER BY name"
echo "--- jobs"; psql -c "SELECT \"jobType\", status, attempts, coalesce(\"lastErrorCode\", '-'), \"ownerSubjectId\", \"correlationId\" LIKE 'schedule:%' FROM kernel_job_runs"
echo "--- stub"; cat "$SP/smoke-stub.log"
echo "--- graceful stop"; pkill -TERM -f "dist/kernel-worker/main.js" || true; sleep 3
cat "$SP/smoke-worker.log"
rm -f "$REPO/apps/playground-api/.smoke-stub.mjs" "$REPO/apps/playground-api/.smoke-schedules.mjs"
