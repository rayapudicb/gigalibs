#!/usr/bin/env bash
set -euo pipefail

# WI-OI-038 live signed-context matrix against the running CMMS API (no module port is published; calls run
# inside the container): liveness/readiness, missing/foreign/expired/wrong-audience tokens, wrong module,
# missing scope, granular scope, cmms:*, session revocation, and contained routes that must not exist.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
BASE_ENV="${COMPOSE_DIR}/.env"
MODULE_ENV="${COMPOSE_DIR}/.env.modules"

read_value() {
  local file="$1" key="$2" value
  value="$(awk -v key="${key}" 'index($0, key "=") == 1 { print substr($0, length(key) + 2); exit }' "${file}")"
  if [[ -z "${value}" ]]; then
    echo "Error: ${key} is missing from ${file}." >&2
    exit 1
  fi
  printf '%s' "${value}"
}

for file in "${BASE_ENV}" "${MODULE_ENV}"; do
  [[ -f "${file}" ]] || { echo "Error: ${file} is required." >&2; exit 1; }
done

POSTGRES_CONTAINER="$(read_value "${BASE_ENV}" CONTROL_POSTGRES_CONTAINER)"
ADMIN_USER="$(read_value "${BASE_ENV}" CONTROL_DB_USER)"
DATABASE_NAME="$(SOURCE_URL="$(read_value "${MODULE_ENV}" MODULE_MIGRATIONS_DATABASE_URL)" node -e 'process.stdout.write(new URL(process.env.SOURCE_URL).pathname.slice(1))')"
CONTAINER_ID="$(docker ps -q --filter label=com.docker.compose.service=cmms-api --filter status=running | head -1)"
[[ -n "${CONTAINER_ID}" ]] || { echo "Error: the CMMS API container is not running." >&2; exit 1; }
RUN_ID="$(date -u +'%Y%m%dT%H%M%SZ')"
TENANT="wi-oi-038-http-${RUN_ID}"
REVOKED_SESSION="wi-oi-038-revoked-${RUN_ID}"

docker exec "${POSTGRES_CONTAINER}" psql -U "${ADMIN_USER}" -d "${DATABASE_NAME}" -q -v ON_ERROR_STOP=1 \
  -c "INSERT INTO gigalibs_cmms.auth_revocation_events (id, tenant_id, revocation_type, session_id, reason) VALUES ('wi-oi-038-${RUN_ID}', '${TENANT}', 'SESSION', '${REVOKED_SESSION}', 'WI-OI-038 certification');" >/dev/null

PRIVATE_KEY_BASE64="$(read_value "${MODULE_ENV}" CMMS_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64)" \
FOREIGN_KEY_BASE64="$(read_value "${MODULE_ENV}" ANALYTICS_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64)" \
TENANT="${TENANT}" REVOKED_SESSION="${REVOKED_SESSION}" node --input-type=module -e '
  import { createPrivateKey, randomUUID, sign } from "node:crypto";
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  function token(overrides = {}, keyBase64 = process.env.PRIVATE_KEY_BASE64) {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: "gigalibs-control-plane", aud: "gigalibs-cmms-api", sub: "wi-oi-038-certifier",
      tenant_id: process.env.TENANT, session_id: "wi-oi-038-session", auth_version: 1, roles: ["MEMBER"],
      granted_scopes: ["cmms.assets.read"], persona_type: "OPERATIONS_SUPERVISOR", org_scope: { mode: "FLAT_TENANT" },
      entitlement: { module_key: "asset-maintenance", status: "ENABLED", version: "wi-oi-038" },
      iat: now, exp: now + 120, jti: randomUUID(), ...overrides,
    };
    const data = `${encode({ alg: "EdDSA", typ: "JWT" })}.${encode(payload)}`;
    const key = createPrivateKey({ key: Buffer.from(keyBase64, "base64"), format: "der", type: "pkcs8" });
    return `${data}.${sign(null, Buffer.from(data), key).toString("base64url")}`;
  }
  const past = Math.floor(Date.now() / 1000) - 3600;
  const cases = [
    ["liveness", "GET", "/v1/health/live", null, 200],
    ["readiness", "GET", "/v1/health/ready", null, 200],
    ["missing token", "POST", "/v1/assets/search", null, 401],
    ["foreign signing key", "POST", "/v1/assets/search", token({}, process.env.FOREIGN_KEY_BASE64), 401],
    ["expired token", "POST", "/v1/assets/search", token({ iat: past - 60, exp: past }), 401],
    ["wrong audience", "POST", "/v1/assets/search", token({ aud: "gigalibs-workforce-api" }), 401],
    ["wrong module", "POST", "/v1/assets/search", token({ entitlement: { module_key: "gigaops", status: "ENABLED", version: "x" } }), 403],
    ["missing scope", "POST", "/v1/assets/search", token({ granted_scopes: [] }), 403],
    ["other module wildcard", "POST", "/v1/assets/search", token({ granted_scopes: ["workforce:*"] }), 403],
    ["granular read", "POST", "/v1/assets/search", token(), 200],
    ["granular read cannot write", "POST", "/v1/assets", token(), 403],
    ["granular read cannot read parts", "POST", "/v1/parts/search", token(), 403],
    ["cmms:* reads parts", "POST", "/v1/parts/search", token({ granted_scopes: ["cmms:*"] }), 200],
    ["revoked session", "POST", "/v1/assets/search", token({ session_id: process.env.REVOKED_SESSION, granted_scopes: ["cmms:*"] }), 401],
    ["contained: CMMS-local workforce", "GET", "/v1/workforce/resources", token({ granted_scopes: ["*"] }), 404],
    ["contained: vendors", "POST", "/v1/vendors/search", token({ granted_scopes: ["*"] }), 404],
    ["contained: purchase orders", "POST", "/v1/purchase-orders/search", token({ granted_scopes: ["*"] }), 404],
    ["contained: requests", "POST", "/v1/requests/search", token({ granted_scopes: ["*"] }), 404],
    ["contained: imports", "GET", "/v1/imports", token({ granted_scopes: ["*"] }), 404],
    ["contained: IoT ingress", "POST", "/v1/iot/readings", token({ granted_scopes: ["*"] }), 404],
    ["closed: development token issuer", "POST", "/oidc/dev/token", null, 404],
  ];
  process.stdout.write(JSON.stringify(cases));
' | docker exec -i "${CONTAINER_ID}" node --input-type=module -e '
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  const failures = [];
  for (const [label, method, path, bearer, expected] of JSON.parse(input)) {
    const response = await fetch(`http://127.0.0.1:4200${path}`, {
      method,
      headers: { ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), ...(method === "POST" ? { "Content-Type": "application/json" } : {}) },
      ...(method === "POST" ? { body: "{}" } : {}),
    });
    if (response.status !== expected) failures.push(`${label}: expected ${expected}, received ${response.status}`);
  }
  if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
'

echo "WI-OI-038 live CMMS signed-context verification passed for run ${RUN_ID}: health live/ready, missing/foreign/expired/wrong-audience tokens 401, wrong module and missing or foreign scopes 403, granular and cmms:* scopes, revoked session 401, contained people/vendor/procurement/request/import/IoT routes and the development issuer absent."
