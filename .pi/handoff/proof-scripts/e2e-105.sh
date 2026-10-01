#!/usr/bin/env bash
# WI-OI-105 end-to-end proof (from the 104e proof): a land register pulled by Connector Hub becomes Geospatial places,
# relayed on to Analytics' place directory; field scouting pulled into Analytics is tagged by field; a place map on one
# farm, and a member scoped to Farm B sees only Farm B. The live Connector Hub is not changed: a throwaway source and a
# throwaway Hub (allowed to reach only that source, relaying to the live Geospatial and Analytics) run on the Compose
# network, and the proof web on 127.0.0.1:5190 talks to that Hub. The tenant is throwaway; sessions are revoked after.
# Usage: e2e-105.sh <tag>
set -uo pipefail
TAG="${1:?image tag}"
SP="$(cd "$(dirname "$0")" && pwd)"; REPO="$HOME/dev/gigalibs"; C="$REPO/infra/compose"; NET=gigalibs-configuration-local
SRC=gl-pull-source HUB=gl-pull-hub WEB=gigalibs-e2e-web
HUBENV="$SP/pull-hub.env" WEBENV="$SP/pull-web.env" CREDS="$SP/pull-creds.json" SCOPED="$SP/pull-scoped.json" FARMS="$SP/pull-farms.json"
NODE_IMAGE="$(node -e 'console.log(require(process.argv[1]).artifactPolicy.baseImage)' "$REPO/config/deployment-profiles/configuration-local-development-v1.json")"
step() { echo "== $* ($(date +%H:%M:%S))"; }
cleanup() {
  docker rm -f "$SRC" "$HUB" "$WEB" >/dev/null 2>&1
  rm -f "$HUBENV" "$WEBENV" "$CREDS" "$SCOPED" "$FARMS"
  docker exec gigalibs-postgres psql -U gigalibs -d gigalibs -tAc \
    "UPDATE sessions SET status='REVOKED', \"revokedAt\"=now() WHERE status='ACTIVE' AND \"userId\" IN (SELECT id FROM users WHERE email LIKE 'pull-proof.%@gigalibs.invalid')" | sed 's/^/  sessions revoked: /'
}
trap cleanup EXIT

step "throwaway source ($NODE_IMAGE)"
docker run -d --name "$SRC" --network "$NET" --read-only --cap-drop ALL --security-opt no-new-privileges:true "$NODE_IMAGE" node -e '
const sq = (x, y, d) => `POLYGON ((${x} ${y}, ${x + d} ${y}, ${x + d} ${y + d}, ${x} ${y + d}, ${x} ${y}))`;
const land = [
  { id: "farm-a", kind: "FARM", name: "Farm A", farm_id: null, boundary: sq(77.5, 12.9, 0.02) },
  { id: "farm-b", kind: "FARM", name: "Farm B", farm_id: null, boundary: sq(77.6, 12.9, 0.02) },
  { id: "field-a1", kind: "FIELD", name: "A1", farm_id: "farm-a", boundary: sq(77.5, 12.9, 0.01) },
  { id: "field-a2", kind: "FIELD", name: "A2", farm_id: "farm-a", boundary: sq(77.51, 12.9, 0.01) },
  { id: "field-b1", kind: "FIELD", name: "B1", farm_id: "farm-b", boundary: sq(77.6, 12.9, 0.01) },
  { id: "field-b2", kind: "FIELD", name: "B2", farm_id: "farm-b", boundary: sq(77.61, 12.91, 0.01) },
];
const scouting = [
  { id: "s1", lat: 12.905, lon: 77.505, pests: 10 }, { id: "s2", lat: 12.905, lon: 77.515, pests: 4 },
  { id: "s3", lat: 12.905, lon: 77.605, pests: 20 }, { id: "s4", lat: 12.915, lon: 77.615, pests: 7 },
  { id: "s5", lat: 12.915, lon: 77.605, pests: 3 }, { id: "s6", lat: 13.5, lon: 78.0, pests: 5 },
];
require("node:http").createServer((req, res) => {
  const url = new URL(req.url, "http://source");
  const send = (status, body) => res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(body));
  if (req.headers["x-api-key"] !== "proof-key-123") return send(401, { error: "api key required" });
  if (url.pathname === "/v1/land") return send(200, { data: land });
  if (url.pathname === "/v1/scouting") return send(200, { data: scouting });
  send(404, { error: "unknown" });
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
const tenant = await prisma.tenant.create({ data: { slug: `pull-proof-${run}`.slice(0, 63), name: "Pull proof", status: "ACTIVE", region: "local", features: ["connections", "analytics-studio", "geospatial-studio", "spatial-scoping"],
  settings: { create: { branding: {}, security: { enforceMfa: false }, localization: {}, features: {}, metadata: {} } } } });
const password = `Pull-${randomBytes(18).toString("base64url")}!`;
const email = `pull-proof.admin.${run}@gigalibs.invalid`;
const user = await prisma.user.create({ data: { email, name: "Pull proof admin", status: "ACTIVE", passwordHash: await hashPassword(password) } });
await prisma.tenantMember.create({ data: { userId: user.id, tenantId: tenant.id, role: "TENANT_ADMIN", status: "ACTIVE" } });
for (const moduleKey of ["connections", "analytics-studio", "geospatial-studio"]) await prisma.tenantModuleEntitlement.create({ data: { tenantId: tenant.id, moduleKey, status: "ENABLED", source: "PLATFORM_OVERRIDE", reason: "WI-OI-105 end-to-end proof", updatedById: user.id } });
(await import("node:fs")).writeFileSync(process.env.CREDS, JSON.stringify({ email, password, tenantId: tenant.id }), { mode: 0o600 });
await prisma.$disconnect();' > /dev/null ) || { echo "FAIL seed"; exit 1; }
[ -s "$CREDS" ] || { echo "FAIL seed wrote no credentials"; exit 1; }

run_phase() { # phase email password extra-env...
  local phase="$1" email="$2" pass="$3"; shift 3
  cat > "$REPO/e2e/test-results/pull-proof.config.ts" <<'CFG'
import base from '../playwright.config';
export default { ...base, testDir: '../specs', testMatch: 'places-map.spec.ts', outputDir: './artifacts', reporter: [['list']],
  use: { ...base.use, channel: 'chrome', video: 'off', screenshot: 'off', trace: 'off' }, projects: [{ name: 'chrome', use: { channel: 'chrome' } }] };
CFG
  ( cd "$REPO/e2e" && env "$@" E2E_PHASE="$phase" E2E_EMAIL="$email" E2E_PASSWORD="$pass" E2E_PULL_SOURCE=http://gl-pull-source:8080 \
      PLAYWRIGHT_TEST_BASE_URL=http://127.0.0.1:5190 npx playwright test --config test-results/pull-proof.config.ts 2>&1 | tail -30 ) | tee "$SP/places-$phase.out"
  grep -q "1 passed" "$SP/places-$phase.out"
}
field() { node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))[process.argv[2]])' "$1" "$2"; }

step "playwright: Tenant Admin"
status=0
run_phase admin "$(field "$CREDS" email)" "$(field "$CREDS" password)" E2E_OUT="$FARMS" || status=1

if [ "$status" = 0 ]; then
  step "a member scoped to Farm B (analytics:read only)"
  ( cd "$REPO/apps/playground-api" && umask 077 && CREDS="$CREDS" SCOPED="$SCOPED" FARMS="$FARMS" DATABASE_URL="$DBURL" node --input-type=module -e '
const fs = await import("node:fs"); const { randomBytes } = await import("node:crypto");
const [{ prisma }, { hashPassword }] = await Promise.all([import("../../packages/db/dist/index.js"), import("../../packages/auth-core/dist/index.js")]);
const { tenantId } = JSON.parse(fs.readFileSync(process.env.CREDS, "utf8")); const { farmB } = JSON.parse(fs.readFileSync(process.env.FARMS, "utf8"));
const run = `${Date.now()}-${randomBytes(3).toString("hex")}`;
const password = `Pull-${randomBytes(18).toString("base64url")}!`; const email = `pull-proof.scoped.${run}@gigalibs.invalid`;
const user = await prisma.user.create({ data: { email, name: "Farm B agronomist", status: "ACTIVE", passwordHash: await hashPassword(password) } });
await prisma.tenantMember.create({ data: { userId: user.id, tenantId, role: "MEMBER", status: "ACTIVE", permissions: ["analytics:read"], spatialScopePlaceIds: [farmB] } });
fs.writeFileSync(process.env.SCOPED, JSON.stringify({ email, password }), { mode: 0o600 });
await prisma.$disconnect();' > /dev/null ) || { echo "FAIL scoped seed"; exit 1; }
  step "playwright: the Farm B member"
  run_phase scoped "$(field "$SCOPED" email)" "$(field "$SCOPED" password)" E2E_FARM_A="$(field "$FARMS" farmA)" || status=1
fi
step "hub log (pulls and relays)"
docker logs "$HUB" 2>&1 | grep -iE "pull|sync|relay|error" | tail -6 | cut -c1-200
exit "$status"
