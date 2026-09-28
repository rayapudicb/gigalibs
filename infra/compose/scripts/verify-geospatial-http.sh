#!/usr/bin/env bash
set -euo pipefail

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

sign_context() {
  local audience="$1"
  local module_key="$2"
  local scopes="$3"
  PRIVATE_KEY_BASE64="${PRIVATE_KEY_BASE64}" AUDIENCE="${audience}" MODULE_KEY="${module_key}" SCOPES="${scopes}" \
    node -e '
      const { createPrivateKey, sign } = require("node:crypto");
      const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
      const now = Math.floor(Date.now() / 1000);
      const header = encode({ alg: "EdDSA", typ: "JWT" });
      const payload = encode({
        iss: "gigalibs-control-plane",
        aud: process.env.AUDIENCE,
        sub: "wi-oi-063-certifier",
        tenant_id: "wi-oi-063-tenant-a",
        session_id: "wi-oi-063-session-a",
        auth_version: 1,
        roles: ["MEMBER"],
        granted_scopes: process.env.SCOPES ? process.env.SCOPES.split(",") : [],
        persona_type: "OPERATIONS_SUPERVISOR",
        org_scope: { mode: "FLAT_TENANT" },
        entitlement: { module_key: process.env.MODULE_KEY, status: "ENABLED", version: "wi-oi-063" },
        iat: now,
        exp: now + 120,
        jti: "wi-oi-063-http-verification"
      });
      const key = createPrivateKey({
        key: Buffer.from(process.env.PRIVATE_KEY_BASE64, "base64"),
        format: "der",
        type: "pkcs8"
      });
      const data = `${header}.${payload}`;
      process.stdout.write(`${data}.${sign(null, Buffer.from(data), key).toString("base64url")}`);
    '
}

assert_request() {
  local expected_status="$1"
  local token="${2-}"
  local expected_code="${3-}"
  local endpoint="${4-/v1/runtime/tenant-scope}"
  docker exec -e "AUTH_TOKEN=${token}" -e "EXPECTED_STATUS=${expected_status}" -e "EXPECTED_CODE=${expected_code}" -e "ENDPOINT=${endpoint}" \
    "${CONTAINER_ID}" node -e '
      const headers = process.env.AUTH_TOKEN ? { Authorization: `Bearer ${process.env.AUTH_TOKEN}` } : {};
      fetch(`http://127.0.0.1:4720${process.env.ENDPOINT}`, { headers })
        .then(async (response) => {
          const body = await response.json().catch(() => null);
          if (response.status !== Number(process.env.EXPECTED_STATUS)) {
            throw new Error(`expected ${process.env.EXPECTED_STATUS}, received ${response.status}`);
          }
          if (process.env.EXPECTED_CODE === "TENANT" && body?.tenantId !== "wi-oi-063-tenant-a") {
            throw new Error("verified tenant binding was not returned");
          }
        })
        .catch((error) => { console.error(error.message); process.exit(1); });
    '
}

for file in "${BASE_ENV}" "${GEOSPATIAL_ENV}"; do
  if [[ ! -f "${file}" ]]; then
    echo "Error: ${file} is required." >&2
    exit 1
  fi
done

PRIVATE_KEY_BASE64="$(read_value "${GEOSPATIAL_ENV}" GEOSPATIAL_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64)"
CONTAINER_ID="$(docker compose \
  --env-file "${BASE_ENV}" \
  --env-file "${GEOSPATIAL_ENV}" \
  -f "${COMPOSE_DIR}/compose.yaml" \
  -f "${COMPOSE_DIR}/compose.geospatial.local.yaml" \
  ps -q geospatial-api)"
if [[ -z "${CONTAINER_ID}" ]]; then
  echo "Error: Geospatial API container is not running." >&2
  exit 1
fi

VALID_TOKEN="$(sign_context gigalibs-geospatial-api geospatial-studio maps:read)"
WRONG_AUDIENCE_TOKEN="$(sign_context gigalibs-workforce-api geospatial-studio maps:read)"
WRONG_MODULE_TOKEN="$(sign_context gigalibs-geospatial-api gigaops maps:read)"
MISSING_SCOPE_TOKEN="$(sign_context gigalibs-geospatial-api geospatial-studio '')"

assert_request 401
assert_request 401 "${WRONG_AUDIENCE_TOKEN}"
assert_request 403 "${WRONG_MODULE_TOKEN}"
assert_request 403 "${MISSING_SCOPE_TOKEN}"
assert_request 200 "${VALID_TOKEN}" TENANT

# 063a exposes no business API; unknown routes stay closed.
assert_request 404 "${VALID_TOKEN}" '' /v1/spatial/assets

echo "WI-OI-063 live signed-context, audience, entitlement, permission, tenant-binding and closed-route verification passed."
