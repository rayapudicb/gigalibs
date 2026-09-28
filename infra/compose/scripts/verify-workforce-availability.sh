#!/usr/bin/env bash
set -euo pipefail

# WI-OI-066 availability, absence and calendar certification against the running Workforce API
# (workforce-availability.mjs runs inside the container). Creates run-scoped records under two tenants
# (wi-oi-066-cert-*): working weeks across a daylight-saving change and overnight; overlap refusal by the
# database; four-eyes absence decisions; tenant and site calendars; availability arithmetic; restart
# persistence; tenant B denied; evidence rows.

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
      entitlement: { module_key: "gigaops", status: "ENABLED", version: "wi-oi-066" },
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
    "$(workforce_container)" node --input-type=module - <"${SCRIPT_DIR}/workforce-availability.mjs"
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
TENANT_A="wi-oi-066-cert-a-${RUN_ID}"
TENANT_B="wi-oi-066-cert-b-${RUN_ID}"
SITE_X="$(node -e 'process.stdout.write(require("node:crypto").randomUUID())')"
SITE_Y="$(node -e 'process.stdout.write(require("node:crypto").randomUUID())')"
TOKEN_A="$(sign_context "${TENANT_A}" availability-a wi-oi-066-requester)"
TOKEN_APPROVER="$(sign_context "${TENANT_A}" availability-approver wi-oi-066-approver)"
TOKEN_B="$(sign_context "${TENANT_B}" availability-b wi-oi-066-requester)"

IDS='{}'
IDS="$(run_phase create)" || fail "availability create phase failed."

CONTAINER_ID="$(workforce_container)"
docker restart "${CONTAINER_ID}" >/dev/null
wait_until_healthy "${CONTAINER_ID}"
[[ "$(run_phase verify)" == "verified" ]] || fail "availability verify phase failed."

CONSTRAINTS="$(sql -c "SELECT count(*) FROM pg_constraint WHERE contype = 'x' AND connamespace = 'gigalibs_workforce'::regnamespace AND conname IN ('availability_patterns_no_overlap', 'absences_no_overlap');")"
[[ "${CONSTRAINTS}" == "2" ]] || fail "expected the two availability exclusion constraints, found ${CONSTRAINTS}."
TYPES="'WORKFORCE_AVAILABILITY_PATTERN', 'WORKFORCE_ABSENCE_TYPE', 'WORKFORCE_ABSENCE', 'WORKFORCE_CALENDAR'"
AUDIT_A="$(sql -c "SELECT count(*) FROM gigalibs_workforce.audit_events WHERE tenant_id = '${TENANT_A}' AND entity_type IN (${TYPES});")"
OUTBOX_A="$(sql -c "SELECT count(*) FROM gigalibs_workforce.outbox_events WHERE tenant_id = '${TENANT_A}' AND aggregate_type IN (${TYPES});")"
DECIDERS="$(sql -c "SELECT count(*) FROM gigalibs_workforce.absences a JOIN gigalibs_workforce.absence_types t ON t.tenant_id = a.tenant_id AND t.id = a.absence_type_id WHERE a.tenant_id = '${TENANT_A}' AND t.requires_approval AND a.decided_by IS NOT NULL AND a.decided_by = a.requested_by;")"
EVIDENCE_B="$(sql -c "SELECT (SELECT count(*) FROM gigalibs_workforce.audit_events WHERE tenant_id = '${TENANT_B}') + (SELECT count(*) FROM gigalibs_workforce.absences WHERE tenant_id = '${TENANT_B}');")"
[[ "${AUDIT_A}" == "${OUTBOX_A}" && "${AUDIT_A}" -ge 12 ]] || fail "tenant A availability audit ${AUDIT_A} and outbox ${OUTBOX_A} must match (>= 12)."
[[ "${DECIDERS}" == "0" ]] || fail "${DECIDERS} approval-required absence(s) were decided by their requester."
[[ "${EVIDENCE_B}" == "0" ]] || fail "tenant B wrote ${EVIDENCE_B} rows."
UNFORCED="$(sql -c "SELECT count(*) FROM pg_class WHERE relnamespace = 'gigalibs_workforce'::regnamespace AND relname IN ('availability_patterns', 'absence_types', 'absences', 'working_calendars', 'calendar_closures') AND NOT (relrowsecurity AND relforcerowsecurity);")"
[[ "${UNFORCED}" == "0" ]] || fail "${UNFORCED} availability table(s) lack forced row-level security."

echo "WI-OI-066 availability verification passed for run ${RUN_ID}: Berlin working week across the 25 October DST change (07:00Z then 08:00Z) and a Tokyo overnight slot; overlapping pattern and TEAM refused; request does not block until approved; self-approval refused, reject needs a reason, second decision refused, overlapping absence refused; no-approval type auto-approved; tenant and site calendars (site closure only through the person's position), duplicate refused; 80 h scheduled → 44 h available, then 68 h after withdrawing a closure and cancelling leave; 93-day window bound; restart persistence; tenant B denied 7 reads/writes; ${AUDIT_A} audit = outbox facts; no requester decided their own absence; forced RLS on the five tables."
