#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
BASE_ENV="${COMPOSE_DIR}/.env"
TARGET_ENV="${COMPOSE_DIR}/.env.workforce"

if [[ ! -f "${BASE_ENV}" ]]; then
  echo "Error: ${BASE_ENV} is required; generate the base local profile first." >&2
  exit 1
fi
if [[ -e "${TARGET_ENV}" ]]; then
  echo "Error: ${TARGET_ENV} already exists; refusing to overwrite Workforce secrets." >&2
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

DATABASE_URL="$(read_base_value DATABASE_URL)"
SOURCE_REVISION="$(read_base_value SOURCE_REVISION)"
SOURCE_STATE_SHA256="$(read_base_value SOURCE_STATE_SHA256)"
TAG="${SOURCE_REVISION:0:12}-${SOURCE_STATE_SHA256:0:12}"
WORKFORCE_PASSWORD="$(openssl rand -hex 32)"
WORKFORCE_DATABASE_URL="$(runtime_database_url gigalibs_workforce_runtime "${WORKFORCE_PASSWORD}")"

KEY_DIR="$(mktemp -d)"
trap 'rm -rf "${KEY_DIR}"' EXIT
openssl genpkey -algorithm Ed25519 -out "${KEY_DIR}/private.pem" >/dev/null 2>&1
openssl pkey -in "${KEY_DIR}/private.pem" -pubout -out "${KEY_DIR}/public.pem" >/dev/null 2>&1
PRIVATE_KEY_BASE64="$(openssl pkey -in "${KEY_DIR}/private.pem" -outform DER | base64 | tr -d '\n')"
PUBLIC_KEY_BASE64="$(openssl pkey -pubin -in "${KEY_DIR}/public.pem" -outform DER | base64 | tr -d '\n')"

umask 077
{
  printf 'WORKFORCE_IMAGE=gigalibs/workforce-api:%s\n' "${TAG}"
  printf 'WORKFORCE_MIGRATIONS_DATABASE_URL=%s\n' "${DATABASE_URL}"
  printf 'WORKFORCE_DATABASE_URL=%s\n' "${WORKFORCE_DATABASE_URL}"
  printf 'WORKFORCE_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64=%s\n' "${PRIVATE_KEY_BASE64}"
  printf 'WORKFORCE_PLATFORM_CONTEXT_PUBLIC_KEY_BASE64=%s\n' "${PUBLIC_KEY_BASE64}"
} >"${TARGET_ENV}"

chmod 600 "${TARGET_ENV}"
echo "Created ${TARGET_ENV} with mode 0600. Secret values were not printed."
