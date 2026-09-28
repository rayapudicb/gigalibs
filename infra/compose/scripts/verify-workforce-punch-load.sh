#!/usr/bin/env bash
set -euo pipefail

# WI-OI-069 punch ingestion baseline against the running Workforce API: TOTAL distinct punches (default 12,000)
# from 100 linked workers with IN_FLIGHT requests outstanding (default 200), every tenth punch resent, 429s
# retried with the same event id. Asserts exactly-once storage and prints punches per minute, the input to the
# roadmap decision "Redis Streams or Kafka only if the P7 baseline is below 25,000 punches per minute".

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
BASE_ENV="${COMPOSE_DIR}/.env"
WORKFORCE_ENV="${COMPOSE_DIR}/.env.workforce"
TOTAL="${TOTAL:-12000}"
IN_FLIGHT="${IN_FLIGHT:-200}"

read_value() {
  local file="$1" key="$2" value
  value="$(awk -v key="${key}" 'index($0, key "=") == 1 { print substr($0, length(key) + 2); exit }' "${file}")"
  if [[ -z "${value}" ]]; then
    echo "Error: ${key} is missing from ${file}." >&2
    exit 1
  fi
  printf '%s' "${value}"
}

fail() {
  echo "Error: $*" >&2
  exit 1
}

CONTAINER="$(docker ps -q --filter label=com.docker.compose.service=workforce-api --filter status=running | head -1)"
[[ -n "${CONTAINER}" ]] || fail "the Workforce API container is not running."
POSTGRES_CONTAINER="$(read_value "${BASE_ENV}" CONTROL_POSTGRES_CONTAINER)"
ADMIN_USER="$(read_value "${BASE_ENV}" CONTROL_DB_USER)"
DATABASE_NAME="$(SOURCE_URL="$(read_value "${WORKFORCE_ENV}" WORKFORCE_MIGRATIONS_DATABASE_URL)" node -e 'process.stdout.write(new URL(process.env.SOURCE_URL).pathname.slice(1))')"
RUN_ID="$(date -u +'%Y%m%dT%H%M%SZ')"
TENANT="wi-oi-069-load-${RUN_ID}"

TOKENS="$(PRIVATE_KEY_BASE64="$(read_value "${WORKFORCE_ENV}" WORKFORCE_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64)" TENANT="${TENANT}" RUN="${RUN_ID}" node -e '
  const { createPrivateKey, randomUUID, sign } = require("node:crypto");
  const key = createPrivateKey({ key: Buffer.from(process.env.PRIVATE_KEY_BASE64, "base64"), format: "der", type: "pkcs8" });
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const token = (sub, scopes) => {
    const data = `${encode({ alg: "EdDSA", typ: "JWT" })}.${encode({
      iss: "gigalibs-control-plane", aud: "gigalibs-workforce-api", sub, tenant_id: process.env.TENANT, session_id: `load-${sub}`,
      auth_version: 1, roles: ["MEMBER"], granted_scopes: scopes, persona_type: "OPERATIONS_SUPERVISOR", org_scope: { mode: "FLAT_TENANT" },
      entitlement: { module_key: "gigaops", status: "ENABLED", version: "wi-oi-069" }, iat: now, exp: now + 900, jti: randomUUID(),
    })}`;
    return `${data}.${sign(null, Buffer.from(data), key).toString("base64url")}`;
  };
  const subjects = Array.from({ length: 100 }, (_, index) => `load-${index}-${process.env.RUN}`);
  process.stdout.write(JSON.stringify({
    admin: token(`load-admin-${process.env.RUN}`, ["workforce:*"]),
    workers: { subjects, tokens: subjects.map((subject) => token(subject, ["workforce.time.punch"])) },
  }));
')"

RESULT="$(docker exec -i -e "RUN=${RUN_ID}" -e "TOKENS=${TOKENS}" -e "TOTAL=${TOTAL}" -e "IN_FLIGHT=${IN_FLIGHT}" "${CONTAINER}" \
  node --input-type=module - <"${SCRIPT_DIR}/workforce-punch-load.mjs")" || fail "the load run failed."

STORED="$(docker exec -i "${POSTGRES_CONTAINER}" psql -U "${ADMIN_USER}" -d "${DATABASE_NAME}" -At -q \
  -c "SELECT count(*) || ':' || count(DISTINCT (device_id, device_event_id)) FROM gigalibs_workforce.punches WHERE tenant_id = '${TENANT}';")"
[[ "${STORED}" == "${TOTAL}:${TOTAL}" ]] || fail "stored ${STORED} (count:distinct) for ${TOTAL} punches."
CREATED="$(RESULT="${RESULT}" node -e 'process.stdout.write(String(JSON.parse(process.env.RESULT).punches))')"
[[ "${CREATED}" == "${TOTAL}" ]] || fail "${CREATED} punches were created for ${TOTAL} sent."

echo "WI-OI-069 punch baseline for run ${RUN_ID}: ${RESULT}; stored exactly once (${STORED})."

if [[ "${KEEP_TENANT:-false}" != "true" ]]; then
  docker exec -i "${POSTGRES_CONTAINER}" psql -U "${ADMIN_USER}" -d "${DATABASE_NAME}" -q \
    -c "DELETE FROM gigalibs_workforce.outbox_events WHERE tenant_id = '${TENANT}';
        DELETE FROM gigalibs_workforce.punches WHERE tenant_id = '${TENANT}';
        DELETE FROM gigalibs_workforce.audit_events WHERE tenant_id = '${TENANT}';
        DELETE FROM gigalibs_workforce.workforce_resources WHERE tenant_id = '${TENANT}';"
  echo "Cleaned up load benchmark tenant ${TENANT}."
fi
