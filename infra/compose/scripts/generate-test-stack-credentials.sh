#!/usr/bin/env bash
# WI-OI-120bo: secrets for the isolated project gigalibs-test (.env.test* and e2e/test.env).
# Never overwrites existing files and never prints values. Every password is random; none is in the repository.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${COMPOSE_DIR}/../.." && pwd)"
export GIGALIBS_COMPOSE_ENV_SUFFIX=.test

BASE_ENV="${COMPOSE_DIR}/.env.test"
DB_ENV="${COMPOSE_DIR}/.env.test.database"
E2E_ENV="${REPO_ROOT}/e2e/test.env"

for existing in "${BASE_ENV}" "${DB_ENV}" "${E2E_ENV}"; do
  if [[ -e "${existing}" ]]; then
    echo "Error: ${existing} already exists; refusing to overwrite test stack secrets." >&2
    exit 1
  fi
done
for command_name in git node openssl; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Error: ${command_name} is required." >&2
    exit 1
  fi
done
if ! git -C "${REPO_ROOT}" check-ignore -q "${E2E_ENV}" || ! git -C "${REPO_ROOT}" check-ignore -q "${BASE_ENV}"; then
  echo "Error: e2e/test.env and infra/compose/.env.test must be gitignored before secrets are written." >&2
  exit 1
fi

SOURCE_REVISION="$(git -C "${REPO_ROOT}" rev-parse HEAD)"
SOURCE_STATE_SHA256="$(node "${REPO_ROOT}/scripts/compute-source-state-sha256.mjs")"
TAG="${SOURCE_REVISION:0:12}-${SOURCE_STATE_SHA256:0:12}"
RELEASE_ID="test-$(date -u +'%Y%m%dT%H%M%SZ')-${TAG}"
TEST_DB_PASSWORD="$(openssl rand -hex 24)"
TEST_POSTGRES_HOST_PORT="${TEST_POSTGRES_HOST_PORT:-5441}"
TEST_API_HOST_PORT="${TEST_API_HOST_PORT:-3334}"
TEST_WEB_HOST_PORT="${TEST_WEB_HOST_PORT:-5181}"
E2E_ADMIN_PASSWORD="$(openssl rand -hex 20)Aa9"
E2E_APPROVER_PASSWORD="$(openssl rand -hex 20)Aa9"
STORAGE_SECRET_KEY="$(openssl rand -hex 32)"
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
SIGNING_KEY_ID="test-configuration-signer-v1"

DATABASE_URL="postgresql://gigalibs:${TEST_DB_PASSWORD}@test-postgres:5432/gigalibs"

umask 077
printf '# WI-OI-120bo: test-stack Postgres superuser (project gigalibs-test).\nTEST_DATABASE_SUPERUSER_PASSWORD=%s\n' "${TEST_DB_PASSWORD}" >"${DB_ENV}"
chmod 600 "${DB_ENV}"

cat >"${BASE_ENV}" <<EOF
PROFILE_KEY=configuration-local-development-v1
EXECUTION_CLASS=LOCAL_DEVELOPMENT
ENVIRONMENT_KEY=local-development
RELEASE_ID=${RELEASE_ID}
EVIDENCE_ID=test-pending
SOURCE_REVISION=${SOURCE_REVISION}
SOURCE_STATE_SHA256=${SOURCE_STATE_SHA256}
PUBLIC_ORIGIN=http://127.0.0.1:${TEST_WEB_HOST_PORT}
TEST_POSTGRES_HOST_PORT=${TEST_POSTGRES_HOST_PORT}

MIGRATIONS_IMAGE=gigalibs/control-plane-migrations:${TAG}
API_IMAGE=gigalibs/playground-api:${TAG}
WEB_IMAGE=gigalibs/workflow-platform:${TAG}

DATABASE_URL=${DATABASE_URL}
CONTROL_DB_USER=gigalibs
CONTROL_DB_NAME=gigalibs
CONTROL_POSTGRES_CONTAINER=gigalibs-test-test-postgres-1
MINIO_CONTAINER=docker-minio-1
STORAGE_ENDPOINT=http://host.docker.internal:9010
STORAGE_ACCESS_KEY=gigalibs
STORAGE_SECRET_KEY=${STORAGE_SECRET_KEY}
STORAGE_BUCKET=gigalibs-test-stack
STORAGE_REGION=us-east-1

API_PUBLIC_PORT=${TEST_API_HOST_PORT}
WEB_PUBLIC_PORT=${TEST_WEB_HOST_PORT}

JWT_ACCESS_SECRET=${JWT_ACCESS_SECRET}
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d
CONTROL_PAYLOAD_ENCRYPTION_KEY=${CONTROL_PAYLOAD_ENCRYPTION_KEY}
CONTROL_PAYLOAD_KEY_VERSION=test-v1
CONTROL_PAYLOAD_PREVIOUS_KEYS_JSON=

CONFIGURATION_PACKAGE_SIGNING_KEY_ID=${SIGNING_KEY_ID}
CONFIGURATION_PACKAGE_SIGNING_PRIVATE_KEY_BASE64=${CONFIGURATION_PRIVATE_KEY}
CONFIGURATION_PACKAGE_TRUSTED_PUBLIC_KEYS_JSON={"${SIGNING_KEY_ID}":"${CONFIGURATION_PUBLIC_KEY}"}
CONFIGURATION_RUNTIME_ENVIRONMENT_KEY=local-test-stack

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
NEXT_PUBLIC_ENV_LABEL=test-stack
NEXT_PUBLIC_USE_FORM_ENGINE=false
GIGALIBS_UAT_PREVIEW=enabled
EOF
chmod 600 "${BASE_ENV}"

"${SCRIPT_DIR}/generate-module-runtime-credentials.sh"
"${SCRIPT_DIR}/generate-workforce-runtime-credentials.sh"
"${SCRIPT_DIR}/generate-geospatial-runtime-credentials.sh"
"${SCRIPT_DIR}/generate-workforce-analytics-relay-credentials.sh"
"${SCRIPT_DIR}/generate-relay-credentials.sh"

TABLE1_MODULES=(
  financial-operations
  product-catalogue
  universal-procurement
  universal-orders
  universal-inventory
)
for module in "${TABLE1_MODULES[@]}"; do
  if [[ ! -e "${COMPOSE_DIR}/.env.test.module.${module}" ]]; then
    "${SCRIPT_DIR}/generate-generated-module-credentials.sh" "${module}"
  fi
done

cat >"${E2E_ENV}" <<EOF
# WI-OI-120bo: generated by generate-test-stack-credentials.sh for project gigalibs-test. Never UAT.
GIGALIBS_E2E_TARGET=test-stack
PLAYWRIGHT_TEST_BASE_URL=http://127.0.0.1:${TEST_WEB_HOST_PORT}
E2E_UAT_TENANT="GigaLibs Test Stack"
E2E_UAT_ADMIN_EMAIL=e2e.admin@gigalibs-test.invalid
E2E_UAT_ADMIN_PASSWORD=${E2E_ADMIN_PASSWORD}
E2E_UAT_APPROVER_EMAIL=e2e.approver@gigalibs-test.invalid
E2E_UAT_APPROVER_PASSWORD=${E2E_APPROVER_PASSWORD}
EOF
chmod 600 "${E2E_ENV}"

echo "Created gigalibs-test credential files (infra/compose/.env.test*, e2e/test.env; mode 0600). Values were not printed."
echo "Next: bash infra/compose/scripts/build-test-stack-images.sh, then bash infra/compose/scripts/up-test-stack.sh"
