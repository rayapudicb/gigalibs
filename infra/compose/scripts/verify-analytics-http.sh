#!/usr/bin/env bash
set -euo pipefail

# WI-OI-064a live verification of the running Analytics API: it trusts only the BFF-signed PlatformContextV1.
# Creates attributable setup records for two run-scoped tenants (wi-oi-064-cert-*) and one revocation record.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
BASE_ENV="${COMPOSE_DIR}/.env"
MODULES_ENV="${COMPOSE_DIR}/.env.modules"

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

# sign_context KEY_BASE64 AUDIENCE MODULE_KEY SCOPES TENANT [SESSION]
sign_context() {
  PRIVATE_KEY_BASE64="$1" AUDIENCE="$2" MODULE_KEY="$3" SCOPES="$4" TENANT="$5" SESSION="${6:-session-${RUN_ID}}" \
    node -e '
      const { createPrivateKey, randomUUID, sign } = require("node:crypto");
      const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
      const now = Math.floor(Date.now() / 1000);
      const payload = encode({
        iss: "gigalibs-control-plane",
        aud: process.env.AUDIENCE,
        sub: "wi-oi-064-certifier",
        tenant_id: process.env.TENANT,
        session_id: process.env.SESSION,
        auth_version: 1,
        roles: ["MEMBER"],
        granted_scopes: process.env.SCOPES ? process.env.SCOPES.split(",") : [],
        persona_type: "OPERATIONS_SUPERVISOR",
        org_scope: { mode: "FLAT_TENANT" },
        spatial_scope: { mode: "UNBOUNDED" },
        entitlement: { module_key: process.env.MODULE_KEY, status: "ENABLED", version: "wi-oi-064" },
        iat: now,
        exp: now + 120,
        jti: randomUUID()
      });
      const key = createPrivateKey({ key: Buffer.from(process.env.PRIVATE_KEY_BASE64, "base64"), format: "der", type: "pkcs8" });
      const data = `${Buffer.from(JSON.stringify({ alg: "EdDSA", typ: "JWT" })).toString("base64url")}.${payload}`;
      process.stdout.write(`${data}.${sign(null, Buffer.from(data), key).toString("base64url")}`);
    '
}

# request METHOD PATH EXPECTED_STATUS [TOKEN] [EXPECTED_CONFIGURED]
request() {
  docker exec -e "METHOD=$1" -e "ENDPOINT=$2" -e "EXPECTED=$3" -e "AUTH_TOKEN=${4-}" -e "CONFIGURED=${5-}" \
    "${CONTAINER_ID}" node -e '
      const headers = process.env.AUTH_TOKEN ? { Authorization: `Bearer ${process.env.AUTH_TOKEN}` } : {};
      fetch(`http://127.0.0.1:4400${process.env.ENDPOINT}`, { method: process.env.METHOD, headers })
        .then(async (response) => {
          const body = await response.json().catch(() => null);
          if (response.status !== Number(process.env.EXPECTED)) {
            throw new Error(`${process.env.METHOD} ${process.env.ENDPOINT}: expected ${process.env.EXPECTED}, received ${response.status}`);
          }
          if (process.env.CONFIGURED && String(body?.configured) !== process.env.CONFIGURED) {
            throw new Error(`${process.env.ENDPOINT}: expected configured=${process.env.CONFIGURED}, received ${JSON.stringify(body)}`);
          }
        })
        .catch((error) => { console.error(error.message); process.exit(1); });
    '
}

for file in "${BASE_ENV}" "${MODULES_ENV}"; do
  if [[ ! -f "${file}" ]]; then
    echo "Error: ${file} is required." >&2
    exit 1
  fi
done

PRIVATE_KEY_BASE64="$(read_value "${MODULES_ENV}" ANALYTICS_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64)"
POSTGRES_CONTAINER="$(read_value "${BASE_ENV}" CONTROL_POSTGRES_CONTAINER)"
ADMIN_USER="$(read_value "${BASE_ENV}" CONTROL_DB_USER)"
DATABASE_NAME="$(SOURCE_URL="$(read_value "${MODULES_ENV}" MODULE_MIGRATIONS_DATABASE_URL)" \
  node -e 'process.stdout.write(new URL(process.env.SOURCE_URL).pathname.slice(1))')"
CONTAINER_ID="$(docker compose --env-file "${BASE_ENV}" --env-file "${MODULES_ENV}" \
  -f "${COMPOSE_DIR}/compose.yaml" -f "${COMPOSE_DIR}/compose.modules.local.yaml" ps -q analytics-api)"
if [[ -z "${CONTAINER_ID}" ]]; then
  echo "Error: Analytics API container is not running." >&2
  exit 1
fi

RUN_ID="$(date -u +'%Y%m%dT%H%M%SZ')"
TENANT_A="wi-oi-064-cert-a-${RUN_ID}"
TENANT_B="wi-oi-064-cert-b-${RUN_ID}"
FOREIGN_KEY_BASE64="$(openssl genpkey -algorithm Ed25519 2>/dev/null | openssl pkey -outform DER | base64 | tr -d '\n')"
AUDIENCE=gigalibs-analytics-api
MODULE=analytics-studio

READ_A="$(sign_context "${PRIVATE_KEY_BASE64}" "${AUDIENCE}" "${MODULE}" analytics:read "${TENANT_A}")"
ACTION_A="$(sign_context "${PRIVATE_KEY_BASE64}" "${AUDIENCE}" "${MODULE}" analytics:read,analytics:action "${TENANT_A}")"
READ_B="$(sign_context "${PRIVATE_KEY_BASE64}" "${AUDIENCE}" "${MODULE}" analytics:read "${TENANT_B}")"
WRONG_AUDIENCE="$(sign_context "${PRIVATE_KEY_BASE64}" gigalibs-geospatial-api "${MODULE}" analytics:read "${TENANT_A}")"
WRONG_MODULE="$(sign_context "${PRIVATE_KEY_BASE64}" "${AUDIENCE}" geospatial-studio analytics:read "${TENANT_A}")"
NO_SCOPE="$(sign_context "${PRIVATE_KEY_BASE64}" "${AUDIENCE}" "${MODULE}" '' "${TENANT_A}")"
FOREIGN_KEY="$(sign_context "${FOREIGN_KEY_BASE64}" "${AUDIENCE}" "${MODULE}" analytics:read "${TENANT_A}")"
REVOKED="$(sign_context "${PRIVATE_KEY_BASE64}" "${AUDIENCE}" "${MODULE}" analytics:read "${TENANT_A}" "revoked-${RUN_ID}")"

STATUS=/v1/setup/status
request GET "${STATUS}" 401
request GET "${STATUS}" 401 "${WRONG_AUDIENCE}"
request GET "${STATUS}" 401 "${FOREIGN_KEY}"
request GET "${STATUS}" 403 "${WRONG_MODULE}"
request GET "${STATUS}" 403 "${NO_SCOPE}"
# The self-issued development token endpoint no longer exists.
request POST "/oidc/dev/token?tenantId=${TENANT_B}&sub=attacker" 404
request GET /oidc/dev/.well-known/jwks.json 404

request GET "${STATUS}" 200 "${READ_A}" false
request POST /v1/setup 403 "${READ_A}"
request POST /v1/setup 201 "${ACTION_A}"
request GET "${STATUS}" 200 "${READ_A}" true
# Forced RLS: tenant B does not see tenant A's setup.
request GET "${STATUS}" 200 "${READ_B}" false

docker exec "${POSTGRES_CONTAINER}" psql -U "${ADMIN_USER}" -d "${DATABASE_NAME}" -q -v ON_ERROR_STOP=1 -c \
  "INSERT INTO gigalibs_analytics.auth_revocation_events (id, tenant_id, revocation_type, session_id, reason)
   VALUES ('wi-oi-064-${RUN_ID}', '${TENANT_A}', 'SESSION', 'revoked-${RUN_ID}', 'WI-OI-064a certification');" >/dev/null
request GET "${STATUS}" 401 "${REVOKED}"

echo "WI-OI-064a live Analytics verification passed for run ${RUN_ID}: signed-context audience, key, module and scope matrix, development issuer removed, action permission enforced, two-tenant RLS isolation and session revocation."
