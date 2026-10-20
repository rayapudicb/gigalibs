#!/usr/bin/env bash
# WI-OI-120fq: Inventory signs with FINANCE_INBOX_RELAY_PRIVATE_KEY; Finance verifies with FINANCE_INBOX_RELAY_PUBLIC_KEY.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_ENV="${SCRIPT_DIR}/../.env.modules"
if [[ ! -f "${MODULE_ENV}" ]]; then
  echo "Error: ${MODULE_ENV} is required." >&2
  exit 1
fi
if grep -q '^FINANCE_INBOX_RELAY_PUBLIC_KEY_BASE64=' "${MODULE_ENV}"; then
  echo "Finance inventory relay keys already present in ${MODULE_ENV}; refusing to overwrite." >&2
  exit 1
fi
key_dir="$(mktemp -d)"
openssl genpkey -algorithm Ed25519 -out "${key_dir}/private.pem" >/dev/null 2>&1
openssl pkey -in "${key_dir}/private.pem" -pubout -out "${key_dir}/public.pem" >/dev/null 2>&1
PUBLIC="$(openssl pkey -pubin -in "${key_dir}/public.pem" -outform DER | base64 | tr -d '\n')"
PRIVATE="$(openssl pkey -in "${key_dir}/private.pem" -outform DER | base64 | tr -d '\n')"
rm -rf "${key_dir}"
umask 077
{
  printf 'FINANCE_INBOX_RELAY_PUBLIC_KEY_BASE64=%s\n' "${PUBLIC}"
  printf 'FINANCE_INBOX_RELAY_PRIVATE_KEY_BASE64=%s\n' "${PRIVATE}"
  printf 'INVENTORY_RELAY_FINANCE_URL=http://127.0.0.1:4790\n'
  printf 'INVENTORY_RELAY_FINANCE_INBOX_PATH=/financial-operations/internal/v1/inbox\n'
} >>"${MODULE_ENV}"
chmod 600 "${MODULE_ENV}"
echo "Added Inventory→Finance relay keys to ${MODULE_ENV} (values not printed)."
