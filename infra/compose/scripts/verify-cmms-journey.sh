#!/usr/bin/env bash
set -euo pipefail

# WI-OI-038 CMMS business-journey certification against the running local CMMS API (cmms-journey.mjs runs
# inside the container). Creates attributable records under two run-scoped tenants (wi-oi-038-cert-*):
# assets at two Geospatial-style sites, a counter meter, a stock ledger, a preventive schedule and work orders
# through execution and signed completion; concurrency, department and place scope; restart persistence;
# tenant B denied every read and write; evidence rows; then a pg_dump/pg_restore round trip of the schema.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
BASE_ENV="${COMPOSE_DIR}/.env"
MODULE_ENV="${COMPOSE_DIR}/.env.modules"
RESTORE_DATABASE="gigalibs_wi_oi_038_restore"

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

# sign_context TENANT SESSION ORG_SCOPE_JSON [SPATIAL_SCOPE_JSON]
sign_context() {
  PRIVATE_KEY_BASE64="${PRIVATE_KEY_BASE64}" TENANT="$1" SESSION="$2" ORG_SCOPE="$3" SPATIAL_SCOPE="${4-}" node -e '
    const { createPrivateKey, randomUUID, sign } = require("node:crypto");
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: "gigalibs-control-plane", aud: "gigalibs-cmms-api", sub: "wi-oi-038-journey-certifier",
      tenant_id: process.env.TENANT, session_id: process.env.SESSION, auth_version: 1, roles: ["TENANT_ADMIN"],
      granted_scopes: ["cmms:*"], persona_type: "OPERATIONS_SUPERVISOR", org_scope: JSON.parse(process.env.ORG_SCOPE),
      entitlement: { module_key: "asset-maintenance", status: "ENABLED", version: "wi-oi-038" },
      iat: now, exp: now + 900, jti: randomUUID(),
    };
    if (process.env.SPATIAL_SCOPE) payload.spatial_scope = JSON.parse(process.env.SPATIAL_SCOPE);
    const data = `${encode({ alg: "EdDSA", typ: "JWT" })}.${encode(payload)}`;
    const key = createPrivateKey({ key: Buffer.from(process.env.PRIVATE_KEY_BASE64, "base64"), format: "der", type: "pkcs8" });
    process.stdout.write(`${data}.${sign(null, Buffer.from(data), key).toString("base64url")}`);
  '
}

cmms_container() {
  docker ps -q --filter label=com.docker.compose.service=cmms-api --filter status=running | head -1
}

run_phase() {
  docker exec -i \
    -e "PHASE=$1" -e "RUN=${RUN_ID}" -e "IDS=${IDS}" -e "SITE_X=${SITE_X}" -e "SITE_Y=${SITE_Y}" \
    -e "TOKEN_A=${TOKEN_A}" -e "TOKEN_B=${TOKEN_B}" -e "TOKEN_DEPT=${TOKEN_DEPT}" -e "TOKEN_PLACE=${TOKEN_PLACE}" -e "TOKEN_EMPTY=${TOKEN_EMPTY}" \
    "$(cmms_container)" node --input-type=module - <"${SCRIPT_DIR}/cmms-journey.mjs"
}

sql() {
  local database="$1"
  shift
  docker exec -i "${POSTGRES_CONTAINER}" psql -U "${ADMIN_USER}" -d "${database}" -At -v ON_ERROR_STOP=1 -q "$@"
}

wait_until_healthy() {
  local container="$1"
  for _ in $(seq 1 60); do
    [[ "$(docker inspect --format '{{.State.Health.Status}}' "${container}")" == "healthy" ]] && return 0
    sleep 2
  done
  fail "${container} did not become healthy after restart."
}

for file in "${BASE_ENV}" "${MODULE_ENV}"; do
  [[ -f "${file}" ]] || fail "${file} is required."
done

PRIVATE_KEY_BASE64="$(read_value "${MODULE_ENV}" CMMS_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64)"
POSTGRES_CONTAINER="$(read_value "${BASE_ENV}" CONTROL_POSTGRES_CONTAINER)"
ADMIN_USER="$(read_value "${BASE_ENV}" CONTROL_DB_USER)"
DATABASE_NAME="$(SOURCE_URL="$(read_value "${MODULE_ENV}" MODULE_MIGRATIONS_DATABASE_URL)" node -e 'process.stdout.write(new URL(process.env.SOURCE_URL).pathname.slice(1))')"
[[ -n "$(cmms_container)" ]] || fail "the CMMS API container is not running."

RUN_ID="$(date -u +'%Y%m%dT%H%M%SZ')"
TENANT_A="wi-oi-038-cert-a-${RUN_ID}"
TENANT_B="wi-oi-038-cert-b-${RUN_ID}"
SITE_X="$(node -e 'process.stdout.write(require("node:crypto").randomUUID())')"
SITE_Y="$(node -e 'process.stdout.write(require("node:crypto").randomUUID())')"
FLAT='{"mode":"FLAT_TENANT"}'
TOKEN_A="$(sign_context "${TENANT_A}" "journey-a" "${FLAT}")"
TOKEN_B="$(sign_context "${TENANT_B}" "journey-b" "${FLAT}")"
TOKEN_DEPT="$(sign_context "${TENANT_A}" "journey-dept" '{"mode":"SCOPED_DEPARTMENTS","department_ids":["dept-cert-1"]}')"
TOKEN_PLACE="$(sign_context "${TENANT_A}" "journey-place" "${FLAT}" "{\"mode\":\"SCOPED_PLACES\",\"place_ids\":[\"${SITE_Y}\"]}")"
TOKEN_EMPTY="$(sign_context "${TENANT_A}" "journey-empty" '{"mode":"SCOPED_DEPARTMENTS","department_ids":[]}')"

IDS='{}'
IDS="$(run_phase create)" || fail "journey create phase failed."

CONTAINER_ID="$(cmms_container)"
docker restart "${CONTAINER_ID}" >/dev/null
wait_until_healthy "${CONTAINER_ID}"
[[ "$(run_phase verify)" == "verified" ]] || fail "journey verify phase failed."

PART_ID="$(IDS="${IDS}" node -e 'process.stdout.write(JSON.parse(process.env.IDS).partId)')"
WORK_ORDER_ID="$(IDS="${IDS}" node -e 'process.stdout.write(JSON.parse(process.env.IDS).workOrderId)')"

# Evidence: ledger equals balance, one reorder request, the work-order timeline, audit and outbox per tenant.
LEDGER="$(sql "${DATABASE_NAME}" -c "SELECT (SELECT COALESCE(SUM(quantity_delta), 0) FROM gigalibs_cmms.stock_movements WHERE tenant_id = '${TENANT_A}' AND part_id = '${PART_ID}') = (SELECT quantity_on_hand FROM gigalibs_cmms.parts WHERE tenant_id = '${TENANT_A}' AND id = '${PART_ID}');")"
[[ "${LEDGER}" == "t" ]] || fail "the stock ledger does not equal the balance."
REORDERS="$(sql "${DATABASE_NAME}" -c "SELECT count(*) FROM gigalibs_cmms.outbox_events WHERE tenant_id = '${TENANT_A}' AND event_type = 'CMMS_PART_REORDER_REQUESTED_V1';")"
[[ "${REORDERS}" == "1" ]] || fail "expected exactly one reorder request, found ${REORDERS}."
TIMELINE="$(sql "${DATABASE_NAME}" -c "SELECT string_agg(DISTINCT event_type, ',' ORDER BY event_type) FROM gigalibs_cmms.work_order_events WHERE tenant_id = '${TENANT_A}' AND work_order_id = '${WORK_ORDER_ID}';")"
[[ "${TIMELINE}" == "CREATED,LABOUR_LOGGED,NOTE_ADDED,PART_ISSUED,STATUS_CHANGED,TASK_RECORDED" ]] || fail "work-order timeline is ${TIMELINE}."
AUDIT_A="$(sql "${DATABASE_NAME}" -c "SELECT count(*) FROM gigalibs_cmms.audit_events WHERE tenant_id = '${TENANT_A}';")"
OUTBOX_A="$(sql "${DATABASE_NAME}" -c "SELECT count(*) FROM gigalibs_cmms.outbox_events WHERE tenant_id = '${TENANT_A}';")"
EVIDENCE_B="$(sql "${DATABASE_NAME}" -c "SELECT (SELECT count(*) FROM gigalibs_cmms.audit_events WHERE tenant_id = '${TENANT_B}') + (SELECT count(*) FROM gigalibs_cmms.outbox_events WHERE tenant_id = '${TENANT_B}') + (SELECT count(*) FROM gigalibs_cmms.assets WHERE tenant_id = '${TENANT_B}');")"
[[ "${AUDIT_A}" == "${OUTBOX_A}" && "${AUDIT_A}" -gt 20 ]] || fail "tenant A audit ${AUDIT_A} and outbox ${OUTBOX_A} must match and exceed 20."
[[ "${EVIDENCE_B}" == "0" ]] || fail "tenant B wrote ${EVIDENCE_B} rows."
UNSIGNED="$(sql "${DATABASE_NAME}" -c "SELECT count(*) FROM gigalibs_cmms.work_orders WHERE tenant_id = '${TENANT_A}' AND status = 'COMPLETED' AND requires_signature AND (signature_data IS NULL OR signed_by IS NULL);")"
[[ "${UNSIGNED}" == "0" ]] || fail "a completed work order lacks its required signature."

# Restore: dump the CMMS schema and restore it into a scratch database; tenant A records must survive intact.
cleanup() {
  docker exec "${POSTGRES_CONTAINER}" psql -U "${ADMIN_USER}" -d postgres -q \
    -c "DROP DATABASE IF EXISTS ${RESTORE_DATABASE} WITH (FORCE);" >/dev/null 2>&1 || true
}
trap cleanup EXIT
cleanup
docker exec "${POSTGRES_CONTAINER}" psql -U "${ADMIN_USER}" -d postgres -q -c "CREATE DATABASE ${RESTORE_DATABASE};" >/dev/null
docker exec "${POSTGRES_CONTAINER}" sh -c "pg_dump -U '${ADMIN_USER}' -d '${DATABASE_NAME}' -n gigalibs_cmms -Fc | pg_restore -U '${ADMIN_USER}' -d '${RESTORE_DATABASE}' --no-owner --exit-on-error"
FINGERPRINT="SELECT (SELECT count(*) FROM gigalibs_cmms.assets WHERE tenant_id = '${TENANT_A}') || '/' || (SELECT count(*) FROM gigalibs_cmms.work_orders WHERE tenant_id = '${TENANT_A}') || '/' || (SELECT count(*) FROM gigalibs_cmms.stock_movements WHERE tenant_id = '${TENANT_A}') || '/' || (SELECT count(*) FROM gigalibs_cmms.work_order_events WHERE tenant_id = '${TENANT_A}') || '/' || (SELECT quantity_on_hand FROM gigalibs_cmms.parts WHERE tenant_id = '${TENANT_A}' AND id = '${PART_ID}') || '/' || (SELECT max(version) FROM gigalibs_cmms.schema_migrations);"
LIVE="$(sql "${DATABASE_NAME}" -c "${FINGERPRINT}")"
RESTORED="$(sql "${RESTORE_DATABASE}" -c "${FINGERPRINT}")"
[[ "${LIVE}" == "${RESTORED}" ]] || fail "restored schema ${RESTORED} differs from live ${LIVE}."
FORCED="$(sql "${RESTORE_DATABASE}" -c "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'gigalibs_cmms' AND c.relkind = 'r' AND c.relforcerowsecurity;")"
[[ "${FORCED}" -ge 14 ]] || fail "restored schema lost forced row-level security (${FORCED} tables)."

echo "WI-OI-038 CMMS journey passed for run ${RUN_ID}: assets at two sites with hierarchy and duplicate/cycle refusal; counter meter with out-of-order, regression and replay handling; opening receipt, idempotent issue, 5 concurrent issues against 3 on hand (3 won, 2 refused), return, reasoned adjustment, ledger = balance, one reorder request; monthly schedule generated once (stale retry refused, advanced in Asia/Tokyo); request-key replay; lifecycle with required tasks and signature, cost USD 150; department, place and empty scope; restart persistence; tenant B denied 11 reads/writes; ${AUDIT_A} audit = outbox facts; pg_dump/pg_restore round trip identical (${LIVE}) with forced RLS."
