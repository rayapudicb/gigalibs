#!/usr/bin/env bash
# WI-OI-107 end-to-end proof: a pack installed, approved (a second administrator), published and activated in
# Configuration Studio reaches Workforce and Geospatial through kernel jobs; one industry pack at a time. The proof web
# runs on 127.0.0.1:5190 against the live services; the tenant and its two administrators are throwaway, and their
# sessions are revoked afterwards. Usage: e2e-107.sh <tag>
set -uo pipefail
TAG="${1:?image tag}"
SP="$(cd "$(dirname "$0")" && pwd)"; REPO="$HOME/dev/gigalibs"; C="$REPO/infra/compose"; NET=gigalibs-configuration-local
WEB=gigalibs-e2e-web WEBENV="$SP/packs-web.env" CREDS="$SP/packs-creds.json"
step() { echo "== $* ($(date +%H:%M:%S))"; }
cleanup() {
  docker rm -f "$WEB" >/dev/null 2>&1
  rm -f "$WEBENV" "$CREDS"
  docker exec gigalibs-postgres psql -U gigalibs -d gigalibs -tAc \
    "UPDATE sessions SET status='REVOKED', \"revokedAt\"=now() WHERE status='ACTIVE' AND \"userId\" IN (SELECT id FROM users WHERE email LIKE 'packs-proof.%@gigalibs.invalid')" | sed 's/^/  sessions revoked: /'
}
trap cleanup EXIT

step "proof web environment (the live web's, unchanged)"
cd "$C" || exit 1
( umask 077
  docker compose --env-file .env --env-file .env.workforce --env-file .env.geospatial --env-file .env.modules \
    -f compose.yaml -f compose.workforce.local.yaml -f compose.geospatial.local.yaml -f compose.modules.local.yaml \
    config --format json 2>/dev/null |
    node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const web=JSON.parse(s).services.web.environment;
      require("fs").writeFileSync(process.argv[1],Object.entries(web).filter(([,v])=>v!==null&&v!=="").map(([k,v])=>`${k}=${v}`).join("\n")+"\n");})' "$WEBENV" )
[ -s "$WEBENV" ] || { echo "FAIL no environment"; exit 1; }
step "proof web on 127.0.0.1:5190"
docker rm -f "$WEB" >/dev/null 2>&1
docker run -d --name "$WEB" --network "$NET" -p 127.0.0.1:5190:5180 \
  --init --read-only --tmpfs /tmp:rw,noexec,nosuid,size=64m --tmpfs /app/.next/cache:rw,noexec,nosuid,size=128m \
  --security-opt no-new-privileges:true --cap-drop ALL --env-file "$WEBENV" "gigalibs/workflow-platform:$TAG" >/dev/null || exit 1
for _ in $(seq 1 60); do [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 http://127.0.0.1:5190/api/health/ready)" = 200 ] && break; sleep 2; done
echo "  web ready"

step "throwaway tenant with Workforce and Geospatial, and two Tenant Admins"
DBURL="$(grep '^DATABASE_URL=' "$C/.env" | cut -d= -f2- | sed 's/host.docker.internal/127.0.0.1/')"
( cd "$REPO/apps/playground-api" && umask 077 && CREDS="$CREDS" DATABASE_URL="$DBURL" node --input-type=module -e '
const { randomBytes } = await import("node:crypto");
const [{ prisma }, { hashPassword }] = await Promise.all([import("../../packages/db/dist/index.js"), import("../../packages/auth-core/dist/index.js")]);
const run = `${Date.now()}-${randomBytes(3).toString("hex")}`;
const modules = ["gigaops", "geospatial-studio", "analytics-studio"];
const tenant = await prisma.tenant.create({ data: { slug: `packs-proof-${run}`.slice(0, 63), name: "Packs proof", status: "ACTIVE", region: "local", features: modules,
  settings: { create: { branding: {}, security: { enforceMfa: false }, localization: {}, features: {}, metadata: {} } } } });
const people = {};
for (const label of ["author", "approver"]) {
  const password = `Packs-${randomBytes(18).toString("base64url")}!`;
  const email = `packs-proof.${label}.${run}@gigalibs.invalid`;
  const user = await prisma.user.create({ data: { email, name: `Packs proof ${label}`, status: "ACTIVE", passwordHash: await hashPassword(password) } });
  await prisma.tenantMember.create({ data: { userId: user.id, tenantId: tenant.id, role: "TENANT_ADMIN", status: "ACTIVE" } });
  people[label] = { email, password, id: user.id };
}
for (const moduleKey of modules) await prisma.tenantModuleEntitlement.create({ data: { tenantId: tenant.id, moduleKey, status: "ENABLED", source: "PLATFORM_OVERRIDE", reason: "WI-OI-107 end-to-end proof", updatedById: people.author.id } });
(await import("node:fs")).writeFileSync(process.env.CREDS, JSON.stringify({ ...people, tenantId: tenant.id }), { mode: 0o600 });
await prisma.$disconnect();' > /dev/null ) || { echo "FAIL seed"; exit 1; }
field() { node -e 'const v=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(process.argv[2].split(".").reduce((o,k)=>o[k],v))' "$CREDS" "$1"; }

step "playwright"
cat > "$REPO/e2e/test-results/packs-proof.config.ts" <<'CFG'
import base from '../playwright.config';
export default { ...base, testDir: '../specs', testMatch: 'packs.spec.ts', outputDir: './artifacts', reporter: [['list']],
  use: { ...base.use, channel: 'chrome', video: 'off', screenshot: 'off', trace: 'off' }, projects: [{ name: 'chrome', use: { channel: 'chrome' } }] };
CFG
( cd "$REPO/e2e" && E2E_EMAIL="$(field author.email)" E2E_PASSWORD="$(field author.password)" \
    E2E_APPROVER_EMAIL="$(field approver.email)" E2E_APPROVER_PASSWORD="$(field approver.password)" \
    PLAYWRIGHT_TEST_BASE_URL=http://127.0.0.1:5190 npx playwright test --config test-results/packs-proof.config.ts 2>&1 | tail -30 ) | tee "$SP/packs-playwright.out"
grep -q "1 passed" "$SP/packs-playwright.out" && status=0 || status=1

step "kernel jobs for this tenant (pack.apply)"
TENANT="$(field tenantId)"
docker exec -i gigalibs-postgres psql -U gigalibs -d gigalibs -v tenant="$TENANT" -tA -F' | ' <<'SQL' | sed 's/^/  /'
SELECT payload->>'operation', status, attempts, coalesce("lastErrorCode", '') FROM kernel_job_runs WHERE "tenantId" = :'tenant' ORDER BY "createdAt";
SQL
exit "$status"
