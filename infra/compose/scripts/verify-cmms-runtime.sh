#!/usr/bin/env bash
set -euo pipefail

# WI-OI-038 CMMS runtime certification against the exact CMMS image, in throwaway databases:
#   1. clean install of the ordered runtime manifest (1, 2, 10, 11, 12, 13, 14);
#   2. supported upgrade from an installed prototype foundation (version 2) to the canonical core;
#   3. the canonical migration refuses a populated prototype schema and leaves version 2 intact;
#   4. least privilege: forced RLS on every table, two-tenant isolation, unscoped reads see nothing,
#      WITH CHECK refuses cross-tenant writes, append-only evidence, read-only revocations, immutable ledger.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${COMPOSE_DIR}/../.." && pwd)"
BASE_ENV="${COMPOSE_DIR}/.env"
MODULE_ENV="${COMPOSE_DIR}/.env.modules"
MIGRATIONS="${REPO_ROOT}/modules/physical-operations-cmms/db/migrations"
DATABASES=(gigalibs_wi_oi_038_clean gigalibs_wi_oi_038_upgrade gigalibs_wi_oi_038_guard)
APPEND_ONLY="audit_events,work_order_events,work_order_labour,meter_readings,stock_movements"

read_value() {
  local file="$1" key="$2" value
  value="$(awk -v key="${key}" 'index($0, key "=") == 1 { print substr($0, length(key) + 2); exit }' "${file}")"
  if [[ -z "${value}" ]]; then
    echo "Error: ${key} is missing from ${file}." >&2
    exit 1
  fi
  printf '%s' "${value}"
}

with_database() {
  SOURCE_DATABASE_URL="$1" TARGET_DATABASE="$2" node -e '
    const url = new URL(process.env.SOURCE_DATABASE_URL);
    url.pathname = `/${process.env.TARGET_DATABASE}`;
    process.stdout.write(url.toString());
  '
}

url_part() {
  SOURCE_DATABASE_URL="$1" URL_PART="$2" node -e '
    const url = new URL(process.env.SOURCE_DATABASE_URL);
    process.stdout.write(decodeURIComponent(process.env.URL_PART === "username" ? url.username : url.password));
  '
}

admin_sql() {
  local database="$1"
  shift
  docker exec -i "${POSTGRES_CONTAINER}" psql -U "${ADMIN_USER}" -d "${database}" -v ON_ERROR_STOP=1 -q "$@"
}

runtime_sql() {
  docker exec -i -e "PGPASSWORD=${RUNTIME_PASSWORD}" "${POSTGRES_CONTAINER}" \
    psql -h 127.0.0.1 -U "${RUNTIME_USER}" -d "${DATABASES[0]}" -v ON_ERROR_STOP=1 -q -At "$@"
}

migrate() {
  local database="$1"
  docker run --rm \
    --add-host host.docker.internal:host-gateway \
    --env "DATABASE_URL=$(with_database "${ADMIN_URL}" "${database}")" \
    --env "MODULE_RUNTIME_DATABASE_URL=$(with_database "${RUNTIME_URL}" "${database}")" \
    --env MODULE_MIGRATIONS_DIRECTORY=/app/migrations \
    --env MODULE_SCHEMA=gigalibs_cmms \
    --env MODULE_EXPECTED_MIGRATION_VERSION=14 \
    --env "MODULE_APPEND_ONLY_TABLES=${APPEND_ONLY}" \
    --env MODULE_READ_ONLY_TABLES=auth_revocation_events \
    "${CMMS_IMAGE}" run-module-migrations.mjs
}

fail() {
  echo "Error: $*" >&2
  exit 1
}

for file in "${BASE_ENV}" "${MODULE_ENV}"; do
  [[ -f "${file}" ]] || fail "${file} is required."
done

POSTGRES_CONTAINER="$(read_value "${BASE_ENV}" CONTROL_POSTGRES_CONTAINER)"
ADMIN_USER="$(read_value "${BASE_ENV}" CONTROL_DB_USER)"
ADMIN_URL="$(read_value "${MODULE_ENV}" MODULE_MIGRATIONS_DATABASE_URL)"
RUNTIME_URL="$(read_value "${MODULE_ENV}" CMMS_DATABASE_URL)"
CMMS_IMAGE="$(read_value "${MODULE_ENV}" CMMS_IMAGE)"
RUNTIME_USER="$(url_part "${RUNTIME_URL}" username)"
RUNTIME_PASSWORD="$(url_part "${RUNTIME_URL}" password)"

cleanup() {
  for database in "${DATABASES[@]}"; do
    docker exec "${POSTGRES_CONTAINER}" psql -U "${ADMIN_USER}" -d postgres -q \
      -c "DROP DATABASE IF EXISTS ${database} WITH (FORCE);" >/dev/null 2>&1 || true
  done
}
trap cleanup EXIT
cleanup
for database in "${DATABASES[@]}"; do
  docker exec "${POSTGRES_CONTAINER}" psql -U "${ADMIN_USER}" -d postgres -q -c "CREATE DATABASE ${database};" >/dev/null
done

# 1. Clean install of the manifest.
migrate "${DATABASES[0]}" >/dev/null
LEDGER="$(admin_sql "${DATABASES[0]}" -At -c "SELECT string_agg(version::text, ',' ORDER BY version) FROM gigalibs_cmms.schema_migrations;")"
[[ "${LEDGER}" == "1,2,10,11,12,13,14" ]] || fail "clean install ledger is ${LEDGER}; expected 1,2,10,11,12,13,14."
PROTOTYPES="$(admin_sql "${DATABASES[0]}" -At -c "SELECT count(*) FROM pg_tables WHERE schemaname = 'gigalibs_cmms' AND tablename IN ('workforce_resources', 'resource_allocations', 'purchase_orders', 'import_jobs', 'locations', 'module_tenants');")"
[[ "${PROTOTYPES}" == "0" ]] || fail "clean install left ${PROTOTYPES} prototype table(s)."

# 2. Upgrade from an installed prototype foundation (version 2).
admin_sql "${DATABASES[1]}" <"${MIGRATIONS}/000001_cmms_foundation.up.sql" >/dev/null 2>&1
admin_sql "${DATABASES[1]}" <"${MIGRATIONS}/000002_cmms_rls_and_policies.up.sql" >/dev/null 2>&1
migrate "${DATABASES[1]}" >/dev/null
UPGRADED="$(admin_sql "${DATABASES[1]}" -At -c "SELECT max(version) FROM gigalibs_cmms.schema_migrations;")"
[[ "${UPGRADED}" == "14" ]] || fail "upgrade from version 2 reached ${UPGRADED}."

# 3. A populated prototype schema is refused and left at version 2.
admin_sql "${DATABASES[2]}" <"${MIGRATIONS}/000001_cmms_foundation.up.sql" >/dev/null 2>&1
admin_sql "${DATABASES[2]}" <"${MIGRATIONS}/000002_cmms_rls_and_policies.up.sql" >/dev/null 2>&1
admin_sql "${DATABASES[2]}" -c "INSERT INTO gigalibs_cmms.module_tenants (id, oidc_issuer, external_tenant_subject) VALUES (gen_random_uuid(), 'legacy', 'legacy');" >/dev/null
if migrate "${DATABASES[2]}" >/dev/null 2>&1; then
  fail "the canonical migration replaced a populated prototype schema."
fi
GUARDED="$(admin_sql "${DATABASES[2]}" -At -c "SELECT max(version) || ':' || (SELECT count(*) FROM gigalibs_cmms.module_tenants) FROM gigalibs_cmms.schema_migrations;")"
[[ "${GUARDED}" == "2:1" ]] || fail "refused upgrade left ${GUARDED}; expected version 2 with its row."

# 4. Least privilege on the clean install.
ROLE="$(runtime_sql -c "SELECT rolsuper::text || ',' || rolbypassrls::text FROM pg_roles WHERE rolname = current_user;")"
[[ "${ROLE}" == "false,false" ]] || fail "runtime role privileges are ${ROLE}."
UNFORCED="$(admin_sql "${DATABASES[0]}" -At -c "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'gigalibs_cmms' AND c.relkind = 'r' AND c.relname <> 'schema_migrations' AND NOT (c.relrowsecurity AND c.relforcerowsecurity);")"
[[ "${UNFORCED}" == "0" ]] || fail "${UNFORCED} CMMS table(s) lack forced row-level security."
TABLES="$(admin_sql "${DATABASES[0]}" -At -c "SELECT count(*) FROM pg_tables WHERE schemaname = 'gigalibs_cmms' AND tablename <> 'schema_migrations';")"

for tenant in tenant-a tenant-b; do
  runtime_sql -c "BEGIN; SET LOCAL app.tenant_id = '${tenant}';
    INSERT INTO gigalibs_cmms.assets (tenant_id, asset_tag, name, created_by, updated_by, correlation_id)
    VALUES ('${tenant}', 'CERT-1', 'Certification pump', 'certifier', 'certifier', 'wi-oi-038');
    INSERT INTO gigalibs_cmms.audit_events (id, tenant_id, actor_subject, action, entity_type, correlation_id)
    VALUES ('audit-${tenant}', '${tenant}', 'certifier', 'VERIFY', 'RUNTIME', 'wi-oi-038'); COMMIT;" >/dev/null
done
VISIBLE="$(runtime_sql -c "BEGIN; SET LOCAL app.tenant_id = 'tenant-a'; SELECT count(*) FROM gigalibs_cmms.assets; COMMIT;" | grep -E '^[0-9]+$')"
[[ "${VISIBLE}" == "1" ]] || fail "tenant A sees ${VISIBLE} assets; expected 1."
UNSCOPED="$(runtime_sql -c "SELECT count(*) FROM gigalibs_cmms.assets;")"
[[ "${UNSCOPED}" == "0" ]] || fail "an unscoped runtime query exposed ${UNSCOPED} assets."
if runtime_sql -c "BEGIN; SET LOCAL app.tenant_id = 'tenant-a';
    INSERT INTO gigalibs_cmms.assets (tenant_id, asset_tag, name, created_by, updated_by, correlation_id)
    VALUES ('tenant-b', 'CROSS', 'Cross-tenant', 'certifier', 'certifier', 'wi-oi-038'); COMMIT;" >/dev/null 2>&1; then
  fail "a tenant-bound transaction wrote another tenant's row."
fi
for table in ${APPEND_ONLY//,/ }; do
  if runtime_sql -c "BEGIN; SET LOCAL app.tenant_id = 'tenant-a'; DELETE FROM gigalibs_cmms.${table}; COMMIT;" >/dev/null 2>&1; then
    fail "append-only ${table} accepted a delete."
  fi
  if runtime_sql -c "BEGIN; SET LOCAL app.tenant_id = 'tenant-a'; UPDATE gigalibs_cmms.${table} SET tenant_id = tenant_id; COMMIT;" >/dev/null 2>&1; then
    fail "append-only ${table} accepted an update."
  fi
done
if runtime_sql -c "BEGIN; SET LOCAL app.tenant_id = 'tenant-a'; INSERT INTO gigalibs_cmms.auth_revocation_events (id, tenant_id, revocation_type, session_id, reason) VALUES ('x', 'tenant-a', 'SESSION', 's', 'forged'); COMMIT;" >/dev/null 2>&1; then
  fail "the runtime role could forge a revocation."
fi
if runtime_sql -c "INSERT INTO gigalibs_cmms.schema_migrations (version, name) VALUES (99, 'forbidden');" >/dev/null 2>&1; then
  fail "the runtime role could modify the migration ledger."
fi

echo "WI-OI-038 CMMS runtime verification passed: clean install 1,2,10,11,12,13,14 without prototypes; upgrade 2→14; populated prototype refused at version 2; ${TABLES} tables with forced RLS; two-tenant isolation, unscoped reads empty, cross-tenant write refused; ${APPEND_ONLY//,/, } append-only; revocations read-only; ledger immutable; runtime role not superuser or BYPASSRLS."
