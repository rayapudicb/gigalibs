#!/usr/bin/env bash
# Fills relay signing keys required by generated/compose.module-host.yaml when URLs are preset but keys were never generated.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_SUFFIX="${GIGALIBS_COMPOSE_ENV_SUFFIX:-}"
MODULE_ENV="${COMPOSE_DIR}/.env${ENV_SUFFIX}.modules"
MANUFACTURING_ENV="${COMPOSE_DIR}/.env${ENV_SUFFIX}.module.universal-manufacturing"
RETURNS_ENV="${COMPOSE_DIR}/.env${ENV_SUFFIX}.module.universal-returns"

[[ -f "${MODULE_ENV}" ]] || { echo "Error: missing ${MODULE_ENV}" >&2; exit 1; }

PUBLIC=""
PRIVATE=""
gen_pair() {
  local key_dir
  key_dir="$(mktemp -d)"
  openssl genpkey -algorithm Ed25519 -out "${key_dir}/private.pem" >/dev/null 2>&1
  PUBLIC="$(openssl pkey -in "${key_dir}/private.pem" -pubout -outform DER | base64 | tr -d '\n')"
  PRIVATE="$(openssl pkey -in "${key_dir}/private.pem" -outform DER | base64 | tr -d '\n')"
  rm -rf "${key_dir}"
}

append_if_missing() {
  local file="$1" key="$2" value="$3"
  grep -q "^${key}=" "${file}" 2>/dev/null && return 0
  printf '%s=%s\n' "${key}" "${value}" >>"${file}"
}

umask 077

if ! grep -q '^PROJECT_OPERATIONS_FINANCE_RELAY_PRIVATE_KEY_BASE64=' "${MODULE_ENV}"; then
  gen_pair
  append_if_missing "${MODULE_ENV}" 'FINANCE_PROJECTS_INBOX_PUBLIC_KEY_BASE64' "${PUBLIC}"
  append_if_missing "${MODULE_ENV}" 'PROJECT_OPERATIONS_FINANCE_RELAY_PRIVATE_KEY_BASE64' "${PRIVATE}"
  echo 'Added Project Operations→Finance relay keys to .env.modules (not printed).'
fi

if ! grep -q '^PROJECT_OPERATIONS_AR_RELAY_PRIVATE_KEY_BASE64=' "${MODULE_ENV}"; then
  gen_pair
  append_if_missing "${MODULE_ENV}" 'AR_PROJECTS_INBOX_RELAY_PUBLIC_KEY_BASE64' "${PUBLIC}"
  append_if_missing "${MODULE_ENV}" 'PROJECT_OPERATIONS_AR_RELAY_PRIVATE_KEY_BASE64' "${PRIVATE}"
  echo 'Added Project Operations→AR relay keys to .env.modules (not printed).'
fi

if [[ -f "${MANUFACTURING_ENV}" ]] && ! grep -q '^MANUFACTURING_FINANCE_RELAY_PRIVATE_KEY_BASE64=' "${MANUFACTURING_ENV}"; then
  gen_pair
  append_if_missing "${MODULE_ENV}" 'FINANCE_MANUFACTURING_INBOX_PUBLIC_KEY_BASE64' "${PUBLIC}"
  append_if_missing "${MANUFACTURING_ENV}" 'MANUFACTURING_FINANCE_RELAY_PRIVATE_KEY_BASE64' "${PRIVATE}"
  append_if_missing "${MANUFACTURING_ENV}" 'MANUFACTURING_RELAY_FINANCE_URL' 'http://127.0.0.1:4790'
  append_if_missing "${MANUFACTURING_ENV}" 'MANUFACTURING_RELAY_FINANCE_INBOX_PATH' '/financial-operations/internal/v1/manufacturing-inbox'
  echo 'Added Manufacturing→Finance relay keys (not printed).'
fi

if [[ -f "${RETURNS_ENV}" ]]; then
  if ! grep -q '^UNIVERSAL_RETURNS_INVENTORY_RELAY_PRIVATE_KEY_BASE64=' "${MODULE_ENV}"; then
    gen_pair
    append_if_missing "${MODULE_ENV}" 'INVENTORY_RMA_RETURN_RECEIPT_COMMAND_INBOX_PUBLIC_KEY_BASE64' "${PUBLIC}"
    append_if_missing "${MODULE_ENV}" 'UNIVERSAL_RETURNS_INVENTORY_RELAY_PRIVATE_KEY_BASE64' "${PRIVATE}"
    echo 'Added Returns→Inventory relay keys (not printed).'
  fi
  if ! grep -q '^UNIVERSAL_RETURNS_ORDERS_RELAY_PRIVATE_KEY_BASE64=' "${MODULE_ENV}"; then
    gen_pair
    append_if_missing "${MODULE_ENV}" 'ORDERS_RETURNS_RMA_INBOX_PUBLIC_KEY_BASE64' "${PUBLIC}"
    append_if_missing "${MODULE_ENV}" 'UNIVERSAL_RETURNS_ORDERS_RELAY_PRIVATE_KEY_BASE64' "${PRIVATE}"
    echo 'Added Returns→Orders relay keys (not printed).'
  fi
  if ! grep -q '^UNIVERSAL_RETURNS_FINANCE_RELAY_PRIVATE_KEY_BASE64=' "${MODULE_ENV}"; then
    gen_pair
    append_if_missing "${MODULE_ENV}" 'FINANCE_RETURNS_INBOX_PUBLIC_KEY_BASE64' "${PUBLIC}"
    append_if_missing "${MODULE_ENV}" 'UNIVERSAL_RETURNS_FINANCE_RELAY_PRIVATE_KEY_BASE64' "${PRIVATE}"
    echo 'Added Returns→Finance relay keys (not printed).'
  fi
fi

chmod 600 "${MODULE_ENV}" 2>/dev/null || true
[[ -f "${MANUFACTURING_ENV}" ]] && chmod 600 "${MANUFACTURING_ENV}"
[[ -f "${RETURNS_ENV}" ]] && chmod 600 "${RETURNS_ENV}"
