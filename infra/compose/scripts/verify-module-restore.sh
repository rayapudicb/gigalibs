#!/usr/bin/env bash
set -euo pipefail

# G5 backup/restore drill for the Workforce and CMMS module schemas (WI-OI-068 to WI-OI-071). Dumps both schemas
# from the live local database, restores them into a throwaway database, and proves the restore is complete and
# still protected:
#   - identical row counts in every table, and the same migration ledgers;
#   - forced RLS everywhere;
#   - approved timesheets and pay runs immutable, exports undeletable, earning lines append-only;
#   - the runtime role confined to its tenant;
#   - the current release's migration runners accept the restored schemas unchanged.
# The throwaway database and the dump are removed afterwards.

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

url_with_database() {
  SOURCE_URL="$1" TARGET_DATABASE="$2" node -e 'const u=new URL(process.env.SOURCE_URL);u.pathname=`/${process.env.TARGET_DATABASE}`;process.stdout.write(u.toString())'
}

url_part() {
  SOURCE_URL="$1" PART="$2" node -e 'const u=new URL(process.env.SOURCE_URL);process.stdout.write(decodeURIComponent(process.env.PART==="username"?u.username:u.password))'
}

for file in "${BASE_ENV}" "${MODULE_ENV}" "${WORKFORCE_ENV}"; do
  [[ -f "${file}" ]] || fail "${file} is required."
done

POSTGRES_CONTAINER="$(read_value "${BASE_ENV}" CONTROL_POSTGRES_CONTAINER)"
ADMIN_USER="$(read_value "${BASE_ENV}" CONTROL_DB_USER)"
ADMIN_URL="$(read_value "${MODULE_ENV}" MODULE_MIGRATIONS_DATABASE_URL)"
LIVE_DATABASE="$(SOURCE_URL="${ADMIN_URL}" node -e 'process.stdout.write(new URL(process.env.SOURCE_URL).pathname.slice(1))')"
CMMS_RUNTIME_URL="$(read_value "${MODULE_ENV}" CMMS_DATABASE_URL)"
WORKFORCE_RUNTIME_URL="$(read_value "${WORKFORCE_ENV}" WORKFORCE_DATABASE_URL)"
CMMS_IMAGE="$(docker inspect --format '{{.Config.Image}}' "$(docker ps -q --filter label=com.docker.compose.service=cmms-api | head -1)")"
WORKFORCE_IMAGE="$(docker inspect --format '{{.Config.Image}}' "$(docker ps -q --filter label=com.docker.compose.service=workforce-api | head -1)")"
RUN_ID="$(date -u +'%Y%m%dT%H%M%SZ' | tr 'A-Z' 'a-z')"
RESTORE_DATABASE="gigalibs_restore_${RUN_ID}"
DUMP="/tmp/${RESTORE_DATABASE}.dump"
SCHEMAS=(gigalibs_workforce gigalibs_cmms)

sql() {
  local database="$1"
  shift
  docker exec -i "${POSTGRES_CONTAINER}" psql -U "${ADMIN_USER}" -d "${database}" -At -v ON_ERROR_STOP=1 -q "$@"
}

cleanup() {
  docker exec "${POSTGRES_CONTAINER}" psql -U "${ADMIN_USER}" -d postgres -q -c "DROP DATABASE IF EXISTS ${RESTORE_DATABASE} WITH (FORCE);" >/dev/null 2>&1 || true
  docker exec "${POSTGRES_CONTAINER}" rm -f "${DUMP}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

COUNTS_SQL="SELECT string_agg(format('%s.%s=%s', schemaname, tablename,
    (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', schemaname, tablename), false, true, '')))[1]::text),
  ',' ORDER BY schemaname, tablename)
  FROM pg_tables WHERE schemaname IN ('gigalibs_workforce', 'gigalibs_cmms');"
LEDGER_SQL="SELECT (SELECT max(version) FROM gigalibs_workforce.schema_migrations) || '/' || (SELECT max(version) FROM gigalibs_cmms.schema_migrations);"

# 1. Backup (custom format, with ownership and privileges).
started="$(date +%s)"
docker exec "${POSTGRES_CONTAINER}" pg_dump -U "${ADMIN_USER}" -d "${LIVE_DATABASE}" -Fc -n gigalibs_workforce -n gigalibs_cmms -f "${DUMP}"
LIVE_COUNTS="$(sql "${LIVE_DATABASE}" -c "${COUNTS_SQL}")"
LIVE_LEDGER="$(sql "${LIVE_DATABASE}" -c "${LEDGER_SQL}")"
DUMP_BYTES="$(docker exec "${POSTGRES_CONTAINER}" stat -c %s "${DUMP}")"

# 2. Restore into a throwaway database (extensions are database-wide, so they are created first).
sql postgres -c "CREATE DATABASE ${RESTORE_DATABASE};" >/dev/null
sql "${RESTORE_DATABASE}" -c "CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS btree_gist;" >/dev/null
docker exec "${POSTGRES_CONTAINER}" pg_restore -U "${ADMIN_USER}" -d "${RESTORE_DATABASE}" --exit-on-error "${DUMP}"
restored="$(date +%s)"

# 3. Completeness.
RESTORED_COUNTS="$(sql "${RESTORE_DATABASE}" -c "${COUNTS_SQL}")"
[[ "${RESTORED_COUNTS}" == "${LIVE_COUNTS}" ]] || fail "restored row counts differ from the backup source."
RESTORED_LEDGER="$(sql "${RESTORE_DATABASE}" -c "${LEDGER_SQL}")"
[[ "${RESTORED_LEDGER}" == "${LIVE_LEDGER}" ]] || fail "restored ledgers ${RESTORED_LEDGER} differ from ${LIVE_LEDGER}."
TABLES="$(tr ',' '\n' <<<"${RESTORED_COUNTS}" | wc -l | tr -d ' ')"
ROWS="$(tr ',' '\n' <<<"${RESTORED_COUNTS}" | awk -F= '{ total += $2 } END { print total }')"

# 4. Controls survive the restore.
UNFORCED="$(sql "${RESTORE_DATABASE}" -c "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname IN ('gigalibs_workforce', 'gigalibs_cmms') AND c.relkind = 'r' AND c.relname <> 'schema_migrations' AND NOT (c.relrowsecurity AND c.relforcerowsecurity);")"
[[ "${UNFORCED}" == "0" ]] || fail "${UNFORCED} restored table(s) lack forced RLS."
APPROVED_SHEET="$(sql "${RESTORE_DATABASE}" -c "SELECT id FROM gigalibs_workforce.timesheets WHERE status = 'APPROVED' LIMIT 1;")"
APPROVED_RUN="$(sql "${RESTORE_DATABASE}" -c "SELECT id FROM gigalibs_workforce.pay_runs WHERE status = 'APPROVED' LIMIT 1;")"
EXPORT_ID="$(sql "${RESTORE_DATABASE}" -c "SELECT id FROM gigalibs_workforce.pay_exports LIMIT 1;")"
[[ -n "${APPROVED_SHEET}" && -n "${APPROVED_RUN}" && -n "${EXPORT_ID}" ]] || fail "the backup holds no approved timesheet, pay run or export to test."
if sql "${RESTORE_DATABASE}" -c "UPDATE gigalibs_workforce.timesheets SET worked_minutes = 0 WHERE id = '${APPROVED_SHEET}';" >/dev/null 2>&1; then
  fail "a restored approved timesheet could be changed."
fi
if sql "${RESTORE_DATABASE}" -c "UPDATE gigalibs_workforce.pay_runs SET digest = repeat('0', 64) WHERE id = '${APPROVED_RUN}';" >/dev/null 2>&1; then
  fail "a restored approved pay run could be changed."
fi
if sql "${RESTORE_DATABASE}" -c "DELETE FROM gigalibs_workforce.pay_exports WHERE id = '${EXPORT_ID}';" >/dev/null 2>&1; then
  fail "a restored export could be deleted."
fi

# 5. The current release's runners accept the restored schemas unchanged (and re-assert privileges).
for module in workforce cmms; do
  if [[ "${module}" == workforce ]]; then image="${WORKFORCE_IMAGE}"; runtime="${WORKFORCE_RUNTIME_URL}"; schema=gigalibs_workforce; append="audit_events,booking_events,punches,punch_voids,time_corrections,earning_lines"; version=14
  else image="${CMMS_IMAGE}"; runtime="${CMMS_RUNTIME_URL}"; schema=gigalibs_cmms; append="audit_events,work_order_events,work_order_labour,meter_readings,stock_movements"; version=14; fi
  output="$(docker run --rm --add-host host.docker.internal:host-gateway \
    --env "DATABASE_URL=$(url_with_database "${ADMIN_URL}" "${RESTORE_DATABASE}")" \
    --env "MODULE_RUNTIME_DATABASE_URL=$(url_with_database "${runtime}" "${RESTORE_DATABASE}")" \
    --env MODULE_MIGRATIONS_DIRECTORY=/app/migrations --env "MODULE_SCHEMA=${schema}" \
    --env "MODULE_EXPECTED_MIGRATION_VERSION=${version}" --env "MODULE_APPEND_ONLY_TABLES=${append}" \
    --env MODULE_READ_ONLY_TABLES=auth_revocation_events "${image}" run-module-migrations.mjs 2>&1)" || fail "the ${module} runner rejected the restore: ${output}"
  grep -q "ready at migration ${version}" <<<"${output}" || fail "the ${module} runner did not confirm version ${version}: ${output}"
done
if docker exec -i -e "PGPASSWORD=$(url_part "${WORKFORCE_RUNTIME_URL}" password)" "${POSTGRES_CONTAINER}" \
  psql -h 127.0.0.1 -U "$(url_part "${WORKFORCE_RUNTIME_URL}" username)" -d "${RESTORE_DATABASE}" -v ON_ERROR_STOP=1 -q \
  -c "BEGIN; SELECT set_config('app.tenant_id', (SELECT 'x'), true); UPDATE gigalibs_workforce.earning_lines SET amount_minor = 0; COMMIT;" >/dev/null 2>&1; then
  fail "the restored earning lines accepted an update from the runtime role."
fi
TENANT="$(sql "${RESTORE_DATABASE}" -c "SELECT tenant_id FROM gigalibs_workforce.pay_runs WHERE id = '${APPROVED_RUN}';")"
SCOPED="$(docker exec -i -e "PGPASSWORD=$(url_part "${WORKFORCE_RUNTIME_URL}" password)" "${POSTGRES_CONTAINER}" \
  psql -h 127.0.0.1 -U "$(url_part "${WORKFORCE_RUNTIME_URL}" username)" -d "${RESTORE_DATABASE}" -At -q \
  -c "BEGIN; SET LOCAL app.tenant_id = '${TENANT}'; SELECT count(*) FROM gigalibs_workforce.pay_runs; COMMIT;" | grep -E '^[0-9]+$')"
UNSCOPED="$(docker exec -i -e "PGPASSWORD=$(url_part "${WORKFORCE_RUNTIME_URL}" password)" "${POSTGRES_CONTAINER}" \
  psql -h 127.0.0.1 -U "$(url_part "${WORKFORCE_RUNTIME_URL}" username)" -d "${RESTORE_DATABASE}" -At -q \
  -c "SELECT count(*) FROM gigalibs_workforce.pay_runs;")"
[[ "${SCOPED}" -ge 1 && "${UNSCOPED}" == "0" ]] || fail "restored tenant scoping failed (scoped ${SCOPED}, unscoped ${UNSCOPED})."

echo "Module restore drill passed for run ${RUN_ID}: dumped gigalibs_workforce and gigalibs_cmms (${DUMP_BYTES} bytes) and restored them in $((restored - started)) s; ${TABLES} tables and ${ROWS} rows identical to the source, ledgers ${RESTORED_LEDGER}; forced RLS on every table; approved timesheet and pay run immutable, export undeletable, earning lines append-only for the runtime role; runtime role sees only its tenant (${SCOPED} run(s)) and nothing unscoped; the current Workforce and CMMS runners accepted the restore at version 14."
