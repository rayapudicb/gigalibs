#!/usr/bin/env bash
set -euo pipefail

# WI-OI-069 time and attendance certification against the running Workforce API (workforce-time.mjs runs inside
# the container). Run-scoped tenants wi-oi-069-cert-*: device idempotency (resend and cross-person reuse), fence
# evidence and exceptions (outside, unverified, no location), late, future and stale punches, unlinked users,
# admission control (429 + Retry-After, retried to exactly-once), exceptions blocking submission and approval,
# four-eyes (self resolution, self correction, submitter approval refused), after-submission punches, locked
# weeks, return/correct/resubmit, spatial scope, tenant B, restart persistence; database evidence that punches,
# voids and corrections are append-only and approved timesheets are immutable for the runtime role and the owner.

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

# sign_context TENANT SUBJECT SCOPES_JSON [SPATIAL_SCOPE_JSON]
sign_context() {
  PRIVATE_KEY_BASE64="${PRIVATE_KEY_BASE64}" TENANT="$1" SUBJECT="$2" SCOPES="$3" SPATIAL="${4-}" node -e '
    const { createPrivateKey, randomUUID, sign } = require("node:crypto");
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: "gigalibs-control-plane", aud: "gigalibs-workforce-api", sub: process.env.SUBJECT,
      tenant_id: process.env.TENANT, session_id: `session-${process.env.SUBJECT}`, auth_version: 1, roles: ["MEMBER"],
      granted_scopes: JSON.parse(process.env.SCOPES), persona_type: "OPERATIONS_SUPERVISOR", org_scope: { mode: "FLAT_TENANT" },
      entitlement: { module_key: "gigaops", status: "ENABLED", version: "wi-oi-069" },
      iat: now, exp: now + 900, jti: randomUUID(),
    };
    if (process.env.SPATIAL) payload.spatial_scope = JSON.parse(process.env.SPATIAL);
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
    -e "PHASE=$1" -e "RUN=${RUN_ID}" -e "IDS=${IDS}" -e "TOKENS=${TOKENS}" -e "SITE_X=${SITE_X}" -e "SITE_Y=${SITE_Y}" \
    -e "W1_SUBJECT=${W1}" -e "W2_SUBJECT=${W2}" -e "W3_SUBJECT=${W3}" -e "M2_SUBJECT=${M2}" \
    "$(workforce_container)" node --input-type=module - <"${SCRIPT_DIR}/workforce-time.mjs"
}

sql() {
  docker exec -i "${POSTGRES_CONTAINER}" psql -U "${ADMIN_USER}" -d "${DATABASE_NAME}" -At -v ON_ERROR_STOP=1 -q "$@"
}

runtime_sql() {
  docker exec -i -e "PGPASSWORD=${RUNTIME_PASSWORD}" "${POSTGRES_CONTAINER}" \
    psql -h 127.0.0.1 -U "${RUNTIME_USER}" -d "${DATABASE_NAME}" -v ON_ERROR_STOP=1 -q "$@"
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
[[ -n "$(workforce_container)" ]] || fail "the Workforce API container is not running."

PRIVATE_KEY_BASE64="$(read_value "${WORKFORCE_ENV}" WORKFORCE_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64)"
POSTGRES_CONTAINER="$(read_value "${BASE_ENV}" CONTROL_POSTGRES_CONTAINER)"
ADMIN_USER="$(read_value "${BASE_ENV}" CONTROL_DB_USER)"
RUNTIME_URL="$(read_value "${WORKFORCE_ENV}" WORKFORCE_DATABASE_URL)"
DATABASE_NAME="$(SOURCE_URL="$(read_value "${WORKFORCE_ENV}" WORKFORCE_MIGRATIONS_DATABASE_URL)" node -e 'process.stdout.write(new URL(process.env.SOURCE_URL).pathname.slice(1))')"
RUNTIME_USER="$(SOURCE_URL="${RUNTIME_URL}" node -e 'process.stdout.write(decodeURIComponent(new URL(process.env.SOURCE_URL).username))')"
RUNTIME_PASSWORD="$(SOURCE_URL="${RUNTIME_URL}" node -e 'process.stdout.write(decodeURIComponent(new URL(process.env.SOURCE_URL).password))')"

RUN_ID="$(date -u +'%Y%m%dT%H%M%SZ')"
TENANT_A="wi-oi-069-cert-a-${RUN_ID}"
TENANT_B="wi-oi-069-cert-b-${RUN_ID}"
SITE_X="$(node -e 'process.stdout.write(require("node:crypto").randomUUID())')"
SITE_Y="$(node -e 'process.stdout.write(require("node:crypto").randomUUID())')"
W1="wi-oi-069-w1-${RUN_ID}"
W2="wi-oi-069-w2-${RUN_ID}"
W3="wi-oi-069-w3-${RUN_ID}"
M2="wi-oi-069-m2-${RUN_ID}"
WORKER='["workforce.time.punch"]'
MANAGER='["workforce.time.punch","workforce.time.read","workforce.time.manage","workforce.timesheets.approve"]'
TOKENS="$(
  ADMIN="$(sign_context "${TENANT_A}" "wi-oi-069-admin-${RUN_ID}" '["workforce:*"]')" \
  W1T="$(sign_context "${TENANT_A}" "${W1}" "${WORKER}")" \
  W2T="$(sign_context "${TENANT_A}" "${W2}" "${WORKER}")" \
  W3T="$(sign_context "${TENANT_A}" "${W3}" "${WORKER}")" \
  MGR="$(sign_context "${TENANT_A}" "${M2}" "${MANAGER}")" \
  SCOPED="$(sign_context "${TENANT_A}" "wi-oi-069-scoped-${RUN_ID}" "${MANAGER}" "{\"mode\":\"SCOPED_PLACES\",\"place_ids\":[\"${SITE_Y}\"]}")" \
  ADMIN_B="$(sign_context "${TENANT_B}" "wi-oi-069-admin-b-${RUN_ID}" '["workforce:*"]')" \
  node -e 'const e=process.env;process.stdout.write(JSON.stringify({admin:e.ADMIN,w1:e.W1T,w2:e.W2T,w3:e.W3T,mgr:e.MGR,scoped:e.SCOPED,admin_b:e.ADMIN_B}))'
)"

IDS='{}'
IDS="$(run_phase create)" || fail "time and attendance journey failed."
id_of() { IDS="${IDS}" node -e "process.stdout.write(String(JSON.parse(process.env.IDS).$1))"; }
APPROVED="$(id_of approvedId)"
W3_ID="$(id_of w3)"

CONTAINER_ID="$(workforce_container)"
docker restart "${CONTAINER_ID}" >/dev/null
wait_until_healthy "${CONTAINER_ID}"
[[ "$(run_phase verify)" == "verified" ]] || fail "post-restart phase failed."

# Exactly-once under the burst: 300 distinct device events, 300 punches.
BURST="$(sql -c "SELECT count(*) FROM gigalibs_workforce.punches WHERE tenant_id = '${TENANT_A}' AND resource_id = '${W3_ID}';")"
[[ "${BURST}" == "300" ]] || fail "the 300-punch burst stored ${BURST} punches."

# Append-only evidence and immutable approved timesheets.
for table in punches punch_voids time_corrections; do
  if runtime_sql -c "BEGIN; SET LOCAL app.tenant_id = '${TENANT_A}'; UPDATE gigalibs_workforce.${table} SET tenant_id = tenant_id; COMMIT;" >/dev/null 2>&1; then
    fail "the runtime role updated ${table}."
  fi
  if runtime_sql -c "BEGIN; SET LOCAL app.tenant_id = '${TENANT_A}'; DELETE FROM gigalibs_workforce.${table}; COMMIT;" >/dev/null 2>&1; then
    fail "the runtime role deleted from ${table}."
  fi
done
if runtime_sql -c "BEGIN; SET LOCAL app.tenant_id = '${TENANT_A}'; UPDATE gigalibs_workforce.timesheets SET worked_minutes = 0 WHERE id = '${APPROVED}'; COMMIT;" >/dev/null 2>&1; then
  fail "the runtime role changed an approved timesheet."
fi
if runtime_sql -c "BEGIN; SET LOCAL app.tenant_id = '${TENANT_A}'; DELETE FROM gigalibs_workforce.timesheet_lines WHERE timesheet_id = '${APPROVED}'; COMMIT;" >/dev/null 2>&1; then
  fail "the runtime role deleted lines of an approved timesheet."
fi
if sql -c "UPDATE gigalibs_workforce.timesheets SET status = 'SUBMITTED', decided_by = NULL, decided_at = NULL WHERE id = '${APPROVED}';" >/dev/null 2>&1; then
  fail "the schema owner reopened an approved timesheet."
fi
FOREIGN="$(runtime_sql -At -c "SELECT count(*) FROM gigalibs_workforce.timesheets;" 2>/dev/null)"
[[ "${FOREIGN}" == "0" ]] || fail "an unscoped runtime query saw ${FOREIGN} timesheets."

TYPES="'WORKFORCE_PUNCH', 'WORKFORCE_TIME_EXCEPTION', 'WORKFORCE_TIME_CORRECTION', 'WORKFORCE_TIMESHEET'"
AUDIT="$(sql -c "SELECT count(*) FROM gigalibs_workforce.audit_events WHERE tenant_id = '${TENANT_A}' AND entity_type IN (${TYPES});")"
OUTBOX="$(sql -c "SELECT count(*) FROM gigalibs_workforce.outbox_events WHERE tenant_id = '${TENANT_A}' AND aggregate_type IN (${TYPES});")"
[[ "${AUDIT}" == "${OUTBOX}" ]] || fail "time audit ${AUDIT} and outbox ${OUTBOX} differ."
PUNCH_FACTS="$(sql -c "SELECT (SELECT count(*) FROM gigalibs_workforce.outbox_events WHERE tenant_id = '${TENANT_A}' AND event_type = 'WORKFORCE_PUNCH_RECORDED_V1') = (SELECT count(*) FROM gigalibs_workforce.punches WHERE tenant_id = '${TENANT_A}' AND source = 'DEVICE');")"
[[ "${PUNCH_FACTS}" == "t" ]] || fail "device punches and punch facts differ."
EVIDENCE_B="$(sql -c "SELECT (SELECT count(*) FROM gigalibs_workforce.punches WHERE tenant_id = '${TENANT_B}') + (SELECT count(*) FROM gigalibs_workforce.time_corrections WHERE tenant_id = '${TENANT_B}') + (SELECT count(*) FROM gigalibs_workforce.audit_events WHERE tenant_id = '${TENANT_B}');")"
[[ "${EVIDENCE_B}" == "0" ]] || fail "tenant B wrote ${EVIDENCE_B} rows."
ADMISSION="$(IDS="${IDS}" node -e 'const i=JSON.parse(process.env.IDS);process.stdout.write(`${i.refused} refused with Retry-After in ${i.rounds} round(s)`)')"

echo "WI-OI-069 time and attendance verification passed for run ${RUN_ID}: device resend replayed and cross-person event reuse refused; fence evidence recorded (inside, outside 250 m, unverified for another place, no location) with exceptions; late punches flagged, future and 40-day-old punches refused, unlinked user refused; 300-punch burst admitted exactly once (${ADMISSION}, 50 resends replayed); open exceptions block submission and approval; self resolution, self correction and submitter approval refused; after-submission punch flagged and its week locked for corrections; return, replace-with-reason and resubmission (30 min); spatial scope and tenant B denied; restart persistence; punches, voids and corrections append-only; approved timesheet immutable for the runtime role and the schema owner; ${AUDIT} audit = outbox facts."
