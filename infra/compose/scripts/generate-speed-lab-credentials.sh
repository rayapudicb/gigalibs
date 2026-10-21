#!/usr/bin/env bash
# WI-OI-120cc (SPEED S9a): secrets for the speed-lab preview instance, Docker Compose project gigalibs-speed-lab
# (infra/compose/.env.speed-lab*). On the pattern of generate-test-stack-credentials.sh (WI-OI-120bo): it never
# overwrites a file and never prints a value; every password and key is random and none is in the repository.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${COMPOSE_DIR}/../.." && pwd)"
export GIGALIBS_COMPOSE_ENV_SUFFIX=.speed-lab

BASE_ENV="${COMPOSE_DIR}/.env.speed-lab"
DB_ENV="${COMPOSE_DIR}/.env.speed-lab.database"
ACCOUNTS_ENV="${COMPOSE_DIR}/.env.speed-lab.accounts"

for existing in "${BASE_ENV}" "${DB_ENV}" "${ACCOUNTS_ENV}"; do
  if [[ -e "${existing}" ]]; then
    echo "Error: ${existing} already exists; refusing to overwrite speed-lab secrets." >&2
    exit 1
  fi
done
for command_name in git node openssl; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Error: ${command_name} is required." >&2
    exit 1
  fi
done
for file in "${BASE_ENV}" "${DB_ENV}" "${ACCOUNTS_ENV}"; do
  if ! git -C "${REPO_ROOT}" check-ignore -q "${file}"; then
    echo "Error: ${file} must be gitignored before secrets are written." >&2
    exit 1
  fi
done

SOURCE_REVISION="$(git -C "${REPO_ROOT}" rev-parse HEAD)"
SOURCE_STATE_SHA256="$(node "${REPO_ROOT}/scripts/compute-source-state-sha256.mjs")"
TAG="${SOURCE_REVISION:0:12}-${SOURCE_STATE_SHA256:0:12}"
RELEASE_ID="speed-lab-$(date -u +'%Y%m%dT%H%M%SZ')-${TAG}"
POSTGRES_HOST_PORT="${SPEED_LAB_POSTGRES_HOST_PORT:-5442}"
API_HOST_PORT="${SPEED_LAB_API_HOST_PORT:-3335}"
WEB_HOST_PORT="${SPEED_LAB_WEB_HOST_PORT:-5190}"
DB_PASSWORD="$(openssl rand -hex 24)"
ADMIN_PASSWORD="$(openssl rand -hex 12)Aa9"
APPROVER_PASSWORD="$(openssl rand -hex 12)Aa9"
OBJECTS_ROOT_PASSWORD="$(openssl rand -hex 32)"
STORAGE_SECRET_KEY="$(openssl rand -hex 32)"
SPEED_STORAGE_SECRET_KEY="$(openssl rand -hex 32)"
JWT_ACCESS_SECRET="$(openssl rand -hex 32)"
EXECUTION_EVENT_SIGNING_SECRET="$(openssl rand -hex 32)"
OBSERVABILITY_METRICS_TOKEN="$(openssl rand -hex 32)"
CONTROL_PAYLOAD_ENCRYPTION_KEY="$(openssl rand -base64 32 | tr -d '\n')"

KEY_DIR="$(mktemp -d)"
trap 'rm -rf "${KEY_DIR}"' EXIT
openssl genpkey -algorithm ED25519 -out "${KEY_DIR}/configuration-private.pem" 2>/dev/null
openssl pkey -in "${KEY_DIR}/configuration-private.pem" -outform DER -out "${KEY_DIR}/configuration-private.der" 2>/dev/null
openssl pkey -in "${KEY_DIR}/configuration-private.pem" -pubout -outform DER -out "${KEY_DIR}/configuration-public.der" 2>/dev/null
CONFIGURATION_PRIVATE_KEY="$(openssl base64 -A -in "${KEY_DIR}/configuration-private.der")"
CONFIGURATION_PUBLIC_KEY="$(openssl base64 -A -in "${KEY_DIR}/configuration-public.der")"
SIGNING_KEY_ID="speed-lab-configuration-signer-v1"

umask 077
printf '# WI-OI-120cc: speed-lab Postgres superuser (project gigalibs-speed-lab).\nSPEED_LAB_DATABASE_SUPERUSER_PASSWORD=%s\n' "${DB_PASSWORD}" >"${DB_ENV}"
chmod 600 "${DB_ENV}"

cat >"${BASE_ENV}" <<EOF
# WI-OI-120cc: the speed-lab preview instance (project gigalibs-speed-lab). Never UAT, never gigalibs-test.
PROFILE_KEY=speed-lab-preview-v1
EXECUTION_CLASS=LOCAL_DEVELOPMENT
ENVIRONMENT_KEY=speed-lab-preview
RELEASE_ID=${RELEASE_ID}
EVIDENCE_ID=speed-lab-pending
SOURCE_REVISION=${SOURCE_REVISION}
SOURCE_STATE_SHA256=${SOURCE_STATE_SHA256}
PUBLIC_ORIGIN=http://127.0.0.1:${WEB_HOST_PORT}
SPEED_LAB_POSTGRES_HOST_PORT=${POSTGRES_HOST_PORT}

MIGRATIONS_IMAGE=gigalibs/control-plane-migrations:${TAG}
API_IMAGE=gigalibs/playground-api:${TAG}
WEB_IMAGE=gigalibs/workflow-platform:${TAG}

DATABASE_URL=postgresql://gigalibs:${DB_PASSWORD}@lab-postgres:5432/gigalibs
CONTROL_DB_USER=gigalibs
CONTROL_DB_NAME=gigalibs
CONTROL_POSTGRES_CONTAINER=gigalibs-speed-lab-lab-postgres-1

SPEED_LAB_OBJECTS_ROOT_USER=speed-lab-root
SPEED_LAB_OBJECTS_ROOT_PASSWORD=${OBJECTS_ROOT_PASSWORD}
STORAGE_ENDPOINT=http://lab-objects:9000
STORAGE_ACCESS_KEY=speed-lab-platform
STORAGE_SECRET_KEY=${STORAGE_SECRET_KEY}
STORAGE_BUCKET=speed-lab-platform
STORAGE_REGION=us-east-1
SPEED_STORAGE_ACCESS_KEY=speed-lab-dossiers
SPEED_STORAGE_SECRET_KEY=${SPEED_STORAGE_SECRET_KEY}
SPEED_STORAGE_BUCKET=speed-lab-dossiers
SPEED_STORAGE_REGION=us-east-1

API_PUBLIC_PORT=${API_HOST_PORT}
WEB_PUBLIC_PORT=${WEB_HOST_PORT}

JWT_ACCESS_SECRET=${JWT_ACCESS_SECRET}
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d
CONTROL_PAYLOAD_ENCRYPTION_KEY=${CONTROL_PAYLOAD_ENCRYPTION_KEY}
CONTROL_PAYLOAD_KEY_VERSION=speed-lab-v1
CONTROL_PAYLOAD_PREVIOUS_KEYS_JSON=

CONFIGURATION_PACKAGE_SIGNING_KEY_ID=${SIGNING_KEY_ID}
CONFIGURATION_PACKAGE_SIGNING_PRIVATE_KEY_BASE64=${CONFIGURATION_PRIVATE_KEY}
CONFIGURATION_PACKAGE_TRUSTED_PUBLIC_KEYS_JSON={"${SIGNING_KEY_ID}":"${CONFIGURATION_PUBLIC_KEY}"}
CONFIGURATION_RUNTIME_ENVIRONMENT_KEY=speed-lab-preview

WORKFLOW_SCHEMA_VERSION=1.0
WORKFLOW_COMPILER_VERSION=1.0
WORKFLOW_PUBLISH_MAX_RETRIES=3
EXECUTION_EVENT_SOURCE_ID=local-execution-plane
EXECUTION_EVENT_SIGNING_SECRET=${EXECUTION_EVENT_SIGNING_SECRET}
EXECUTION_EVENT_MAX_SKEW_SECONDS=300
CONNECTOR_HTTP_ALLOWED_HOSTS=
CONNECTOR_HTTP_ALLOWED_PORTS=443
CONNECTOR_HTTP_TIMEOUT_SECONDS=30
CONNECTOR_HTTP_MAX_RESPONSE_BYTES=1048576
CONNECTOR_DATABASE_ALLOWED_HOSTS=
CONNECTOR_DATABASE_ALLOWED_PORTS=5432
CONNECTOR_FAILURE_THRESHOLD=5
CONNECTOR_CIRCUIT_COOLDOWN_SECONDS=300
STORAGE_PRESIGN_SECONDS=900
STORAGE_MAX_FILE_BYTES=10485760
STORAGE_CLEANUP_INTERVAL_SECONDS=60
STORAGE_CLEANUP_BATCH_SIZE=100
RETENTION_WORKER_INTERVAL_SECONDS=60
RETENTION_ENVIRONMENT_BATCH_SIZE=100
RETENTION_EVENT_BATCH_SIZE=500
CONTROL_OUTBOX_POLL_INTERVAL_SECONDS=2
CONTROL_OUTBOX_BATCH_SIZE=50
CONTROL_OUTBOX_CLAIM_TIMEOUT_SECONDS=60
CONTROL_OUTBOX_MAX_ATTEMPTS=10
CONTROL_OUTBOX_RETRY_BASE_SECONDS=2
CONTROL_OUTBOX_RETRY_MAX_SECONDS=300
OBSERVABILITY_METRICS_TOKEN=${OBSERVABILITY_METRICS_TOKEN}

BFF_MAX_REQUEST_BYTES=1048576
NEXT_PUBLIC_ENV_LABEL=speed-lab-preview
NEXT_PUBLIC_USE_FORM_ENGINE=false
# SPEED is PLANNED: the preview flag opens PLANNED modules (WI-OI-120ak S5); CONTAINED ones stay locked.
GIGALIBS_UAT_PREVIEW=enabled
EOF
chmod 600 "${BASE_ENV}"

cat >"${ACCOUNTS_ENV}" <<EOF
# WI-OI-120cc: the speed-lab preview's test workspace and its two administrators (administrator-made accounts, W2).
SPEED_LAB_TARGET=speed-lab
SPEED_LAB_WORKSPACE="SPEED Lab Preview (TEST)"
SPEED_LAB_ADMIN_EMAIL=speed.admin@speed-lab.invalid
SPEED_LAB_ADMIN_PASSWORD=${ADMIN_PASSWORD}
# The second person who approves the organization version (an organization change needs two people).
SPEED_LAB_APPROVER_EMAIL=speed.approver@speed-lab.invalid
SPEED_LAB_APPROVER_PASSWORD=${APPROVER_PASSWORD}
EOF
chmod 600 "${ACCOUNTS_ENV}"

"${SCRIPT_DIR}/generate-module-runtime-credentials.sh"
"${SCRIPT_DIR}/generate-workforce-runtime-credentials.sh"
"${SCRIPT_DIR}/generate-geospatial-runtime-credentials.sh"
"${SCRIPT_DIR}/generate-workforce-analytics-relay-credentials.sh"
"${SCRIPT_DIR}/generate-relay-credentials.sh"

# The module host runs every hosted module in one process and needs each one's settings; only SPEED is switched on.
HOSTED_MODULES=(
  financial-operations
  process-safety-screening
  product-catalogue
  universal-inventory
  universal-orders
  universal-procurement
)
for module in "${HOSTED_MODULES[@]}"; do
  if [[ ! -e "${COMPOSE_DIR}/.env.speed-lab.module.${module}" ]]; then
    "${SCRIPT_DIR}/generate-generated-module-credentials.sh" "${module}"
  fi
done
"${SCRIPT_DIR}/generate-inventory-finance-relay-credentials.sh"

echo "Created speed-lab credential files (infra/compose/.env.speed-lab*; mode 0600). Values were not printed."
