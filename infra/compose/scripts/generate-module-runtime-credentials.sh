#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
BASE_ENV="${COMPOSE_DIR}/.env"
TARGET_ENV="${COMPOSE_DIR}/.env.modules"

if [[ ! -f "${BASE_ENV}" ]]; then
  echo "Error: ${BASE_ENV} is required; generate the base local profile first." >&2
  exit 1
fi

read_base_value() {
  local key="$1"
  local value
  value="$(awk -v key="${key}" 'index($0, key "=") == 1 { print substr($0, length(key) + 2); exit }' "${BASE_ENV}")"
  if [[ -z "${value}" ]]; then
    echo "Error: ${key} is missing from ${BASE_ENV}." >&2
    exit 1
  fi
  printf '%s' "${value}"
}

runtime_database_url() {
  local username="$1"
  local password="$2"
  SOURCE_DATABASE_URL="${DATABASE_URL}" RUNTIME_USERNAME="${username}" RUNTIME_PASSWORD="${password}" \
    node -e '
      const url = new URL(process.env.SOURCE_DATABASE_URL);
      url.username = process.env.RUNTIME_USERNAME;
      url.password = process.env.RUNTIME_PASSWORD;
      process.stdout.write(url.toString());
    '
}

# A module verifies a BFF-signed PlatformContextV1 with its own public key; the web container signs with the
# matching private key (WI-OI-064a Analytics, WI-OI-038 CMMS).
context_keys() {
  local prefix="$1"
  local key_dir
  key_dir="$(mktemp -d)"
  openssl genpkey -algorithm Ed25519 -out "${key_dir}/private.pem" >/dev/null 2>&1
  openssl pkey -in "${key_dir}/private.pem" -pubout -out "${key_dir}/public.pem" >/dev/null 2>&1
  printf '%s_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64=%s\n' "${prefix}" \
    "$(openssl pkey -in "${key_dir}/private.pem" -outform DER | base64 | tr -d '\n')"
  printf '%s_PLATFORM_CONTEXT_PUBLIC_KEY_BASE64=%s\n' "${prefix}" \
    "$(openssl pkey -pubin -in "${key_dir}/public.pem" -outform DER | base64 | tr -d '\n')"
  rm -rf "${key_dir}"
}

# WI-OI-038: the CMMS runtime image, its least-privilege database role and its signing key pair.
cmms_runtime_values() {
  printf 'CMMS_IMAGE=gigalibs/cmms-api:%s\n' "${TAG}"
  printf 'CMMS_DATABASE_URL=%s\n' "$(runtime_database_url gigalibs_cmms_runtime "$(openssl rand -hex 32)")"
  context_keys CMMS
}

DATABASE_URL="$(read_base_value DATABASE_URL)"
SOURCE_REVISION="$(read_base_value SOURCE_REVISION)"
SOURCE_STATE_SHA256="$(read_base_value SOURCE_STATE_SHA256)"
TAG="${SOURCE_REVISION:0:12}-${SOURCE_STATE_SHA256:0:12}"

if [[ -e "${TARGET_ENV}" ]]; then
  # An existing profile only gains the module groups it lacks; no existing secret is touched.
  umask 077
  added=()
  if ! grep -q '^ANALYTICS_PLATFORM_CONTEXT_PUBLIC_KEY_BASE64=' "${TARGET_ENV}"; then
    context_keys ANALYTICS >>"${TARGET_ENV}"
    added+=("Analytics platform-context key pair")
  fi
  if ! grep -q '^CMMS_PLATFORM_CONTEXT_PUBLIC_KEY_BASE64=' "${TARGET_ENV}"; then
    cmms_runtime_values >>"${TARGET_ENV}"
    added+=("CMMS image, runtime role and key pair")
  fi
  # WI-OI-104a: Connector Hub verifies BFF-signed contexts like the other module services.
  if ! grep -q '^CONNECTOR_HUB_PLATFORM_CONTEXT_PUBLIC_KEY_BASE64=' "${TARGET_ENV}"; then
    context_keys CONNECTOR_HUB >>"${TARGET_ENV}"
    added+=("Connector Hub platform-context key pair")
  fi
  # WI-OI-104c: the kernel worker's Redis (BullMQ job ids only) requires a password.
  if ! grep -q '^REDIS_PASSWORD=' "${TARGET_ENV}"; then
    printf 'REDIS_PASSWORD=%s\n' "$(openssl rand -hex 32)" >>"${TARGET_ENV}"
    added+=("kernel worker Redis password")
  fi
  if [[ ${#added[@]} -eq 0 ]]; then
    echo "Error: ${TARGET_ENV} already exists and is complete; refusing to overwrite module secrets." >&2
    exit 1
  fi
  chmod 600 "${TARGET_ENV}"
  printf 'Added to %s: %s. Secret values were not printed.\n' "${TARGET_ENV}" "$(IFS=', '; echo "${added[*]}")"
  exit 0
fi

CONNECTORS_PASSWORD="$(openssl rand -hex 32)"
ANALYTICS_PASSWORD="$(openssl rand -hex 32)"
CONNECTOR_VAULT_KEY="$(openssl rand -hex 32)"
CONNECTORS_DATABASE_URL="$(runtime_database_url gigalibs_connectors_runtime "${CONNECTORS_PASSWORD}")"
ANALYTICS_DATABASE_URL="$(runtime_database_url gigalibs_analytics_runtime "${ANALYTICS_PASSWORD}")"

umask 077
cat >"${TARGET_ENV}" <<EOF
CONNECTOR_HUB_IMAGE=gigalibs/connector-hub-api:${TAG}
ANALYTICS_IMAGE=gigalibs/analytics-api:${TAG}
MODULE_MIGRATIONS_DATABASE_URL=${DATABASE_URL}
CONNECTORS_DATABASE_URL=${CONNECTORS_DATABASE_URL}
ANALYTICS_DATABASE_URL=${ANALYTICS_DATABASE_URL}
CONNECTOR_VAULT_KEY=${CONNECTOR_VAULT_KEY}
CONNECTOR_HUB_ALLOWED_OUTBOUND_HOSTS=disabled.invalid
REDIS_PASSWORD=$(openssl rand -hex 32)
EOF
context_keys ANALYTICS >>"${TARGET_ENV}"
context_keys CONNECTOR_HUB >>"${TARGET_ENV}"
cmms_runtime_values >>"${TARGET_ENV}"

chmod 600 "${TARGET_ENV}"
echo "Created ${TARGET_ENV} with mode 0600. Secret values were not printed."
