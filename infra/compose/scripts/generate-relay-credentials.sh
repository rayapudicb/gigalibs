#!/usr/bin/env bash
set -euo pipefail

# WI-OI-068 (ADR-0007 option A): the two Ed25519 relay key pairs of the CMMS ↔ Workforce handshake.
# Each inbox verifies with its own public key; only the peer producer holds the matching private key:
#   Workforce inbox — CMMS signs with WORKFORCE_INBOX_RELAY_PRIVATE_KEY_BASE64 (.env.modules),
#                     Workforce verifies with WORKFORCE_INBOX_RELAY_PUBLIC_KEY_BASE64 (.env.workforce);
#   CMMS inbox      — Workforce signs with CMMS_INBOX_RELAY_PRIVATE_KEY_BASE64 (.env.workforce),
#                     CMMS verifies with CMMS_INBOX_RELAY_PUBLIC_KEY_BASE64 (.env.modules).
# Appends to the existing mode-0600 profiles and refuses to run if either already holds relay keys.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
MODULE_ENV="${COMPOSE_DIR}/.env.modules"
WORKFORCE_ENV="${COMPOSE_DIR}/.env.workforce"

for file in "${MODULE_ENV}" "${WORKFORCE_ENV}"; do
  if [[ ! -f "${file}" ]]; then
    echo "Error: ${file} is required; generate the module and Workforce profiles first." >&2
    exit 1
  fi
  if grep -q '_INBOX_RELAY_' "${file}"; then
    echo "Error: ${file} already holds relay keys; refusing to replace them." >&2
    exit 1
  fi
done

KEY_DIR="$(mktemp -d)"
trap 'rm -rf "${KEY_DIR}"' EXIT

# Prints "<private DER base64> <public DER base64>" for a fresh Ed25519 pair.
key_pair() {
  local name="$1"
  openssl genpkey -algorithm Ed25519 -out "${KEY_DIR}/${name}.pem" >/dev/null 2>&1
  printf '%s %s' \
    "$(openssl pkey -in "${KEY_DIR}/${name}.pem" -outform DER | base64 | tr -d '\n')" \
    "$(openssl pkey -in "${KEY_DIR}/${name}.pem" -pubout -outform DER | base64 | tr -d '\n')"
}

read -r WORKFORCE_INBOX_PRIVATE WORKFORCE_INBOX_PUBLIC <<<"$(key_pair workforce-inbox)"
read -r CMMS_INBOX_PRIVATE CMMS_INBOX_PUBLIC <<<"$(key_pair cmms-inbox)"

umask 077
{
  printf 'CMMS_INBOX_RELAY_PUBLIC_KEY_BASE64=%s\n' "${CMMS_INBOX_PUBLIC}"
  printf 'WORKFORCE_INBOX_RELAY_PRIVATE_KEY_BASE64=%s\n' "${WORKFORCE_INBOX_PRIVATE}"
} >>"${MODULE_ENV}"
{
  printf 'WORKFORCE_INBOX_RELAY_PUBLIC_KEY_BASE64=%s\n' "${WORKFORCE_INBOX_PUBLIC}"
  printf 'CMMS_INBOX_RELAY_PRIVATE_KEY_BASE64=%s\n' "${CMMS_INBOX_PRIVATE}"
} >>"${WORKFORCE_ENV}"
chmod 600 "${MODULE_ENV}" "${WORKFORCE_ENV}"
echo "Appended the CMMS and Workforce inbox relay keys to ${MODULE_ENV} and ${WORKFORCE_ENV}. Secret values were not printed."
