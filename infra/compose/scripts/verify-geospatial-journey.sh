#!/usr/bin/env bash
set -euo pipefail

# WI-OI-063 places-journey certification against the running local Geospatial API.
# Creates attributable certification records under two run-scoped tenants (wi-oi-063-cert-*):
# tenant A builds and re-paths a hierarchy, restarts, reads and updates; tenant B is denied throughout.
# A spatially scoped tenant-A member then reaches only the assigned site, and keeps it when it is moved.
# Finally tenant A bulk-imports places: validation writes nothing, commits are all-or-nothing, 2,000 rows fit.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
BASE_ENV="${COMPOSE_DIR}/.env"
GEOSPATIAL_ENV="${COMPOSE_DIR}/.env.geospatial"

read_value() {
  local file="$1"
  local key="$2"
  local value
  value="$(awk -v key="${key}" 'index($0, key "=") == 1 { print substr($0, length(key) + 2); exit }' "${file}")"
  if [[ -z "${value}" ]]; then
    echo "Error: ${key} is missing from ${file}." >&2
    exit 1
  fi
  printf '%s' "${value}"
}

compose() {
  docker compose \
    --env-file "${BASE_ENV}" \
    --env-file "${GEOSPATIAL_ENV}" \
    -f "${COMPOSE_DIR}/compose.yaml" \
    -f "${COMPOSE_DIR}/compose.geospatial.local.yaml" \
    "$@"
}

# sign_context TENANT [SPATIAL_SCOPE_JSON]: a tenant administrator, or with a scope a member who holds every
# place permission, so a denial can only come from the spatial scope.
sign_context() {
  local tenant="$1"
  local scope="${2:-}"
  PRIVATE_KEY_BASE64="${PRIVATE_KEY_BASE64}" TENANT="${tenant}" SCOPE="${scope}" node -e '
    const { createPrivateKey, randomUUID, sign } = require("node:crypto");
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const scope = process.env.SCOPE ? JSON.parse(process.env.SCOPE) : null;
    const payload = encode({
      iss: "gigalibs-control-plane",
      aud: "gigalibs-geospatial-api",
      sub: scope ? "wi-oi-063-journey-scoped-member" : "wi-oi-063-journey-certifier",
      tenant_id: process.env.TENANT,
      session_id: `wi-oi-063-journey-${scope ? "scoped-" : ""}${process.env.TENANT}`,
      auth_version: 1,
      roles: scope ? ["MEMBER"] : ["TENANT_ADMIN"],
      granted_scopes: scope ? ["maps.nodes.read", "maps.nodes.manage", "maps.node-types.manage"] : ["maps:*"],
      persona_type: scope ? "WORKFORCE_MEMBER" : "OPERATIONS_SUPERVISOR",
      org_scope: { mode: "FLAT_TENANT" },
      ...(scope ? { spatial_scope: scope } : {}),
      entitlement: { module_key: "geospatial-studio", status: "ENABLED", version: "wi-oi-063" },
      iat: now,
      exp: now + 600,
      jti: randomUUID()
    });
    const data = `${encode({ alg: "EdDSA", typ: "JWT" })}.${payload}`;
    const key = createPrivateKey({ key: Buffer.from(process.env.PRIVATE_KEY_BASE64, "base64"), format: "der", type: "pkcs8" });
    process.stdout.write(`${data}.${sign(null, Buffer.from(data), key).toString("base64url")}`);
  '
}

# Runs one journey phase inside the Geospatial container so no module port is published.
run_phase() {
  local phase="$1"
  # Not "${IDS:-{}}": bash closes that expansion at the first "}" and appends a stray "}" to a set value.
  local ids="${IDS:-}"
  [[ -n "${ids}" ]] || ids='{}'
  docker exec \
    -e "PHASE=${phase}" -e "RUN=${RUN_ID}" -e "TOKEN_A=${TOKEN_A}" -e "TOKEN_B=${TOKEN_B}" \
    -e "TOKEN_C=${TOKEN_C:-}" -e "TOKEN_D=${TOKEN_D:-}" \
    -e "IDS=${ids}" \
    "$(compose ps -q geospatial-api)" node -e '
      const base = "http://127.0.0.1:4720";
      const env = process.env;
      async function call(token, method, path, body) {
        const response = await fetch(`${base}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            "X-Correlation-Id": `wi-oi-063-journey-${env.RUN}`,
            ...(body ? { "Content-Type": "application/json" } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        return { status: response.status, body: await response.json().catch(() => null) };
      }
      function expectStatus(label, result, ...expected) {
        if (!expected.includes(result.status)) {
          throw new Error(`${label}: expected ${expected.join("/")}, received ${result.status} ${JSON.stringify(result.body)}`);
        }
        return result.body;
      }
      async function phaseCreate() {
        const A = env.TOKEN_A;
        const region = expectStatus("create REGION type", await call(A, "POST", "/v1/node-types", { code: "region", label: "Region" }), 201);
        const site = expectStatus("create SITE type", await call(A, "POST", "/v1/node-types", { code: "SITE", label: "Site" }), 201);
        if (region.code !== "REGION") throw new Error("node type codes must be normalised to upper case");
        const apac = expectStatus("create region", await call(A, "POST", "/v1/nodes",
          { code: "APAC", displayName: "Asia Pacific", nodeTypeId: region.id, countryCode: "IN" }), 201);
        const blr = expectStatus("create site under region", await call(A, "POST", "/v1/nodes",
          { code: "BLR_01", displayName: "Bengaluru 01", nodeTypeId: site.id, parentId: apac.id,
            countryCode: "IN", subdivisionCode: "IN-KA", timeZone: "Asia/Kolkata", latitude: 12.9716, longitude: 77.5946 }), 201);
        if (blr.path !== "APAC.BLR_01" || blr.ancestors.length !== 1) throw new Error("child path or ancestors wrong");
        const pune = expectStatus("create top-level site", await call(A, "POST", "/v1/nodes",
          { code: "PNQ_01", displayName: "Pune 01", nodeTypeId: site.id, countryCode: "IN", timeZone: "Asia/Kolkata" }), 201);
        expectStatus("reject subdivision outside country", await call(A, "POST", "/v1/nodes",
          { code: "BAD", displayName: "Bad", nodeTypeId: site.id, countryCode: "GB", subdivisionCode: "IN-KA" }), 400);
        expectStatus("reject duplicate sibling code", await call(A, "POST", "/v1/nodes",
          { code: "BLR_01", displayName: "Duplicate", nodeTypeId: site.id, parentId: apac.id }), 409);
        const moved = expectStatus("move site under region", await call(A, "POST", `/v1/nodes/${pune.id}/move`,
          { expectedVersion: 1, newParentId: apac.id }), 200);
        if (moved.path !== "APAC.PNQ_01" || moved.parentId !== apac.id || moved.version !== 2) throw new Error("move did not re-path");
        expectStatus("reject cyclic move", await call(A, "POST", `/v1/nodes/${apac.id}/move`,
          { expectedVersion: 1, newParentId: blr.id }), 422);
        expectStatus("reject deactivating a region with active sites", await call(A, "PATCH", `/v1/nodes/${apac.id}`,
          { expectedVersion: 1, status: "INACTIVE" }), 409);
        process.stdout.write(JSON.stringify({ apac: apac.id, blr: blr.id, pune: pune.id, site: site.id }));
      }
      async function phaseVerify() {
        const ids = JSON.parse(env.IDS);
        const A = env.TOKEN_A, B = env.TOKEN_B;
        const subtree = expectStatus("subtree after restart", await call(A, "GET", `/v1/nodes?under=${ids.apac}`), 200);
        const paths = subtree.items.map((item) => item.path).sort();
        if (JSON.stringify(paths) !== JSON.stringify(["APAC.BLR_01", "APAC.PNQ_01"])) throw new Error(`persisted subtree wrong: ${paths}`);
        const detail = expectStatus("read site", await call(A, "GET", `/v1/nodes/${ids.blr}`), 200);
        if (detail.timeZone !== "Asia/Kolkata" || detail.subdivisionCode !== "IN-KA") throw new Error("attributes not persisted");
        const renamed = expectStatus("versioned rename", await call(A, "PATCH", `/v1/nodes/${ids.blr}`,
          { expectedVersion: 1, displayName: "Bengaluru 01 (renamed)" }), 200);
        if (renamed.version !== 2) throw new Error("rename must advance the version");
        expectStatus("stale rename conflict", await call(A, "PATCH", `/v1/nodes/${ids.blr}`,
          { expectedVersion: 1, displayName: "stale" }), 409);
        const foreign = expectStatus("tenant B list", await call(B, "GET", "/v1/nodes"), 200);
        if (foreign.tenantNodeCount !== 0 || foreign.items.length !== 0) throw new Error("tenant B can see tenant A places");
        const foreignTypes = expectStatus("tenant B node types", await call(B, "GET", "/v1/node-types"), 200);
        if (foreignTypes.items.length !== 0) throw new Error("tenant B can see tenant A node types");
        expectStatus("tenant B read", await call(B, "GET", `/v1/nodes/${ids.blr}`), 404);
        expectStatus("tenant B update", await call(B, "PATCH", `/v1/nodes/${ids.blr}`, { expectedVersion: 2, displayName: "x" }), 404);
        expectStatus("tenant B move", await call(B, "POST", `/v1/nodes/${ids.blr}/move`, { expectedVersion: 2, newParentId: null }), 404);
        expectStatus("tenant B create under A", await call(B, "POST", "/v1/nodes",
          { code: "X", displayName: "X", nodeTypeId: ids.site, parentId: ids.apac }), 404);
      }
      function denied(label, result) {
        expectStatus(label, result, 403);
        if (result.body?.code !== "SPATIAL_SCOPE_DENIED") throw new Error(`${label}: expected SPATIAL_SCOPE_DENIED, received ${JSON.stringify(result.body)}`);
      }
      async function phaseScoped() {
        const ids = JSON.parse(env.IDS);
        const A = env.TOKEN_A, C = env.TOKEN_C, D = env.TOKEN_D;
        const visible = expectStatus("scoped list", await call(C, "GET", "/v1/nodes"), 200);
        const paths = visible.items.map((item) => item.path).sort();
        if (JSON.stringify(paths) !== JSON.stringify(["APAC.BLR_01"]) || visible.tenantNodeCount !== 1) {
          throw new Error(`scoped member must see only the assigned site: ${paths} of ${visible.tenantNodeCount}`);
        }
        const site = expectStatus("scoped read of the assigned site", await call(C, "GET", `/v1/nodes/${ids.blr}`), 200);
        if (site.ancestors.length !== 0) throw new Error("ancestors outside the scope must not be disclosed");
        expectStatus("scoped read of the parent region", await call(C, "GET", `/v1/nodes/${ids.apac}`), 404);
        expectStatus("scoped read of a sibling site", await call(C, "GET", `/v1/nodes/${ids.pune}`), 404);
        expectStatus("scoped update outside scope", await call(C, "PATCH", `/v1/nodes/${ids.pune}`, { expectedVersion: 2, displayName: "x" }), 404);
        expectStatus("scoped create under a parent outside scope", await call(C, "POST", "/v1/nodes",
          { code: "Z", displayName: "Z", nodeTypeId: ids.site, parentId: ids.apac }), 404);
        denied("scoped top-level create", await call(C, "POST", "/v1/nodes", { code: "TOP", displayName: "Top", nodeTypeId: ids.site }));
        denied("scoped move to the top level", await call(C, "POST", `/v1/nodes/${ids.blr}/move`, { expectedVersion: 2, newParentId: null }));
        denied("scoped place-type create", await call(C, "POST", "/v1/node-types", { code: "ZONE", label: "Zone" }));
        const zone = expectStatus("scoped create inside the assigned site", await call(C, "POST", "/v1/nodes",
          { code: "ZONE_A", displayName: "Zone A", nodeTypeId: ids.site, parentId: ids.blr }), 201);
        if (zone.path !== "APAC.BLR_01.ZONE_A") throw new Error("scoped child path wrong");
        const none = expectStatus("empty scope list", await call(D, "GET", "/v1/nodes"), 200);
        if (none.items.length !== 0 || none.tenantNodeCount !== 0) throw new Error("an empty scope must reach no places");
        expectStatus("empty scope read", await call(D, "GET", `/v1/nodes/${ids.blr}`), 404);
        // An administrator re-paths the assigned site: the scope follows the place id, not its old path.
        const moved = expectStatus("administrator moves the assigned site to the top level", await call(A, "POST",
          `/v1/nodes/${ids.blr}/move`, { expectedVersion: 2, newParentId: null }), 200);
        if (moved.path !== "BLR_01") throw new Error("administrator move did not re-path");
        const after = expectStatus("scoped list after the move", await call(C, "GET", "/v1/nodes"), 200);
        const afterPaths = after.items.map((item) => item.path).sort();
        if (JSON.stringify(afterPaths) !== JSON.stringify(["BLR_01", "BLR_01.ZONE_A"])) {
          throw new Error(`scope did not follow the moved site: ${afterPaths}`);
        }
      }
      async function phaseImport() {
        const A = env.TOKEN_A, B = env.TOKEN_B, C = env.TOKEN_C;
        const count = async () => expectStatus("count places", await call(A, "GET", "/v1/nodes?pageSize=1"), 200).tenantNodeCount;
        const before = await count();
        const mixed = [
          { code: "EMEA", displayName: "Europe", nodeTypeCode: "region" },
          { code: "LON_01", displayName: "London 01", nodeTypeCode: "SITE", parentPath: "EMEA", countryCode: "GB", subdivisionCode: "GB-ENG", timeZone: "Europe/London" },
          { code: "X_01", displayName: "Orphan", nodeTypeCode: "SITE", parentPath: "NOWHERE" },
          { code: "BLR_01", displayName: "Duplicate of an existing place", nodeTypeCode: "SITE" },
        ];
        const checked = expectStatus("validate a mixed file", await call(A, "POST", "/v1/nodes/import", { mode: "VALIDATE", rows: mixed }), 200);
        const reported = checked.errors.map((error) => `${error.row}:${error.field}`).join(",");
        if (checked.valid || reported !== "3:parentPath,4:code") throw new Error(`validation report wrong: ${reported}`);
        const refused = expectStatus("commit an invalid file", await call(A, "POST", "/v1/nodes/import", { mode: "COMMIT", rows: mixed }), 422);
        if (refused.code !== "SPATIAL_IMPORT_INVALID") throw new Error("invalid commit must be refused as a whole");
        if (await count() !== before) throw new Error("validation or a refused commit wrote places");
        const good = [
          { code: "LON_01_DOCK", displayName: "London dock", nodeTypeCode: "SITE", parentPath: "EMEA.LON_01" },
          ...mixed.slice(0, 2),
          { code: "BLR_DOCK", displayName: "Bengaluru dock", nodeTypeCode: "SITE", parentPath: "BLR_01" },
        ];
        const committed = expectStatus("commit a valid multi-level file", await call(A, "POST", "/v1/nodes/import", { mode: "COMMIT", rows: good }), 200);
        if (committed.created !== 4 || await count() !== before + 4) throw new Error("valid import did not create four places");
        const emea = expectStatus("imported region", await call(A, "GET", "/v1/nodes?q=EMEA"), 200).items.find((item) => item.path === "EMEA");
        const under = expectStatus("imported sub-tree", await call(A, "GET", `/v1/nodes?under=${emea.id}`), 200).items.map((item) => item.path).sort();
        if (JSON.stringify(under) !== JSON.stringify(["EMEA.LON_01", "EMEA.LON_01.LON_01_DOCK"])) throw new Error(`imported hierarchy wrong: ${under}`);
        expectStatus("re-import the same file", await call(A, "POST", "/v1/nodes/import", { mode: "COMMIT", rows: good }), 422);
        if (await count() !== before + 4) throw new Error("a refused re-import wrote places");
        denied("scoped member import", await call(C, "POST", "/v1/nodes/import", { mode: "VALIDATE", rows: good }));
        const foreign = expectStatus("tenant B validates against tenant A parents", await call(B, "POST", "/v1/nodes/import",
          { mode: "VALIDATE", rows: [{ code: "Z", displayName: "Z", nodeTypeCode: "SITE", parentPath: "EMEA" }] }), 200);
        if (foreign.valid || !foreign.errors.some((error) => error.field === "parentPath")) throw new Error("tenant B resolved a tenant A parent");
        const bulk = [{ code: "BULK", displayName: "Bulk region", nodeTypeCode: "REGION" },
          ...Array.from({ length: 1999 }, (_, index) => ({ code: `SITE_${index}`, displayName: `Bulk site ${index}`, nodeTypeCode: "SITE",
            parentPath: "BULK", countryCode: "IN", timeZone: "Asia/Kolkata", latitude: 12.9716, longitude: 77.5946 }))];
        const started = Date.now();
        const full = expectStatus("commit 2,000 places", await call(A, "POST", "/v1/nodes/import", { mode: "COMMIT", rows: bulk }), 200);
        const elapsed = Date.now() - started;
        if (full.created !== 2000 || elapsed > 15000) throw new Error(`2,000-row import created ${full.created} in ${elapsed} ms`);
        process.stdout.write(String(elapsed));
      }
      ({ create: phaseCreate, verify: phaseVerify, scoped: phaseScoped, import: phaseImport })[env.PHASE]()
        .catch((error) => { console.error(error.message); process.exit(1); });
    '
}

evidence_count() {
  local table="$1"
  local tenant="$2"
  docker exec "${POSTGRES_CONTAINER}" psql -U "${ADMIN_USER}" -d "${DATABASE_NAME}" -At -v ON_ERROR_STOP=1 \
    -c "SELECT count(*) FROM gigalibs_geospatial.${table} WHERE tenant_id = '${tenant}';"
}

wait_until_healthy() {
  local container="$1"
  for _ in $(seq 1 60); do
    if [[ "$(docker inspect --format '{{.State.Health.Status}}' "${container}")" == "healthy" ]]; then return 0; fi
    sleep 2
  done
  echo "Error: ${container} did not become healthy after restart." >&2
  exit 1
}

for file in "${BASE_ENV}" "${GEOSPATIAL_ENV}"; do
  if [[ ! -f "${file}" ]]; then
    echo "Error: ${file} is required." >&2
    exit 1
  fi
done

PRIVATE_KEY_BASE64="$(read_value "${GEOSPATIAL_ENV}" GEOSPATIAL_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64)"
POSTGRES_CONTAINER="$(read_value "${BASE_ENV}" CONTROL_POSTGRES_CONTAINER)"
ADMIN_USER="$(read_value "${BASE_ENV}" CONTROL_DB_USER)"
DATABASE_NAME="$(SOURCE_URL="$(read_value "${GEOSPATIAL_ENV}" GEOSPATIAL_MIGRATIONS_DATABASE_URL)" \
  node -e 'process.stdout.write(new URL(process.env.SOURCE_URL).pathname.slice(1))')"
RUN_ID="$(date -u +'%Y%m%dT%H%M%SZ')"
TENANT_A="wi-oi-063-cert-a-${RUN_ID}"
TENANT_B="wi-oi-063-cert-b-${RUN_ID}"
TOKEN_A="$(sign_context "${TENANT_A}")"
TOKEN_B="$(sign_context "${TENANT_B}")"

IDS="$(run_phase create)"

CONTAINER_ID="$(compose ps -q geospatial-api)"
docker restart "${CONTAINER_ID}" >/dev/null
wait_until_healthy "${CONTAINER_ID}"

run_phase verify

BLR_ID="$(IDS="${IDS}" node -e 'process.stdout.write(JSON.parse(process.env.IDS).blr)')"
TOKEN_C="$(sign_context "${TENANT_A}" "{\"mode\":\"SCOPED_PLACES\",\"place_ids\":[\"${BLR_ID}\"]}")"
TOKEN_D="$(sign_context "${TENANT_A}" '{"mode":"SCOPED_PLACES","place_ids":[]}')"
run_phase scoped
IMPORT_MS="$(run_phase import)"

# Tenant A: 7 from the hierarchy journey; the scoped zone (1 audit, 1 outbox); the administrator's move of the
# site with its zone (1 audit, 2 outbox); the 4-place import (4 + 1 summary audit, 4 outbox); the 2,000-place
# import (2,000 + 1 summary audit, 2,000 outbox). Denied and refused requests leave no evidence.
for expectation in audit_events:2015 outbox_events:2014; do
  table="${expectation%%:*}"
  expected="${expectation##*:}"
  count_a="$(evidence_count "${table}" "${TENANT_A}")"
  count_b="$(evidence_count "${table}" "${TENANT_B}")"
  if [[ "${count_a}" != "${expected}" || "${count_b}" != "0" ]]; then
    echo "Error: ${table} expected ${expected} rows for tenant A and 0 for tenant B; found ${count_a} and ${count_b}." >&2
    exit 1
  fi
done

echo "WI-OI-063 places journey passed for run ${RUN_ID}: node types, region and sites, jurisdiction validation, duplicate and cyclic rejection, sub-tree move with re-pathing, restart persistence, versioned rename and conflict, active-descendant guard, two-tenant denial, spatial scope (assigned-site reach, hidden ancestors, not-found outside scope, top-level/type denial, empty scope, scope follows a moved place), bulk import (row-level validation, all-or-nothing commit and re-import, multi-level parents, scoped and cross-tenant denial, 2,000 places in ${IMPORT_MS} ms), 2015 audit and 2014 outbox records."
