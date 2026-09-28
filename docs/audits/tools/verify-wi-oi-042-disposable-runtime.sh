#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "${SCRIPT_DIR}" rev-parse --show-toplevel)"
COMPOSE_DIR="${REPO_ROOT}/infra/compose"
LOCAL_ENV="${COMPOSE_DIR}/.env"
COMPOSE_FILE="${COMPOSE_DIR}/compose.yaml"
CERTIFICATION_OVERRIDE="${SCRIPT_DIR}/wi-oi-042-compose.certification.yaml"

if [[ "${NODE_ENV:-}" == "production" ]]; then
  echo "Error: NODE_ENV=production is not permitted." >&2
  exit 1
fi
if [[ ! -f "${LOCAL_ENV}" ]]; then
  echo "Error: ${LOCAL_ENV} is required." >&2
  exit 1
fi
if [[ -z "${EVIDENCE_DIRECTORY:-}" ]]; then
  echo "Error: EVIDENCE_DIRECTORY is required." >&2
  exit 1
fi
case "${EVIDENCE_DIRECTORY}" in
  "${REPO_ROOT}"/infra/compose/evidence/wi-oi-042-*) ;;
  *) echo "Error: EVIDENCE_DIRECTORY must be a WI-OI-042 repository evidence path." >&2; exit 1 ;;
esac
if [[ -e "${EVIDENCE_DIRECTORY}" ]]; then
  echo "Error: evidence directory already exists: ${EVIDENCE_DIRECTORY}" >&2
  exit 1
fi

read_local_value() {
  local key="$1"
  local value
  value="$(awk -v key="${key}" 'index($0, key "=") == 1 { print substr($0, length(key) + 2); exit }' "${LOCAL_ENV}" | sed "s/^['\"]//;s/['\"]$//")"
  if [[ -z "${value}" ]]; then
    echo "Error: ${key} is missing from ${LOCAL_ENV}." >&2
    exit 1
  fi
  printf '%s' "${value}"
}

CONTROL_POSTGRES_CONTAINER="$(read_local_value CONTROL_POSTGRES_CONTAINER)"
CONTROL_DB_USER="$(read_local_value CONTROL_DB_USER)"
LIVE_DB_NAME="$(read_local_value CONTROL_DB_NAME)"
BASE_DATABASE_URL="$(read_local_value DATABASE_URL)"
PROFILE_KEY="$(read_local_value PROFILE_KEY)"
SOURCE_REVISION="$(read_local_value SOURCE_REVISION)"
SOURCE_STATE_SHA256="$(read_local_value SOURCE_STATE_SHA256)"
MIGRATIONS_IMAGE="$(read_local_value MIGRATIONS_IMAGE)"
API_IMAGE="$(read_local_value API_IMAGE)"
WEB_IMAGE="$(read_local_value WEB_IMAGE)"

for identifier in "${CONTROL_POSTGRES_CONTAINER}" "${CONTROL_DB_USER}" "${LIVE_DB_NAME}"; do
  if [[ ! "${identifier}" =~ ^[a-zA-Z0-9_.-]+$ ]]; then
    echo "Error: unsafe configured PostgreSQL identifier." >&2
    exit 1
  fi
done
if [[ "${PROFILE_KEY}" != "configuration-local-development-v1" ]]; then
  echo "Error: verifier is restricted to configuration-local-development-v1." >&2
  exit 1
fi
if [[ "$(docker inspect --format '{{.State.Running}}' "${CONTROL_POSTGRES_CONTAINER}" 2>/dev/null || true)" != "true" ]]; then
  echo "Error: PostgreSQL container ${CONTROL_POSTGRES_CONTAINER} is not running." >&2
  exit 1
fi

SUFFIX="$(date -u +%Y%m%d%H%M%S)_$(openssl rand -hex 4)"
RUNTIME_DB="gigalibs_wi_oi_042_runtime_${SUFFIX}"
RESTORE_DB="gigalibs_wi_oi_042_restore_${SUFFIX}"
PROJECT_NAME="wi-oi-042-${SUFFIX//_/-}"
CERTIFICATION_NETWORK="${PROJECT_NAME}-network"
API_PUBLIC_PORT=55333
WEB_PUBLIC_PORT=55180
for database_name in "${RUNTIME_DB}" "${RESTORE_DB}"; do
  if [[ ! "${database_name}" =~ ^gigalibs_wi_oi_042_(runtime|restore)_[0-9]{14}_[a-f0-9]{8}$ ]]; then
    echo "Error: unsafe disposable database name." >&2
    exit 1
  fi
  if [[ "${database_name}" == "${LIVE_DB_NAME}" ]]; then
    echo "Error: disposable database resolved to the live database name." >&2
    exit 1
  fi
done
if lsof -nP -iTCP:"${API_PUBLIC_PORT}" -sTCP:LISTEN >/dev/null 2>&1 || \
   lsof -nP -iTCP:"${WEB_PUBLIC_PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Error: certification ports ${API_PUBLIC_PORT}/${WEB_PUBLIC_PORT} are already in use." >&2
  exit 1
fi

HOST_RUNTIME_URL="$(BASE_DATABASE_URL="${BASE_DATABASE_URL}" DATABASE_NAME="${RUNTIME_DB}" node -e '
  const value = new URL(process.env.BASE_DATABASE_URL);
  if (!["127.0.0.1", "localhost", "host.docker.internal"].includes(value.hostname)) process.exit(2);
  if (value.hostname === "host.docker.internal") value.hostname = "127.0.0.1";
  value.pathname = `/${process.env.DATABASE_NAME}`;
  process.stdout.write(value.toString());
')"
CONTAINER_RUNTIME_URL="$(BASE_DATABASE_URL="${BASE_DATABASE_URL}" DATABASE_NAME="${RUNTIME_DB}" node -e '
  const value = new URL(process.env.BASE_DATABASE_URL);
  if (!["127.0.0.1", "localhost", "host.docker.internal"].includes(value.hostname)) process.exit(2);
  value.hostname = "host.docker.internal";
  value.pathname = `/${process.env.DATABASE_NAME}`;
  process.stdout.write(value.toString());
')"
HOST_RESTORE_URL="$(BASE_DATABASE_URL="${BASE_DATABASE_URL}" DATABASE_NAME="${RESTORE_DB}" node -e '
  const value = new URL(process.env.BASE_DATABASE_URL);
  if (!["127.0.0.1", "localhost", "host.docker.internal"].includes(value.hostname)) process.exit(2);
  if (value.hostname === "host.docker.internal") value.hostname = "127.0.0.1";
  value.pathname = `/${process.env.DATABASE_NAME}`;
  process.stdout.write(value.toString());
')"

TEMP_ENV="$(mktemp "${TMPDIR:-/tmp}/gigalibs-wi-oi-042-env.XXXXXX")"
TEMP_DUMP="$(mktemp "${TMPDIR:-/tmp}/gigalibs-wi-oi-042-backup.XXXXXX")"
RUNTIME_EVIDENCE="${EVIDENCE_DIRECTORY}/runtime.json"
RESTORE_EVIDENCE="${EVIDENCE_DIRECTORY}/restore.json"
CLOSURE_EVIDENCE="${EVIDENCE_DIRECTORY}/disposable-runtime-closure.json"
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
STATUS="FAIL"
FAILURE=""
COMPOSE_STARTED=false
RUNTIME_DB_CREATED=false
RESTORE_DB_CREATED=false

write_closure() {
  STATUS_VALUE="${STATUS}" \
  FAILURE_VALUE="${FAILURE}" \
  STARTED_VALUE="${STARTED_AT}" \
  FINISHED_VALUE="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  RUNTIME_DB_VALUE="${RUNTIME_DB}" \
  RESTORE_DB_VALUE="${RESTORE_DB}" \
  SOURCE_REVISION_VALUE="${SOURCE_REVISION}" \
  SOURCE_STATE_VALUE="${SOURCE_STATE_SHA256}" \
  MIGRATIONS_IMAGE_VALUE="${MIGRATIONS_IMAGE}" \
  API_IMAGE_VALUE="${API_IMAGE}" \
  WEB_IMAGE_VALUE="${WEB_IMAGE}" \
  RUNTIME_EVIDENCE_VALUE="${RUNTIME_EVIDENCE}" \
  RESTORE_EVIDENCE_VALUE="${RESTORE_EVIDENCE}" \
  CLOSURE_EVIDENCE_VALUE="${CLOSURE_EVIDENCE}" \
  node -e '
    const fs = require("node:fs");
    const evidence = {
      verifier: "verify-wi-oi-042-disposable-runtime",
      startedAt: process.env.STARTED_VALUE,
      finishedAt: process.env.FINISHED_VALUE,
      status: process.env.STATUS_VALUE,
      profile: "configuration-local-development-v1",
      sourceRevision: process.env.SOURCE_REVISION_VALUE,
      sourceStateSha256: process.env.SOURCE_STATE_VALUE,
      images: {
        migrations: process.env.MIGRATIONS_IMAGE_VALUE,
        api: process.env.API_IMAGE_VALUE,
        web: process.env.WEB_IMAGE_VALUE,
      },
      isolation: {
        runtimeDatabase: process.env.RUNTIME_DB_VALUE,
        restoreDatabase: process.env.RESTORE_DB_VALUE,
        liveApplicationDatabaseModified: false,
        disposableDatabasesRetained: 0,
        composeProjectRetained: false,
      },
      evidence: {
        runtime: process.env.RUNTIME_EVIDENCE_VALUE,
        restore: process.env.RESTORE_EVIDENCE_VALUE,
      },
      failure: process.env.FAILURE_VALUE || null,
      productionReleaseClaim: "NONE",
    };
    fs.writeFileSync(process.env.CLOSURE_EVIDENCE_VALUE, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  '
}

cleanup() {
  local exit_code=$?
  set +e
  if [[ "${COMPOSE_STARTED}" == "true" ]]; then
    docker compose --env-file "${TEMP_ENV}" -f "${COMPOSE_FILE}" -f "${CERTIFICATION_OVERRIDE}" \
      -p "${PROJECT_NAME}" down --remove-orphans --volumes >/dev/null 2>&1
  fi
  if [[ "${RESTORE_DB_CREATED}" == "true" ]]; then
    docker exec "${CONTROL_POSTGRES_CONTAINER}" psql -U "${CONTROL_DB_USER}" -d postgres \
      -c "DROP DATABASE IF EXISTS \"${RESTORE_DB}\" WITH (FORCE);" >/dev/null 2>&1
  fi
  if [[ "${RUNTIME_DB_CREATED}" == "true" ]]; then
    docker exec "${CONTROL_POSTGRES_CONTAINER}" psql -U "${CONTROL_DB_USER}" -d postgres \
      -c "DROP DATABASE IF EXISTS \"${RUNTIME_DB}\" WITH (FORCE);" >/dev/null 2>&1
  fi
  rm -f "${TEMP_ENV}" "${TEMP_DUMP}"
  if [[ "${STATUS}" != "PASS" && -z "${FAILURE}" ]]; then
    FAILURE="verifier-exited-${exit_code}"
  fi
  write_closure
  exit "${exit_code}"
}
trap cleanup EXIT

mkdir -p "${EVIDENCE_DIRECTORY}"
chmod 700 "${EVIDENCE_DIRECTORY}"
chmod 600 "${TEMP_ENV}" "${TEMP_DUMP}"

awk \
  -v database_url="${CONTAINER_RUNTIME_URL}" \
  -v api_port="${API_PUBLIC_PORT}" \
  -v web_port="${WEB_PUBLIC_PORT}" \
  -v public_origin="http://localhost:${WEB_PUBLIC_PORT}" \
  -v network="${CERTIFICATION_NETWORK}" '
    /^DATABASE_URL=/ { print "DATABASE_URL=" database_url; next }
    /^API_PUBLIC_PORT=/ { print "API_PUBLIC_PORT=" api_port; next }
    /^WEB_PUBLIC_PORT=/ { print "WEB_PUBLIC_PORT=" web_port; next }
    /^PUBLIC_ORIGIN=/ { print "PUBLIC_ORIGIN=" public_origin; next }
    /^CERTIFICATION_NETWORK=/ { next }
    { print }
    END { print "CERTIFICATION_NETWORK=" network }
  ' "${LOCAL_ENV}" >"${TEMP_ENV}"
chmod 600 "${TEMP_ENV}"

docker exec "${CONTROL_POSTGRES_CONTAINER}" psql -U "${CONTROL_DB_USER}" -d postgres \
  -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"${RUNTIME_DB}\";" >/dev/null
RUNTIME_DB_CREATED=true

COMPOSE_STARTED=true
docker compose --env-file "${TEMP_ENV}" -f "${COMPOSE_FILE}" -f "${CERTIFICATION_OVERRIDE}" \
  -p "${PROJECT_NAME}" up -d --remove-orphans

for _ in $(seq 1 24); do
  api_code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 3 "http://127.0.0.1:${API_PUBLIC_PORT}/api/v1/ready" 2>/dev/null || true)"
  web_code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 3 "http://127.0.0.1:${WEB_PUBLIC_PORT}/api/health/ready" 2>/dev/null || true)"
  if [[ "${api_code}" == "200" && "${web_code}" == "200" ]]; then
    break
  fi
  sleep 5
done
if [[ "${api_code:-}" != "200" || "${web_code:-}" != "200" ]]; then
  FAILURE="disposable-stack-not-ready:api=${api_code:-none},web=${web_code:-none}"
  exit 1
fi

API_URL="http://127.0.0.1:${API_PUBLIC_PORT}" \
DATABASE_URL="${HOST_RUNTIME_URL}" \
EVIDENCE_PATH="${RUNTIME_EVIDENCE}" \
PROFILE_KEY="${PROFILE_KEY}" \
RELEASE_ID="wi-oi-042-${SUFFIX}" \
MIGRATIONS_IMAGE="${MIGRATIONS_IMAGE}" \
API_IMAGE="${API_IMAGE}" \
WEB_IMAGE="${WEB_IMAGE}" \
node "${COMPOSE_DIR}/scripts/verify-local-f2-runtime.mjs"

if [[ "$(node -e 'const j=require(process.argv[1]);process.stdout.write(j.status)' "${RUNTIME_EVIDENCE}")" != "PASS" ]]; then
  FAILURE="runtime-evidence-failed"
  exit 1
fi

docker exec "${CONTROL_POSTGRES_CONTAINER}" pg_dump -U "${CONTROL_DB_USER}" -d "${RUNTIME_DB}" -Fc -Z 6 >"${TEMP_DUMP}"
if [[ ! -s "${TEMP_DUMP}" ]]; then
  FAILURE="disposable-backup-empty"
  exit 1
fi
BACKUP_SHA256="$(shasum -a 256 "${TEMP_DUMP}" | awk '{print $1}')"

docker exec "${CONTROL_POSTGRES_CONTAINER}" psql -U "${CONTROL_DB_USER}" -d postgres \
  -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"${RESTORE_DB}\";" >/dev/null
RESTORE_DB_CREATED=true
docker exec -i "${CONTROL_POSTGRES_CONTAINER}" pg_restore -U "${CONTROL_DB_USER}" -d "${RESTORE_DB}" \
  --clean --if-exists --exit-on-error --single-transaction <"${TEMP_DUMP}"

MIGRATION_COUNT="$(docker exec "${CONTROL_POSTGRES_CONTAINER}" psql -U "${CONTROL_DB_USER}" -d "${RESTORE_DB}" -At \
  -c 'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL')"
if [[ "${MIGRATION_COUNT}" != "37" ]]; then
  FAILURE="restored-migration-count-${MIGRATION_COUNT}"
  exit 1
fi

SEMANTIC_SQL="SELECT concat_ws('|', (SELECT count(*) FROM users), (SELECT count(*) FROM tenants), (SELECT count(*) FROM configuration_change_sets), (SELECT count(*) FROM configuration_published_versions), (SELECT count(*) FROM configuration_activations), (SELECT md5(COALESCE(string_agg(checksum, ',' ORDER BY checksum), '')) FROM configuration_published_versions));"
RUNTIME_SEMANTIC="$(docker exec "${CONTROL_POSTGRES_CONTAINER}" psql -U "${CONTROL_DB_USER}" -d "${RUNTIME_DB}" -At -c "${SEMANTIC_SQL}")"
RESTORE_SEMANTIC="$(docker exec "${CONTROL_POSTGRES_CONTAINER}" psql -U "${CONTROL_DB_USER}" -d "${RESTORE_DB}" -At -c "${SEMANTIC_SQL}")"
if [[ -z "${RUNTIME_SEMANTIC}" || "${RUNTIME_SEMANTIC}" != "${RESTORE_SEMANTIC}" ]]; then
  FAILURE="restore-semantic-checksum-mismatch"
  exit 1
fi

SCHEMA_DIFF="$(node "${REPO_ROOT}/packages/db/node_modules/prisma/build/index.js" migrate diff \
  --from-url "${HOST_RESTORE_URL}" \
  --to-schema-datamodel "${REPO_ROOT}/packages/db/schema.prisma" \
  --script)"
if [[ -n "${SCHEMA_DIFF}" && "${SCHEMA_DIFF}" != "-- This is an empty migration." ]]; then
  FAILURE="restored-schema-drift"
  exit 1
fi

BACKUP_SHA256_VALUE="${BACKUP_SHA256}" \
SEMANTIC_VALUE="${RESTORE_SEMANTIC}" \
RESTORE_EVIDENCE_VALUE="${RESTORE_EVIDENCE}" \
node -e '
  const fs = require("node:fs");
  const evidence = {
    verifier: "verify-wi-oi-042-disposable-restore",
    status: "PASS",
    backupSha256: process.env.BACKUP_SHA256_VALUE,
    migrationCount: 37,
    semanticChecksum: process.env.SEMANTIC_VALUE,
    physicalSchemaMatchesCanonicalPrisma: true,
    liveApplicationDatabaseModified: false,
    productionReleaseClaim: "NONE",
  };
  fs.writeFileSync(process.env.RESTORE_EVIDENCE_VALUE, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
'

STATUS="PASS"
echo "WI-OI-042 disposable runtime and restore certification passed."
