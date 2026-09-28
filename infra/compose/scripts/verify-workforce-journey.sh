#!/usr/bin/env bash
set -euo pipefail

# WI-OI-061 business-journey certification against the running local Workforce API.
# Creates attributable certification records under two run-scoped tenants (wi-oi-061-cert-*):
# tenant A creates, restarts, reads and updates; tenant B is denied every read and write.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
BASE_ENV="${COMPOSE_DIR}/.env"
WORKFORCE_ENV="${COMPOSE_DIR}/.env.workforce"

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
    --env-file "${WORKFORCE_ENV}" \
    -f "${COMPOSE_DIR}/compose.yaml" \
    -f "${COMPOSE_DIR}/compose.workforce.local.yaml" \
    "$@"
}

sign_context() {
  local tenant="$1"
  PRIVATE_KEY_BASE64="${PRIVATE_KEY_BASE64}" TENANT="${tenant}" node -e '
    const { createPrivateKey, randomUUID, sign } = require("node:crypto");
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const payload = encode({
      iss: "gigalibs-control-plane",
      aud: "gigalibs-workforce-api",
      sub: "wi-oi-061-journey-certifier",
      tenant_id: process.env.TENANT,
      session_id: `wi-oi-061-journey-${process.env.TENANT}`,
      auth_version: 1,
      roles: ["TENANT_ADMIN"],
      granted_scopes: ["workforce:*"],
      persona_type: "OPERATIONS_SUPERVISOR",
      org_scope: { mode: "FLAT_TENANT" },
      entitlement: { module_key: "gigaops", status: "ENABLED", version: "wi-oi-061" },
      iat: now,
      exp: now + 600,
      jti: randomUUID()
    });
    const data = `${encode({ alg: "EdDSA", typ: "JWT" })}.${payload}`;
    const key = createPrivateKey({ key: Buffer.from(process.env.PRIVATE_KEY_BASE64, "base64"), format: "der", type: "pkcs8" });
    process.stdout.write(`${data}.${sign(null, Buffer.from(data), key).toString("base64url")}`);
  '
}

# Runs one journey phase inside the Workforce container so no module port is published.
run_phase() {
  local phase="$1"
  docker exec \
    -e "PHASE=${phase}" -e "RUN=${RUN_ID}" -e "TOKEN_A=${TOKEN_A}" -e "TOKEN_B=${TOKEN_B}" \
    -e "RESOURCE_ID=${RESOURCE_ID:-}" -e "CAPABILITY_ID=${CAPABILITY_ID:-}" \
    "$(compose ps -q workforce-api)" node -e '
      const base = "http://127.0.0.1:4700";
      const env = process.env;
      async function call(token, method, path, body) {
        const response = await fetch(`${base}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            "X-Correlation-Id": `wi-oi-061-journey-${env.RUN}`,
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
        const capability = expectStatus("create capability", await call(env.TOKEN_A, "POST", "/v1/capabilities",
          { code: `CERT-${env.RUN}-CAP`, name: "WI-OI-061 certification capability" }), 200, 201);
        const resource = expectStatus("create TEAM resource", await call(env.TOKEN_A, "POST", "/v1/resources",
          { referenceCode: `CERT-${env.RUN}-RES`, displayName: "WI-OI-061 certification team", resourceType: "TEAM" }), 200, 201);
        if (resource.version !== 1 || resource.resourceType !== "TEAM") throw new Error("new resource must be TEAM at version 1");
        expectStatus("reject retired CREW type", await call(env.TOKEN_A, "POST", "/v1/resources",
          { referenceCode: `CERT-${env.RUN}-OLD`, displayName: "Retired type", resourceType: "CREW" }), 400);
        expectStatus("assign capability", await call(env.TOKEN_A, "POST", `/v1/resources/${resource.id}/capabilities`,
          { capabilityDefinitionId: capability.id, validFrom: new Date().toISOString() }), 200, 201);
        process.stdout.write(JSON.stringify({ resourceId: resource.id, capabilityId: capability.id }));
      }
      async function phaseVerify() {
        const page = expectStatus("tenant A search after restart", await call(env.TOKEN_A, "GET", `/v1/resources?q=CERT-${env.RUN}`), 200);
        const listed = page.items.find((item) => item.id === env.RESOURCE_ID);
        if (!listed || listed.qualificationCount !== 1) throw new Error("persisted resource or qualification missing after restart");
        const detail = expectStatus("tenant A read", await call(env.TOKEN_A, "GET", `/v1/resources/${env.RESOURCE_ID}`), 200);
        if (detail.qualifications?.length !== 1) throw new Error("qualification detail missing after restart");
        const updated = expectStatus("tenant A versioned update", await call(env.TOKEN_A, "PATCH", `/v1/resources/${env.RESOURCE_ID}`,
          { expectedVersion: 1, displayName: "WI-OI-061 certification team (updated)" }), 200);
        if (updated.version !== 2) throw new Error("update must advance the version to 2");
        expectStatus("stale version conflict", await call(env.TOKEN_A, "PATCH", `/v1/resources/${env.RESOURCE_ID}`,
          { expectedVersion: 1, displayName: "stale" }), 409);
        const foreign = expectStatus("tenant B search", await call(env.TOKEN_B, "GET", `/v1/resources?q=CERT-${env.RUN}`), 200);
        if (foreign.total !== 0) throw new Error("tenant B can see tenant A resources");
        expectStatus("tenant B read", await call(env.TOKEN_B, "GET", `/v1/resources/${env.RESOURCE_ID}`), 404);
        expectStatus("tenant B update", await call(env.TOKEN_B, "PATCH", `/v1/resources/${env.RESOURCE_ID}`,
          { expectedVersion: 2, displayName: "cross-tenant write" }), 404);
        expectStatus("tenant B assign", await call(env.TOKEN_B, "POST", `/v1/resources/${env.RESOURCE_ID}/capabilities`,
          { capabilityDefinitionId: env.CAPABILITY_ID, validFrom: new Date().toISOString() }), 404);
        const capabilities = expectStatus("tenant B capabilities", await call(env.TOKEN_B, "GET", "/v1/capabilities"), 200);
        if (capabilities.items.some((item) => item.id === env.CAPABILITY_ID)) throw new Error("tenant B can see tenant A capabilities");
      }
      (env.PHASE === "create" ? phaseCreate() : phaseVerify())
        .catch((error) => { console.error(error.message); process.exit(1); });
    '
}

evidence_count() {
  local table="$1"
  local tenant="$2"
  docker exec "${POSTGRES_CONTAINER}" psql -U "${ADMIN_USER}" -d "${DATABASE_NAME}" -At -v ON_ERROR_STOP=1 \
    -c "SELECT count(*) FROM gigalibs_workforce.${table} WHERE tenant_id = '${tenant}';"
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

for file in "${BASE_ENV}" "${WORKFORCE_ENV}"; do
  if [[ ! -f "${file}" ]]; then
    echo "Error: ${file} is required." >&2
    exit 1
  fi
done

PRIVATE_KEY_BASE64="$(read_value "${WORKFORCE_ENV}" WORKFORCE_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64)"
POSTGRES_CONTAINER="$(read_value "${BASE_ENV}" CONTROL_POSTGRES_CONTAINER)"
ADMIN_USER="$(read_value "${BASE_ENV}" CONTROL_DB_USER)"
DATABASE_NAME="$(SOURCE_URL="$(read_value "${WORKFORCE_ENV}" WORKFORCE_MIGRATIONS_DATABASE_URL)" \
  node -e 'process.stdout.write(new URL(process.env.SOURCE_URL).pathname.slice(1))')"
RUN_ID="$(date -u +'%Y%m%dT%H%M%SZ')"
TENANT_A="wi-oi-061-cert-a-${RUN_ID}"
TENANT_B="wi-oi-061-cert-b-${RUN_ID}"
TOKEN_A="$(sign_context "${TENANT_A}")"
TOKEN_B="$(sign_context "${TENANT_B}")"

CREATED="$(run_phase create)"
RESOURCE_ID="$(CREATED="${CREATED}" node -e 'process.stdout.write(JSON.parse(process.env.CREATED).resourceId)')"
CAPABILITY_ID="$(CREATED="${CREATED}" node -e 'process.stdout.write(JSON.parse(process.env.CREATED).capabilityId)')"

CONTAINER_ID="$(compose ps -q workforce-api)"
docker restart "${CONTAINER_ID}" >/dev/null
wait_until_healthy "${CONTAINER_ID}"

run_phase verify

for table in audit_events outbox_events; do
  count_a="$(evidence_count "${table}" "${TENANT_A}")"
  count_b="$(evidence_count "${table}" "${TENANT_B}")"
  if [[ "${count_a}" != "4" || "${count_b}" != "0" ]]; then
    echo "Error: ${table} expected 4 rows for tenant A and 0 for tenant B; found ${count_a} and ${count_b}." >&2
    exit 1
  fi
done

echo "WI-OI-061 journey passed for run ${RUN_ID}: create, TEAM-only type, assign, restart persistence, versioned update and conflict, two-tenant denial, 4 audit and 4 outbox records."
