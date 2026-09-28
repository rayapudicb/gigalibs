#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${COMPOSE_DIR}/../.." && pwd)"
SOURCE_ENV="${GIGALIBS_SOURCE_ENV:-${REPO_ROOT}/.env}"
TARGET_ENV="${COMPOSE_DIR}/.env"

if [[ -e "${TARGET_ENV}" ]]; then
  echo "Error: ${TARGET_ENV} already exists; refusing to overwrite local secrets." >&2
  exit 1
fi
if [[ ! -f "${SOURCE_ENV}" ]]; then
  echo "Error: ${SOURCE_ENV} is required to reuse the existing PostgreSQL and MinIO credentials." >&2
  exit 1
fi
for command_name in git node openssl; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Error: ${command_name} is required." >&2
    exit 1
  fi
done

read_env_value() {
  local key="$1"
  local value
  value="$(awk -v key="${key}" 'index($0, key "=") == 1 { print substr($0, length(key) + 2); exit }' "${SOURCE_ENV}")"
  if [[ "${value}" == \"*\" && "${value}" == *\" ]]; then
    value="${value:1:${#value}-2}"
  elif [[ "${value}" == \'*\' && "${value}" == *\' ]]; then
    value="${value:1:${#value}-2}"
  fi
  if [[ -z "${value}" || "${value}" == *REPLACE_* ]]; then
    echo "Error: ${key} must contain a real value in ${SOURCE_ENV}." >&2
    exit 1
  fi
  printf '%s' "${value}"
}

DATABASE_URL="$(read_env_value DATABASE_URL)"
CONTROL_DB_USER="$(read_env_value CONTROL_DB_USER)"
CONTROL_DB_NAME="$(read_env_value CONTROL_DB_NAME)"
STORAGE_ENDPOINT="$(read_env_value STORAGE_ENDPOINT)"
STORAGE_ACCESS_KEY="$(read_env_value STORAGE_ACCESS_KEY)"
STORAGE_SECRET_KEY="$(read_env_value STORAGE_SECRET_KEY)"
STORAGE_BUCKET="$(read_env_value STORAGE_BUCKET)"
STORAGE_REGION="$(read_env_value STORAGE_REGION)"

DATABASE_URL="${DATABASE_URL//@localhost:/@host.docker.internal:}"
DATABASE_URL="${DATABASE_URL//@127.0.0.1:/@host.docker.internal:}"
STORAGE_ENDPOINT="${STORAGE_ENDPOINT/localhost/host.docker.internal}"
STORAGE_ENDPOINT="${STORAGE_ENDPOINT/127.0.0.1/host.docker.internal}"

if [[ "${DATABASE_URL}" != postgresql://* && "${DATABASE_URL}" != postgres://* ]]; then
  echo "Error: DATABASE_URL must use PostgreSQL." >&2
  exit 1
fi
if [[ "${STORAGE_ENDPOINT}" != "http://host.docker.internal:"* ]]; then
  echo "Error: local MinIO must resolve through http://host.docker.internal:<port>." >&2
  exit 1
fi

SOURCE_REVISION="$(git -C "${REPO_ROOT}" rev-parse HEAD)"
SOURCE_STATE_SHA256="$(node "${REPO_ROOT}/scripts/compute-source-state-sha256.mjs")"
TAG="${SOURCE_REVISION:0:12}-${SOURCE_STATE_SHA256:0:12}"
RELEASE_ID="local-$(date -u +'%Y%m%dT%H%M%SZ')-${TAG}"

generate_secret() {
  openssl rand -hex 32
}

CONTROL_PAYLOAD_ENCRYPTION_KEY="$(openssl rand -base64 32 | tr -d '\n')"
JWT_ACCESS_SECRET="$(generate_secret)"
EXECUTION_EVENT_SIGNING_SECRET="$(generate_secret)"
OBSERVABILITY_METRICS_TOKEN="$(generate_secret)"

KEY_DIR="$(mktemp -d)"
trap 'rm -rf "${KEY_DIR}"' EXIT
openssl genpkey -algorithm ED25519 -out "${KEY_DIR}/configuration-private.pem" 2>/dev/null
openssl pkey -in "${KEY_DIR}/configuration-private.pem" -outform DER \
  -out "${KEY_DIR}/configuration-private.der" 2>/dev/null
openssl pkey -in "${KEY_DIR}/configuration-private.pem" -pubout -outform DER \
  -out "${KEY_DIR}/configuration-public.der" 2>/dev/null
CONFIGURATION_PRIVATE_KEY="$(openssl base64 -A -in "${KEY_DIR}/configuration-private.der")"
CONFIGURATION_PUBLIC_KEY="$(openssl base64 -A -in "${KEY_DIR}/configuration-public.der")"
SIGNING_KEY_ID="local-configuration-signer-v1"

umask 077
cat >"${TARGET_ENV}" <<EOF
PROFILE_KEY=configuration-local-development-v1
EXECUTION_CLASS=LOCAL_DEVELOPMENT
ENVIRONMENT_KEY=local-development
RELEASE_ID=${RELEASE_ID}
EVIDENCE_ID=local-pending
SOURCE_REVISION=${SOURCE_REVISION}
SOURCE_STATE_SHA256=${SOURCE_STATE_SHA256}
PUBLIC_ORIGIN=http://localhost:5180

MIGRATIONS_IMAGE=gigalibs/control-plane-migrations:${TAG}
API_IMAGE=gigalibs/playground-api:${TAG}
WEB_IMAGE=gigalibs/workflow-platform:${TAG}

DATABASE_URL=${DATABASE_URL}
CONTROL_DB_USER=${CONTROL_DB_USER}
CONTROL_DB_NAME=${CONTROL_DB_NAME}
CONTROL_POSTGRES_CONTAINER=gigalibs-postgres
MINIO_CONTAINER=docker-minio-1
STORAGE_ENDPOINT=${STORAGE_ENDPOINT}
STORAGE_ACCESS_KEY=${STORAGE_ACCESS_KEY}
STORAGE_SECRET_KEY=${STORAGE_SECRET_KEY}
STORAGE_BUCKET=${STORAGE_BUCKET}
STORAGE_REGION=${STORAGE_REGION}

API_PUBLIC_PORT=3333
WEB_PUBLIC_PORT=5180

JWT_ACCESS_SECRET=${JWT_ACCESS_SECRET}
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d
CONTROL_PAYLOAD_ENCRYPTION_KEY=${CONTROL_PAYLOAD_ENCRYPTION_KEY}
CONTROL_PAYLOAD_KEY_VERSION=local-v1
CONTROL_PAYLOAD_PREVIOUS_KEYS_JSON=

CONFIGURATION_PACKAGE_SIGNING_KEY_ID=${SIGNING_KEY_ID}
CONFIGURATION_PACKAGE_SIGNING_PRIVATE_KEY_BASE64=${CONFIGURATION_PRIVATE_KEY}
CONFIGURATION_PACKAGE_TRUSTED_PUBLIC_KEYS_JSON={"${SIGNING_KEY_ID}":"${CONFIGURATION_PUBLIC_KEY}"}
CONFIGURATION_RUNTIME_ENVIRONMENT_KEY=local-uat

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
NEXT_PUBLIC_ENV_LABEL=local
NEXT_PUBLIC_USE_FORM_ENGINE=false
EOF

chmod 600 "${TARGET_ENV}"
echo "Created ${TARGET_ENV} with mode 0600 for ${RELEASE_ID}. Secret values were not printed."
