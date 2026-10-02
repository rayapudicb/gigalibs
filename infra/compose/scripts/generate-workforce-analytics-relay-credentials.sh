#!/usr/bin/env bash
set -euo pipefail

# WI-OI-109e3: dedicated Ed25519 identity for Workforce -> Analytics facts. The producer keeps only the private key;
# Analytics keeps only the public key. Existing keys are never printed or replaced.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
MODULE_ENV="${COMPOSE_DIR}/.env.modules"
WORKFORCE_ENV="${COMPOSE_DIR}/.env.workforce"

for file in "${MODULE_ENV}" "${WORKFORCE_ENV}"; do
  if [[ ! -f "${file}" ]]; then
    echo "Error: ${file} is required; generate the module and Workforce profiles first." >&2
    exit 1
  fi
done

if grep -q '^ANALYTICS_WORKFORCE_INBOX_RELAY_PUBLIC_KEY_BASE64=' "${MODULE_ENV}" ||
   grep -q '^ANALYTICS_WORKFORCE_INBOX_RELAY_PRIVATE_KEY_BASE64=' "${WORKFORCE_ENV}"; then
  echo "Error: a Workforce -> Analytics relay key already exists; refusing to replace it." >&2
  exit 1
fi

KEY_DIR="$(mktemp -d)"
trap 'rm -rf "${KEY_DIR}"' EXIT
openssl genpkey -algorithm Ed25519 -out "${KEY_DIR}/private.pem" >/dev/null 2>&1
PRIVATE="$(openssl pkey -in "${KEY_DIR}/private.pem" -outform DER | base64 | tr -d '\n')"
PUBLIC="$(openssl pkey -in "${KEY_DIR}/private.pem" -pubout -outform DER | base64 | tr -d '\n')"

umask 077
printf 'ANALYTICS_WORKFORCE_INBOX_RELAY_PUBLIC_KEY_BASE64=%s\n' "${PUBLIC}" >>"${MODULE_ENV}"
printf 'ANALYTICS_WORKFORCE_INBOX_RELAY_PRIVATE_KEY_BASE64=%s\n' "${PRIVATE}" >>"${WORKFORCE_ENV}"
chmod 600 "${MODULE_ENV}" "${WORKFORCE_ENV}"
echo "Appended the Workforce -> Analytics relay keys without printing secret values."
