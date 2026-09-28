#!/usr/bin/env bash
set -euo pipefail

# Production hardening: outbox and inbox retention for Workforce and CMMS. Seeds a run-scoped tenant with aged and
# recent rows (as the schema owner), then runs each module's `outbox_sweep` as that module's runtime role, exactly as
# the services do, and proves what is removed and what is kept:
#   removed — delivered facts and unrouted pending facts older than the window, receipts older than their window;
#   kept    — recent rows, routed facts still pending (a consumer needs them), dead letters, all audit evidence.
# Also proves PUBLIC and the other module's runtime role cannot execute the sweep.

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

url_part() {
  SOURCE_URL="$1" PART="$2" node -e 'const u=new URL(process.env.SOURCE_URL);process.stdout.write(decodeURIComponent(process.env.PART==="username"?u.username:u.password))'
}

POSTGRES_CONTAINER="$(read_value "${BASE_ENV}" CONTROL_POSTGRES_CONTAINER)"
ADMIN_USER="$(read_value "${BASE_ENV}" CONTROL_DB_USER)"
DATABASE_NAME="$(SOURCE_URL="$(read_value "${MODULE_ENV}" MODULE_MIGRATIONS_DATABASE_URL)" node -e 'process.stdout.write(new URL(process.env.SOURCE_URL).pathname.slice(1))')"
WORKFORCE_RUNTIME_URL="$(read_value "${WORKFORCE_ENV}" WORKFORCE_DATABASE_URL)"
CMMS_RUNTIME_URL="$(read_value "${MODULE_ENV}" CMMS_DATABASE_URL)"
RUN_ID="$(date -u +'%Y%m%dT%H%M%SZ')"
TENANT="retention-cert-${RUN_ID}"

sql() {
  docker exec -i "${POSTGRES_CONTAINER}" psql -U "${ADMIN_USER}" -d "${DATABASE_NAME}" -At -v ON_ERROR_STOP=1 -q "$@"
}

as_runtime() {
  local url="$1"
  shift
  docker exec -i -e "PGPASSWORD=$(url_part "${url}" password)" "${POSTGRES_CONTAINER}" \
    psql -h 127.0.0.1 -U "$(url_part "${url}" username)" -d "${DATABASE_NAME}" -At -v ON_ERROR_STOP=1 -q "$@"
}

cleanup() {
  sql -c "DELETE FROM gigalibs_workforce.outbox_events WHERE tenant_id = '${TENANT}';
          DELETE FROM gigalibs_workforce.inbox_receipts WHERE tenant_id = '${TENANT}';
          DELETE FROM gigalibs_cmms.outbox_events WHERE tenant_id = '${TENANT}';
          DELETE FROM gigalibs_cmms.inbox_receipts WHERE tenant_id = '${TENANT}';" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# Seed: tag encodes what must happen to each row (drop/keep). The routed pending fact is waiting for a retry
# (next attempt tomorrow), so the live relays leave it alone while the sweep runs.
seed_outbox() {
  local schema="$1" routed_type="$2" routed_payload="$3" unrouted_type="$4"
  sql -c "INSERT INTO ${schema}.outbox_events
            (id, tenant_id, topic, event_type, aggregate_type, aggregate_id, aggregate_version, correlation_id, schema_version, payload, status, created_at, available_at)
          VALUES
            ('drop-published-${RUN_ID}', '${TENANT}', 'cert', '${unrouted_type}', 'CERT', 'a1', 1, 'retention-cert', 1, '{}', 'PUBLISHED', now() - interval '40 days', now()),
            ('drop-unrouted-${RUN_ID}', '${TENANT}', 'cert', '${unrouted_type}', 'CERT', 'a2', 1, 'retention-cert', 1, '{}', 'PENDING', now() - interval '40 days', now()),
            ('keep-routed-${RUN_ID}', '${TENANT}', 'cert', '${routed_type}', 'CERT', 'a3', 1, 'retention-cert', 1, '${routed_payload}', 'PENDING', now() - interval '40 days', now() + interval '1 day'),
            ('keep-deadletter-${RUN_ID}', '${TENANT}', 'cert', '${unrouted_type}', 'CERT', 'a4', 1, 'retention-cert', 1, '{}', 'FAILED', now() - interval '40 days', now()),
            ('keep-recent-${RUN_ID}', '${TENANT}', 'cert', '${unrouted_type}', 'CERT', 'a5', 1, 'retention-cert', 1, '{}', 'PUBLISHED', now() - interval '5 days', now());
          INSERT INTO ${schema}.inbox_receipts
            (id, tenant_id, consumer_name, message_id, event_type, source_module, source_version, correlation_id, payload_sha256, status, attempt_count, received_at)
          VALUES
            ('drop-receipt-${RUN_ID}', '${TENANT}', 'cert', 'm1', 'CERT', 'cert', 1, 'retention-cert', repeat('a', 64), 'PROCESSED', 1, now() - interval '100 days'),
            ('keep-receipt-${RUN_ID}', '${TENANT}', 'cert', 'm2', 'CERT', 'cert', 1, 'retention-cert', repeat('b', 64), 'PROCESSED', 1, now() - interval '60 days');" >/dev/null
}

seed_outbox gigalibs_workforce WORKFORCE_WORK_REQUIREMENT_REQUESTED_V1 '{"sourceType":"CMMS_WORK_ORDER","sourceRef":"x"}' WORKFORCE_PUNCH_RECORDED_V1
seed_outbox gigalibs_cmms CMMS_STAFFING_REQUESTED_V1 '{"workOrderId":"x"}' CMMS_WORK_ORDER_CREATED_V1
AUDIT_BEFORE="$(sql -c "SELECT (SELECT count(*) FROM gigalibs_workforce.audit_events) + (SELECT count(*) FROM gigalibs_cmms.audit_events);")"

# Sweep as each module's runtime role, as the services do (30-day facts, 90-day receipts).
as_runtime "${WORKFORCE_RUNTIME_URL}" -c "SELECT * FROM gigalibs_workforce.outbox_sweep(30, 90, 10000);" >/dev/null
as_runtime "${CMMS_RUNTIME_URL}" -c "SELECT * FROM gigalibs_cmms.outbox_sweep(30, 90, 10000);" >/dev/null

for schema in gigalibs_workforce gigalibs_cmms; do
  LEFT="$(sql -c "SELECT string_agg(id, ',' ORDER BY id) FROM (SELECT id FROM ${schema}.outbox_events WHERE tenant_id = '${TENANT}' UNION ALL SELECT id FROM ${schema}.inbox_receipts WHERE tenant_id = '${TENANT}') x;")"
  EXPECTED="keep-deadletter-${RUN_ID},keep-receipt-${RUN_ID},keep-recent-${RUN_ID},keep-routed-${RUN_ID}"
  [[ "${LEFT}" == "${EXPECTED}" ]] || fail "${schema} kept ${LEFT}; expected ${EXPECTED}."
done
AUDIT_AFTER="$(sql -c "SELECT (SELECT count(*) FROM gigalibs_workforce.audit_events) + (SELECT count(*) FROM gigalibs_cmms.audit_events);")"
[[ "${AUDIT_AFTER}" -ge "${AUDIT_BEFORE}" ]] || fail "the sweep removed audit evidence."

# Only each module's own runtime role may execute its sweep.
ROLES="$(sql -c "SELECT string_agg(DISTINCT r.rolname || '>' || n.nspname, ',' ORDER BY r.rolname || '>' || n.nspname) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace CROSS JOIN pg_roles r WHERE p.proname = 'outbox_sweep' AND n.nspname IN ('gigalibs_workforce', 'gigalibs_cmms') AND NOT r.rolsuper AND r.rolname NOT LIKE 'pg\\_%' AND has_function_privilege(r.oid, p.oid, 'EXECUTE');")"
[[ "${ROLES}" == "gigalibs_cmms_runtime>gigalibs_cmms,gigalibs_workforce_runtime>gigalibs_workforce" ]] || fail "unexpected sweep executors: ${ROLES}."

echo "Outbox retention verification passed for run ${RUN_ID}: in both Workforce and CMMS the sweep, run as the module's runtime role, removed the 40-day-old delivered fact, the 40-day-old unrouted pending fact and the 100-day-old receipt, and kept the routed pending fact, the dead letter, the recent fact and the 60-day-old receipt; audit evidence untouched; only each module's own runtime role can execute its sweep."
