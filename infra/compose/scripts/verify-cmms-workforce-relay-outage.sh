#!/usr/bin/env bash
set -euo pipefail

# G5 resilience drill for the CMMS ↔ Workforce relay (WI-OI-068). Each peer is stopped in turn while the other
# produces facts:
#   - Workforce down: a CMMS staffing request stays pending, retried with back-off, never dead-lettered; after
#     Workforce returns it is delivered once (one requirement) and CMMS shows it accepted.
#   - CMMS down: a Workforce requirement cancellation stays pending the same way; after CMMS returns it is delivered
#     once (one receipt) and CMMS shows the staffing cancelled.
# Both services are left running and healthy.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
BASE_ENV="${COMPOSE_DIR}/.env"
MODULE_ENV="${COMPOSE_DIR}/.env.modules"
WORKFORCE_ENV="${COMPOSE_DIR}/.env.workforce"

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

# sign_context KEY_BASE64 AUDIENCE MODULE_KEY SCOPE TENANT
sign_context() {
  PRIVATE_KEY_BASE64="$1" AUDIENCE="$2" MODULE_KEY="$3" SCOPE="$4" TENANT="$5" node -e '
    const { createPrivateKey, randomUUID, sign } = require("node:crypto");
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: "gigalibs-control-plane", aud: process.env.AUDIENCE, sub: "outage-drill-certifier", tenant_id: process.env.TENANT,
      session_id: "outage-drill", auth_version: 1, roles: ["TENANT_ADMIN"], granted_scopes: [process.env.SCOPE],
      persona_type: "OPERATIONS_SUPERVISOR", org_scope: { mode: "FLAT_TENANT" },
      entitlement: { module_key: process.env.MODULE_KEY, status: "ENABLED", version: "outage-drill" },
      iat: now, exp: now + 900, jti: randomUUID(),
    };
    const data = `${encode({ alg: "EdDSA", typ: "JWT" })}.${encode(payload)}`;
    const key = createPrivateKey({ key: Buffer.from(process.env.PRIVATE_KEY_BASE64, "base64"), format: "der", type: "pkcs8" });
    process.stdout.write(`${data}.${sign(null, Buffer.from(data), key).toString("base64url")}`);
  '
}

container() {
  docker ps -aq --filter "label=com.docker.compose.service=$1" | head -1
}

# api SERVICE TOKEN METHOD URL [BODY] — runs inside the given service's container against itself.
api() {
  docker exec -i -e "TOKEN=$2" -e "METHOD=$3" -e "TARGET=$4" -e "BODY=${5-}" "$(container "$1")" node --input-type=module -e '
    const e = process.env;
    const response = await fetch(e.TARGET, {
      method: e.METHOD,
      headers: { Authorization: `Bearer ${e.TOKEN}`, ...(e.BODY ? { "Content-Type": "application/json" } : {}) },
      ...(e.BODY ? { body: e.BODY } : {}),
    });
    const text = await response.text();
    if (!response.ok) { console.error(`${response.status} ${text}`); process.exit(1); }
    process.stdout.write(text);
  '
}

json() {
  JSON_INPUT="$1" node -e "const v=JSON.parse(process.env.JSON_INPUT);process.stdout.write(String($2))"
}

sql() {
  docker exec -i "${POSTGRES_CONTAINER}" psql -U "${ADMIN_USER}" -d "${DATABASE_NAME}" -At -v ON_ERROR_STOP=1 -q "$@"
}

wait_for() {
  local label="$1" query="$2" expected="$3" tries="${4:-120}"
  for _ in $(seq 1 "${tries}"); do
    [[ "$(sql -c "${query}")" == "${expected}" ]] && return 0
    sleep 1
  done
  fail "${label}: expected ${expected}, found $(sql -c "${query}")."
}

wait_until_healthy() {
  for _ in $(seq 1 60); do
    [[ "$(docker inspect --format '{{.State.Health.Status}}' "$1")" == "healthy" ]] && return 0
    sleep 2
  done
  fail "$1 did not become healthy."
}

restore_services() {
  for service in workforce-api cmms-api; do
    id="$(container "${service}")"
    [[ "$(docker inspect --format '{{.State.Running}}' "${id}")" == "true" ]] || docker start "${id}" >/dev/null
  done
}
trap restore_services EXIT

POSTGRES_CONTAINER="$(read_value "${BASE_ENV}" CONTROL_POSTGRES_CONTAINER)"
ADMIN_USER="$(read_value "${BASE_ENV}" CONTROL_DB_USER)"
DATABASE_NAME="$(SOURCE_URL="$(read_value "${MODULE_ENV}" MODULE_MIGRATIONS_DATABASE_URL)" node -e 'process.stdout.write(new URL(process.env.SOURCE_URL).pathname.slice(1))')"
RUN_ID="$(date -u +'%Y%m%dT%H%M%SZ')"
TENANT="wi-oi-068-outage-${RUN_ID}"
CMMS_TOKEN="$(sign_context "$(read_value "${MODULE_ENV}" CMMS_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64)" gigalibs-cmms-api asset-maintenance 'cmms:*' "${TENANT}")"
WORKFORCE_TOKEN="$(sign_context "$(read_value "${WORKFORCE_ENV}" WORKFORCE_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64)" gigalibs-workforce-api gigaops 'workforce:*' "${TENANT}")"
WORKFORCE_ID="$(container workforce-api)"
CMMS_ID="$(container cmms-api)"

# A. Workforce is down while CMMS asks for staffing.
WO="$(api cmms-api "${CMMS_TOKEN}" POST http://127.0.0.1:4200/v1/work-orders "{\"requestKey\":\"$(node -e 'process.stdout.write(crypto.randomUUID())')\",\"type\":\"REACTIVE\",\"title\":\"Outage drill ${RUN_ID}\"}")"
WO_ID="$(json "${WO}" v.id)"
docker stop "${WORKFORCE_ID}" >/dev/null
api cmms-api "${CMMS_TOKEN}" POST "http://127.0.0.1:4200/v1/work-orders/${WO_ID}/staffing" '{"startsAt":"2026-12-01T08:00:00Z","endsAt":"2026-12-01T12:00:00Z","headcount":1,"capabilityCodes":[]}' >/dev/null
REQUEST="SELECT status || ':' || (attempt_count >= 2) || ':' || CASE WHEN last_error_code IN ('UNREACHABLE', 'TIMEOUT') THEN 'DOWN' ELSE COALESCE(last_error_code, '-') END FROM gigalibs_cmms.outbox_events WHERE tenant_id = '${TENANT}' AND event_type = 'CMMS_STAFFING_REQUESTED_V1'"
wait_for "staffing request retried while Workforce is down" "${REQUEST};" "PENDING:true:DOWN" 60
ATTEMPTS_DOWN="$(sql -c "SELECT attempt_count FROM gigalibs_cmms.outbox_events WHERE tenant_id = '${TENANT}' AND event_type = 'CMMS_STAFFING_REQUESTED_V1';")"
docker start "${WORKFORCE_ID}" >/dev/null
wait_until_healthy "${WORKFORCE_ID}"
wait_for "staffing request delivered after recovery" "SELECT status FROM gigalibs_cmms.outbox_events WHERE tenant_id = '${TENANT}' AND event_type = 'CMMS_STAFFING_REQUESTED_V1';" PUBLISHED 120
wait_for "one Workforce requirement" "SELECT count(*) FROM gigalibs_workforce.work_requirements WHERE tenant_id = '${TENANT}' AND source_ref = '${WO_ID}';" 1
wait_for "CMMS staffing accepted" "SELECT status FROM gigalibs_cmms.work_order_staffing WHERE tenant_id = '${TENANT}' AND work_order_id = '${WO_ID}';" ACCEPTED 60

# B. CMMS is down while a dispatcher cancels the requirement in Workforce.
REQUIREMENT_ID="$(sql -c "SELECT id FROM gigalibs_workforce.work_requirements WHERE tenant_id = '${TENANT}' AND source_ref = '${WO_ID}';")"
REQUIREMENT="$(api workforce-api "${WORKFORCE_TOKEN}" GET "http://127.0.0.1:4700/v1/work-requirements/${REQUIREMENT_ID}")"
docker stop "${CMMS_ID}" >/dev/null
api workforce-api "${WORKFORCE_TOKEN}" POST "http://127.0.0.1:4700/v1/work-requirements/${REQUIREMENT_ID}/cancel" "{\"expectedVersion\":$(json "${REQUIREMENT}" v.version),\"reason\":\"Outage drill\"}" >/dev/null
CANCEL="SELECT status || ':' || (attempt_count >= 2) || ':' || CASE WHEN last_error_code IN ('UNREACHABLE', 'TIMEOUT') THEN 'DOWN' ELSE COALESCE(last_error_code, '-') END FROM gigalibs_workforce.outbox_events WHERE tenant_id = '${TENANT}' AND event_type = 'WORKFORCE_WORK_REQUIREMENT_CANCELLED_V1'"
wait_for "cancellation retried while CMMS is down" "${CANCEL};" "PENDING:true:DOWN" 60
docker start "${CMMS_ID}" >/dev/null
wait_until_healthy "${CMMS_ID}"
wait_for "cancellation delivered after recovery" "SELECT status FROM gigalibs_workforce.outbox_events WHERE tenant_id = '${TENANT}' AND event_type = 'WORKFORCE_WORK_REQUIREMENT_CANCELLED_V1';" PUBLISHED 120
wait_for "CMMS staffing cancelled" "SELECT status FROM gigalibs_cmms.work_order_staffing WHERE tenant_id = '${TENANT}' AND work_order_id = '${WO_ID}';" CANCELLED 60

RECEIPTS="$(sql -c "SELECT (SELECT count(*) FROM gigalibs_workforce.inbox_receipts WHERE tenant_id = '${TENANT}') || ':' || (SELECT count(*) FROM gigalibs_cmms.inbox_receipts WHERE tenant_id = '${TENANT}');")"
DEAD="$(sql -c "SELECT (SELECT count(*) FROM gigalibs_cmms.outbox_events WHERE tenant_id = '${TENANT}' AND status = 'FAILED') + (SELECT count(*) FROM gigalibs_workforce.outbox_events WHERE tenant_id = '${TENANT}' AND status = 'FAILED');")"
[[ "${DEAD}" == "0" ]] || fail "${DEAD} fact(s) were dead-lettered during the outage."
PENDING="$(sql -c "SELECT (SELECT count(*) FROM gigalibs_cmms.outbox_events WHERE tenant_id = '${TENANT}' AND event_type LIKE 'CMMS_STAFFING_%' AND status <> 'PUBLISHED') + (SELECT count(*) FROM gigalibs_workforce.outbox_events WHERE tenant_id = '${TENANT}' AND payload->>'sourceType' = 'CMMS_WORK_ORDER' AND status <> 'PUBLISHED');")"
[[ "${PENDING}" == "0" ]] || fail "${PENDING} handshake fact(s) were not delivered after recovery."

echo "Relay outage drill passed for run ${RUN_ID}: with Workforce stopped, the staffing request stayed pending and was retried with back-off (${ATTEMPTS_DOWN} attempts while the peer was down, not dead-lettered), then delivered once after recovery (1 requirement, staffing ACCEPTED); with CMMS stopped, the requirement cancellation was retried the same way and delivered once after recovery (staffing CANCELLED); receipts Workforce:CMMS ${RECEIPTS}; no dead letters; every handshake fact delivered; both services running and healthy."
