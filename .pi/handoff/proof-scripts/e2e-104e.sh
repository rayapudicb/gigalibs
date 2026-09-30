#!/usr/bin/env bash
# WI-OI-104e end-to-end proof (from the 104d pull proof): a Connector Hub pull reaches an Analytics dataset. The live Connector Hub is not changed: a throwaway source and a throwaway Hub (allowed to
# reach only that source) run on the Compose network, and the proof web on 127.0.0.1:5190 talks to that Hub. A
# throwaway tenant's Tenant Admin sets the source up in the browser. Everything is removed afterwards.
# Usage: pull-live.sh <tag>
set -uo pipefail
TAG="${1:?image tag}"
SP="$(cd "$(dirname "$0")" && pwd)"; REPO="$HOME/dev/gigalibs"; C="$REPO/infra/compose"; NET=gigalibs-configuration-local
SRC=gl-pull-source HUB=gl-pull-hub WEB=gigalibs-e2e-web
HUBENV="$SP/pull-hub.env" WEBENV="$SP/pull-web.env" CREDS="$SP/pull-creds.json"
NODE_IMAGE="$(node -e 'console.log(require(process.argv[1]).artifactPolicy.baseImage)' "$REPO/config/deployment-profiles/configuration-local-development-v1.json")"
step() { echo "== $* ($(date +%H:%M:%S))"; }
cleanup() {
  docker rm -f "$SRC" "$HUB" "$WEB" >/dev/null 2>&1
  rm -f "$HUBENV" "$WEBENV" "$CREDS"
  docker exec gigalibs-postgres psql -U gigalibs -d gigalibs -tAc \
    "UPDATE sessions SET status='REVOKED', \"revokedAt\"=now() WHERE status='ACTIVE' AND \"userId\" IN (SELECT id FROM users WHERE email LIKE 'pull-proof.%@gigalibs.invalid')" | sed 's/^/  sessions revoked: /'
}
trap cleanup EXIT

step "throwaway source ($NODE_IMAGE)"
docker run -d --name "$SRC" --network "$NET" --read-only --cap-drop ALL --security-opt no-new-privileges:true "$NODE_IMAGE" node -e '
const records = [
  { id: "h-1", crop: "maize", quantity: 12, unit: "Quintals", harvested_on: "2026-09-21", updated_at: "2026-09-21T00:00:00Z" },
  { id: "h-2", crop: "rice", quantity: 8, unit: "qtl", harvested_on: "2026-09-22", updated_at: "2026-09-22T00:00:00Z" },
  { id: "h-3", crop: "maize", quantity: 2, unit: "tonnes", harvested_on: "2026-09-23", updated_at: "2026-09-23T00:00:00Z" },
  { id: "h-4", crop: "wheat", quantity: 500, unit: "kg", harvested_on: "2026-09-24", updated_at: "2026-09-24T00:00:00Z" },
];
require("node:http").createServer((req, res) => {
  const url = new URL(req.url, "http://source");
  const send = (status, body) => res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(body));
  if (req.headers["x-api-key"] !== "proof-key-123") return send(401, { error: "api key required" });
  if (url.pathname !== "/v1/harvests") return send(404, { error: "unknown" });
  const since = url.searchParams.get("updated_since");
  const page = Number(url.searchParams.get("page")), size = Number(url.searchParams.get("per_page"));
  const visible = records.filter((r) => !since || r.updated_at >= since);
  send(200, { data: visible.slice((page - 1) * size, page * size) });
}).listen(8080, "0.0.0.0");' >/dev/null || exit 1

step "environments: throwaway Hub allowed to reach only $SRC"
cd "$C" || exit 1
( umask 077
  docker compose --env-file .env --env-file .env.workforce --env-file .env.geospatial --env-file .env.modules \
    -f compose.yaml -f compose.workforce.local.yaml -f compose.geospatial.local.yaml -f compose.modules.local.yaml \
    config --format json 2>/dev/null |
    node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const all=JSON.parse(s).services;
      const hub={...all["connector-hub-api"].environment,CONNECTOR_HUB_ALLOWED_OUTBOUND_HOSTS:"gl-pull-source",CONNECTOR_HUB_ALLOW_INSECURE_OUTBOUND:"true"};
      const web={...all.web.environment,CONNECTOR_HUB_API_URL:"http://127.0.0.1:4100"};
      const out=(e)=>Object.entries(e).filter(([,v])=>v!==null&&v!=="").map(([k,v])=>`${k}=${v}`).join("\n")+"\n";
      require("fs").writeFileSync(process.argv[1],out(hub));require("fs").writeFileSync(process.argv[2],out(web));})' "$HUBENV" "$WEBENV" )
[ -s "$HUBENV" ] && [ -s "$WEBENV" ] || { echo "FAIL no environment"; exit 1; }
step "proof web on 127.0.0.1:5190; the throwaway Hub shares its network and answers on 127.0.0.1:4100"
docker rm -f "$WEB" >/dev/null 2>&1
docker run -d --name "$WEB" --network "$NET" -p 127.0.0.1:5190:5180 \
  --init --read-only --tmpfs /tmp:rw,noexec,nosuid,size=64m --tmpfs /app/.next/cache:rw,noexec,nosuid,size=128m \
  --security-opt no-new-privileges:true --cap-drop ALL --env-file "$WEBENV" "gigalibs/workflow-platform:$TAG" >/dev/null || exit 1
for _ in $(seq 1 60); do [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 http://127.0.0.1:5190/api/health/ready)" = 200 ] && break; sleep 2; done
echo "  web ready"
docker run -d --name "$HUB" --network "container:$WEB" --init --read-only --tmpfs /tmp:rw,noexec,nosuid,size=64m \
  --security-opt no-new-privileges:true --cap-drop ALL \
  --env-file "$HUBENV" "gigalibs/connector-hub-api:$TAG" >/dev/null || exit 1
for _ in $(seq 1 40); do
  docker exec "$HUB" node -e "fetch('http://127.0.0.1:4100/api/connectors/v1/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null && break; sleep 2
done
docker exec "$HUB" node -e "fetch('http://127.0.0.1:4100/api/connectors/v1/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" || { docker logs --tail 20 "$HUB"; echo "FAIL hub not ready"; exit 1; }
echo "  hub ready"


step "throwaway tenant and Tenant Admin"
DBURL="$(grep '^DATABASE_URL=' "$C/.env" | cut -d= -f2- | sed 's/host.docker.internal/127.0.0.1/')"
( cd "$REPO/apps/playground-api" && umask 077 && CREDS="$CREDS" DATABASE_URL="$DBURL" node --input-type=module -e '
const { randomBytes } = await import("node:crypto");
const [{ prisma }, { hashPassword }] = await Promise.all([import("../../packages/db/dist/index.js"), import("../../packages/auth-core/dist/index.js")]);
const run = `${Date.now()}-${randomBytes(3).toString("hex")}`;
const tenant = await prisma.tenant.create({ data: { slug: `pull-proof-${run}`.slice(0, 63), name: "Pull proof", status: "ACTIVE", region: "local", features: ["connections", "analytics-studio"],
  settings: { create: { branding: {}, security: { enforceMfa: false }, localization: {}, features: {}, metadata: {} } } } });
const password = `Pull-${randomBytes(18).toString("base64url")}!`;
const email = `pull-proof.admin.${run}@gigalibs.invalid`;
const user = await prisma.user.create({ data: { email, name: "Pull proof admin", status: "ACTIVE", passwordHash: await hashPassword(password) } });
await prisma.tenantMember.create({ data: { userId: user.id, tenantId: tenant.id, role: "TENANT_ADMIN", status: "ACTIVE" } });
for (const moduleKey of ["connections", "analytics-studio"]) await prisma.tenantModuleEntitlement.create({ data: { tenantId: tenant.id, moduleKey, status: "ENABLED", source: "PLATFORM_OVERRIDE", reason: "WI-OI-104e end-to-end proof", updatedById: user.id } });
(await import("node:fs")).writeFileSync(process.env.CREDS, JSON.stringify({ email, password, tenantId: tenant.id }), { mode: 0o600 });
await prisma.$disconnect();' > /dev/null ) || { echo "FAIL seed"; exit 1; }
[ -s "$CREDS" ] || { echo "FAIL seed wrote no credentials"; exit 1; }

step "playwright"
E2E_EMAIL="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).email)' "$CREDS")"
E2E_PASSWORD="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).password)' "$CREDS")"
cat > "$REPO/e2e/test-results/pull-proof.config.ts" <<'CFG'
import base from '../playwright.config';
export default { ...base, testDir: '../specs', testMatch: 'connector-to-analytics.spec.ts', outputDir: './artifacts', reporter: [['list']],
  use: { ...base.use, channel: 'chrome', video: 'off', screenshot: 'off', trace: 'off' }, projects: [{ name: 'chrome', use: { channel: 'chrome' } }] };
CFG
( cd "$REPO/e2e" && E2E_EMAIL="$E2E_EMAIL" E2E_PASSWORD="$E2E_PASSWORD" E2E_PULL_SOURCE=http://gl-pull-source:8080 \
    PLAYWRIGHT_TEST_BASE_URL=http://127.0.0.1:5190 npx playwright test --config test-results/pull-proof.config.ts 2>&1 | tail -30 ) | tee "$SP/pull-playwright.out"
grep -q "1 passed" "$SP/pull-playwright.out" && status=0 || status=1

if [ "$status" = 0 ]; then
  step "the schedule runs through the live kernel worker: dataset rebuild, then the chained summary build"
  TENANT="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).tenantId)' "$CREDS")"
  bash "$SP/kernel-stage.sh" "$TENANT" || status=1
fi
step "hub log (pulls)"
docker logs "$HUB" 2>&1 | grep -iE "pull|sync|error" | tail -5 | cut -c1-200
exit "$status"
