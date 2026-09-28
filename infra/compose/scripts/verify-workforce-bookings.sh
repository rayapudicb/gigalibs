#!/usr/bin/env bash
set -euo pipefail

# WI-OI-067 demand and booking certification against the running Workforce API (workforce-bookings.mjs runs
# inside the container). Creates run-scoped records under two tenants (wi-oi-067-cert-*): qualification,
# availability (with audited override), headcount and double-booking guards; lifecycle; idempotency;
# CMMS-sourced demand; 1,000 booking attempts in concurrent waves of 100; restart persistence; tenant B denied;
# database evidence of zero overlaps and zero over-staffing.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
BASE_ENV="${COMPOSE_DIR}/.env"
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

# sign_context TENANT SESSION SUBJECT
sign_context() {
  PRIVATE_KEY_BASE64="${PRIVATE_KEY_BASE64}" TENANT="$1" SESSION="$2" SUBJECT="$3" node -e '
    const { createPrivateKey, randomUUID, sign } = require("node:crypto");
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: "gigalibs-control-plane", aud: "gigalibs-workforce-api", sub: process.env.SUBJECT,
      tenant_id: process.env.TENANT, session_id: process.env.SESSION, auth_version: 1, roles: ["TENANT_ADMIN"],
      granted_scopes: ["workforce:*"], persona_type: "OPERATIONS_SUPERVISOR", org_scope: { mode: "FLAT_TENANT" },
      entitlement: { module_key: "gigaops", status: "ENABLED", version: "wi-oi-067" },
      iat: now, exp: now + 900, jti: randomUUID(),
    };
    const data = `${encode({ alg: "EdDSA", typ: "JWT" })}.${encode(payload)}`;
    const key = createPrivateKey({ key: Buffer.from(process.env.PRIVATE_KEY_BASE64, "base64"), format: "der", type: "pkcs8" });
    process.stdout.write(`${data}.${sign(null, Buffer.from(data), key).toString("base64url")}`);
  '
}

workforce_container() {
  docker ps -q --filter label=com.docker.compose.service=workforce-api --filter status=running | head -1
}

run_phase() {
  docker exec -i \
    -e "PHASE=$1" -e "RUN=${RUN_ID}" -e "IDS=${IDS}" -e "SITE_X=${SITE_X}" -e "SITE_Y=${SITE_Y}" \
    -e "TOKEN_A=${TOKEN_A}" -e "TOKEN_B=${TOKEN_B}" -e "TOKEN_APPROVER=${TOKEN_APPROVER}" \
    "$(workforce_container)" node --input-type=module - <"${SCRIPT_DIR}/workforce-bookings.mjs"
}

sql() {
  docker exec -i "${POSTGRES_CONTAINER}" psql -U "${ADMIN_USER}" -d "${DATABASE_NAME}" -At -v ON_ERROR_STOP=1 -q "$@"
}

wait_until_healthy() {
  for _ in $(seq 1 60); do
    [[ "$(docker inspect --format '{{.State.Health.Status}}' "$1")" == "healthy" ]] && return 0
    sleep 2
  done
  fail "$1 did not become healthy after restart."
}

for file in "${BASE_ENV}" "${WORKFORCE_ENV}"; do
  [[ -f "${file}" ]] || fail "${file} is required."
done

PRIVATE_KEY_BASE64="$(read_value "${WORKFORCE_ENV}" WORKFORCE_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64)"
POSTGRES_CONTAINER="$(read_value "${BASE_ENV}" CONTROL_POSTGRES_CONTAINER)"
ADMIN_USER="$(read_value "${BASE_ENV}" CONTROL_DB_USER)"
DATABASE_NAME="$(SOURCE_URL="$(read_value "${WORKFORCE_ENV}" WORKFORCE_MIGRATIONS_DATABASE_URL)" node -e 'process.stdout.write(new URL(process.env.SOURCE_URL).pathname.slice(1))')"
[[ -n "$(workforce_container)" ]] || fail "the Workforce API container is not running."

RUN_ID="$(date -u +'%Y%m%dT%H%M%SZ')"
TENANT_A="wi-oi-067-cert-a-${RUN_ID}"
TENANT_B="wi-oi-067-cert-b-${RUN_ID}"
SITE_X="$(node -e 'process.stdout.write(require("node:crypto").randomUUID())')"
SITE_Y="$(node -e 'process.stdout.write(require("node:crypto").randomUUID())')"
TOKEN_A="$(sign_context "${TENANT_A}" bookings-a wi-oi-067-dispatcher)"
TOKEN_APPROVER="$(sign_context "${TENANT_A}" bookings-approver wi-oi-067-approver)"
TOKEN_B="$(sign_context "${TENANT_B}" bookings-b wi-oi-067-dispatcher)"

IDS='{}'
IDS="$(run_phase create)" || fail "bookings create phase failed."

CONTAINER_ID="$(workforce_container)"
docker restart "${CONTAINER_ID}" >/dev/null
wait_until_healthy "${CONTAINER_ID}"
[[ "$(run_phase verify)" == "verified" ]] || fail "bookings verify phase failed."

OVERLAPS="$(sql -c "SELECT count(*) FROM gigalibs_workforce.bookings a JOIN gigalibs_workforce.bookings b ON a.tenant_id = b.tenant_id AND a.resource_id = b.resource_id AND a.id < b.id WHERE a.tenant_id = '${TENANT_A}' AND a.status <> 'CANCELLED' AND b.status <> 'CANCELLED' AND tstzrange(a.starts_at, a.ends_at) && tstzrange(b.starts_at, b.ends_at);")"
[[ "${OVERSTAFFED:=$(sql -c "SELECT count(*) FROM gigalibs_workforce.work_requirements r WHERE r.tenant_id = '${TENANT_A}' AND (SELECT count(*) FROM gigalibs_workforce.bookings b WHERE b.tenant_id = r.tenant_id AND b.requirement_id = r.id AND b.status <> 'CANCELLED') > r.headcount;")}" == "0" ]] || fail "${OVERSTAFFED} requirement(s) exceed their headcount."
[[ "${OVERLAPS}" == "0" ]] || fail "${OVERLAPS} overlapping live booking pair(s) found."
CONSTRAINT="$(sql -c "SELECT count(*) FROM pg_constraint WHERE contype = 'x' AND connamespace = 'gigalibs_workforce'::regnamespace AND conname = 'bookings_no_double_booking';")"
[[ "${CONSTRAINT}" == "1" ]] || fail "the double-booking exclusion constraint is missing."
TYPES="'WORKFORCE_WORK_REQUIREMENT', 'WORKFORCE_BOOKING'"
AUDIT_A="$(sql -c "SELECT count(*) FROM gigalibs_workforce.audit_events WHERE tenant_id = '${TENANT_A}' AND entity_type IN (${TYPES});")"
OUTBOX_A="$(sql -c "SELECT count(*) FROM gigalibs_workforce.outbox_events WHERE tenant_id = '${TENANT_A}' AND aggregate_type IN (${TYPES});")"
CREATED_FACTS="$(sql -c "SELECT count(*) FROM gigalibs_workforce.outbox_events WHERE tenant_id = '${TENANT_A}' AND event_type = 'WORKFORCE_RESOURCE_BOOKING_CREATED_V1';")"
LIVE_BOOKINGS="$(sql -c "SELECT count(*) FROM gigalibs_workforce.bookings WHERE tenant_id = '${TENANT_A}';")"
EVIDENCE_B="$(sql -c "SELECT (SELECT count(*) FROM gigalibs_workforce.audit_events WHERE tenant_id = '${TENANT_B}') + (SELECT count(*) FROM gigalibs_workforce.bookings WHERE tenant_id = '${TENANT_B}');")"
[[ "${AUDIT_A}" == "${OUTBOX_A}" ]] || fail "tenant A booking audit ${AUDIT_A} and outbox ${OUTBOX_A} differ."
[[ "${CREATED_FACTS}" == "${LIVE_BOOKINGS}" ]] || fail "${CREATED_FACTS} booking-created facts for ${LIVE_BOOKINGS} bookings."
[[ "${EVIDENCE_B}" == "0" ]] || fail "tenant B wrote ${EVIDENCE_B} rows."
if docker exec -i -e "PGPASSWORD=$(SOURCE_URL="$(read_value "${WORKFORCE_ENV}" WORKFORCE_DATABASE_URL)" node -e 'process.stdout.write(decodeURIComponent(new URL(process.env.SOURCE_URL).password))')" "${POSTGRES_CONTAINER}" \
  psql -h 127.0.0.1 -U "$(SOURCE_URL="$(read_value "${WORKFORCE_ENV}" WORKFORCE_DATABASE_URL)" node -e 'process.stdout.write(decodeURIComponent(new URL(process.env.SOURCE_URL).username))')" -d "${DATABASE_NAME}" -v ON_ERROR_STOP=1 -q \
  -c "BEGIN; SET LOCAL app.tenant_id = '${TENANT_A}'; DELETE FROM gigalibs_workforce.booking_events; COMMIT;" >/dev/null 2>&1; then
  fail "booking history accepted a delete from the runtime role."
fi
LOAD="$(IDS="${IDS}" node -e 'const l=JSON.parse(process.env.IDS).load;process.stdout.write(`${l.attempts} attempts in waves of 100: ${l.created} booked, ${l.refused} refused (${JSON.stringify(l.statuses)}) in ${l.elapsedMs} ms`)')"

echo "WI-OI-067 bookings verification passed for run ${RUN_ID}: ranked candidates; proficiency and missing capability refused (422); request-key replay; unavailable refused, audited override accepted; headcount filled then refused; double booking across requirements refused by the database; window bound; lifecycle to COMPLETED, stale and on-site cancellation refused; cancellation reopens a filled requirement; requirement cancel cascades; one live requirement per CMMS work order; ${LOAD}; zero overlaps and zero over-staffing in the database; restart persistence; tenant B denied 7 reads/writes; ${AUDIT_A} audit = outbox facts, one created fact per booking; booking history append-only."
