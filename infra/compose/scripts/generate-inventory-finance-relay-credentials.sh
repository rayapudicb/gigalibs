#!/usr/bin/env bash
# WI-OI-120fq / WI-OI-120bp: Inventory→Finance and Finance→Inventory relay Ed25519 keys (never printed).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_SUFFIX="${GIGALIBS_COMPOSE_ENV_SUFFIX:-}"
MODULE_ENV="${COMPOSE_DIR}/.env${ENV_SUFFIX}.modules"
FINANCE_MODULE_ENV="${COMPOSE_DIR}/.env${ENV_SUFFIX}.module.financial-operations"
INVENTORY_MODULE_ENV="${COMPOSE_DIR}/.env${ENV_SUFFIX}.module.universal-inventory"
PROCUREMENT_MODULE_ENV="${COMPOSE_DIR}/.env${ENV_SUFFIX}.module.universal-procurement"
MANUFACTURING_MODULE_ENV="${COMPOSE_DIR}/.env${ENV_SUFFIX}.module.universal-manufacturing"

for file in "${MODULE_ENV}"; do
  if [[ ! -f "${file}" ]]; then
    echo "Error: ${file} is required." >&2
    exit 1
  fi
done

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

umask 077

if ! grep -q '^FINANCE_INBOX_RELAY_PUBLIC_KEY_BASE64=' "${MODULE_ENV}"; then
  gen_pair
  {
    printf 'FINANCE_INBOX_RELAY_PUBLIC_KEY_BASE64=%s\n' "${PUBLIC}"
    printf 'FINANCE_INBOX_RELAY_PRIVATE_KEY_BASE64=%s\n' "${PRIVATE}"
    printf 'INVENTORY_RELAY_FINANCE_URL=http://127.0.0.1:4790\n'
    printf 'INVENTORY_RELAY_FINANCE_INBOX_PATH=/financial-operations/internal/v1/inbox\n'
  } >>"${MODULE_ENV}"
  echo "Added Inventory→Finance relay keys to ${MODULE_ENV} (values not printed)."
fi

if [[ -f "${FINANCE_MODULE_ENV}" && -f "${INVENTORY_MODULE_ENV}" ]] &&
  ! grep -q '^FINANCE_INVENTORY_INBOX_RELAY_PRIVATE_KEY_BASE64=' "${FINANCE_MODULE_ENV}"; then
  gen_pair
  printf 'INVENTORY_INBOX_RELAY_PUBLIC_KEY_BASE64=%s\n' "${PUBLIC}" >>"${INVENTORY_MODULE_ENV}"
  {
    printf 'FINANCE_INVENTORY_INBOX_RELAY_PRIVATE_KEY_BASE64=%s\n' "${PRIVATE}"
    printf 'FINANCE_RELAY_INVENTORY_URL=http://127.0.0.1:4790\n'
    printf 'FINANCE_RELAY_INVENTORY_INBOX_PATH=/universal-inventory/internal/v1/inbox\n'
    printf 'FINANCE_INVENTORY_RELAY_INTERVAL_MS=400\n'
  } >>"${FINANCE_MODULE_ENV}"
  echo "Added Finance→Inventory relay keys (values not printed)."
fi

if [[ -f "${INVENTORY_MODULE_ENV}" && -f "${PROCUREMENT_MODULE_ENV}" ]] &&
  ! grep -q '^PROCUREMENT_INBOX_RELAY_PUBLIC_KEY_BASE64=' "${INVENTORY_MODULE_ENV}"; then
  gen_pair
  {
    printf 'PROCUREMENT_INBOX_RELAY_PUBLIC_KEY_BASE64=%s\n' "${PUBLIC}"
    printf 'PROCUREMENT_INBOX_RELAY_PRIVATE_KEY_BASE64=%s\n' "${PRIVATE}"
    printf 'INVENTORY_RELAY_PROCUREMENT_URL=http://127.0.0.1:4790\n'
    printf 'INVENTORY_RELAY_PROCUREMENT_INBOX_PATH=/universal-procurement/internal/v1/inbox\n'
  } >>"${MODULE_ENV}"
  printf 'PROCUREMENT_INBOX_RELAY_PUBLIC_KEY_BASE64=%s\n' "${PUBLIC}" >>"${PROCUREMENT_MODULE_ENV}"
  echo "Added Inventory→Procurement replenishment relay keys (values not printed)."
fi

if [[ -f "${MANUFACTURING_MODULE_ENV}" && -f "${MODULE_ENV}" ]]; then
  if ! grep -q '^MANUFACTURING_INVENTORY_RELAY_PRIVATE_KEY_BASE64=' "${MANUFACTURING_MODULE_ENV}"; then
    gen_pair
    {
      printf 'INVENTORY_MANUFACTURING_RESERVE_COMMAND_INBOX_PUBLIC_KEY_BASE64=%s\n' "${PUBLIC}"
      printf 'INVENTORY_ISSUE_DEMAND_COMMAND_INBOX_PUBLIC_KEY_BASE64=%s\n' "${PUBLIC}"
      printf 'INVENTORY_PRODUCTION_RECEIPT_COMMAND_INBOX_PUBLIC_KEY_BASE64=%s\n' "${PUBLIC}"
    } >>"${MODULE_ENV}"
    {
      printf 'MANUFACTURING_INVENTORY_RELAY_PRIVATE_KEY_BASE64=%s\n' "${PRIVATE}"
      printf 'MANUFACTURING_INVENTORY_RELAY_URL=http://127.0.0.1:4790\n'
    } >>"${MANUFACTURING_MODULE_ENV}"
    echo 'Added Manufacturing→Inventory command keys (values not printed).'
  fi
  if ! grep -q '^MANUFACTURING_FINANCE_RELAY_PRIVATE_KEY_BASE64=' "${MANUFACTURING_MODULE_ENV}"; then
    gen_pair
    printf 'FINANCE_MANUFACTURING_INBOX_PUBLIC_KEY_BASE64=%s\n' "${PUBLIC}" >>"${MODULE_ENV}"
    {
      printf 'MANUFACTURING_FINANCE_RELAY_PRIVATE_KEY_BASE64=%s\n' "${PRIVATE}"
      printf 'MANUFACTURING_RELAY_FINANCE_URL=http://127.0.0.1:4790\n'
      printf 'MANUFACTURING_RELAY_FINANCE_INBOX_PATH=/financial-operations/internal/v1/manufacturing-inbox\n'
      printf 'MANUFACTURING_FINANCE_RELAY_INTERVAL_MS=400\n'
    } >>"${MANUFACTURING_MODULE_ENV}"
    echo 'Added Manufacturing→Finance inbox keys (values not printed).'
  fi
  # Older generated env files pointed Manufacturing at Inventory's Finance inbox.
  # Keep one route setting when an older env file already contains the previous inbox path.
  perl -0pi -e 's#^MANUFACTURING_RELAY_FINANCE_INBOX_PATH=.*\n##mg' "${MANUFACTURING_MODULE_ENV}"
  printf 'MANUFACTURING_RELAY_FINANCE_INBOX_PATH=/financial-operations/internal/v1/manufacturing-inbox\n' >>"${MANUFACTURING_MODULE_ENV}"
fi

chmod 600 "${MODULE_ENV}" 2>/dev/null || true
[[ -f "${FINANCE_MODULE_ENV}" ]] && chmod 600 "${FINANCE_MODULE_ENV}"
[[ -f "${INVENTORY_MODULE_ENV}" ]] && chmod 600 "${INVENTORY_MODULE_ENV}"
[[ -f "${PROCUREMENT_MODULE_ENV}" ]] && chmod 600 "${PROCUREMENT_MODULE_ENV}"
[[ -f "${MANUFACTURING_MODULE_ENV}" ]] && chmod 600 "${MANUFACTURING_MODULE_ENV}"
