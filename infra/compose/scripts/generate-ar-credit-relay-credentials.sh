#!/usr/bin/env bash
# WI-OI-123: AR credit balance outbox -> Business Partner signed inbox.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_SUFFIX="${GIGALIBS_COMPOSE_ENV_SUFFIX:-}"
MODULE_ENV="${COMPOSE_DIR}/.env${ENV_SUFFIX}.modules"

if [[ ! -f "${MODULE_ENV}" ]]; then
  echo "Error: ${MODULE_ENV} is required." >&2
  exit 1
fi
if grep -q '^BUSINESS_PARTNERS_CREDIT_INBOX_PUBLIC_KEY_BASE64=' "${MODULE_ENV}"; then
  if ! grep -q '^AR_CREDIT_RELAY_PRIVATE_KEY_BASE64=' "${MODULE_ENV}"; then
    echo "Error: the AR credit relay public key exists without its matching private key." >&2
    exit 1
  fi
  echo "AR credit relay credentials already exist."
  exit 0
fi
if grep -q '^AR_CREDIT_RELAY_PRIVATE_KEY_BASE64=' "${MODULE_ENV}"; then
  echo "Error: the AR credit relay private key exists without its matching public key." >&2
  exit 1
fi

key_dir="$(mktemp -d)"
trap 'rm -rf "${key_dir}"' EXIT
umask 077
openssl genpkey -algorithm Ed25519 -out "${key_dir}/private.pem" >/dev/null 2>&1
public="$(openssl pkey -in "${key_dir}/private.pem" -pubout -outform DER | base64 | tr -d '\n')"
private="$(openssl pkey -in "${key_dir}/private.pem" -outform DER | base64 | tr -d '\n')"
{
  printf 'BUSINESS_PARTNERS_CREDIT_INBOX_PUBLIC_KEY_BASE64=%s\n' "${public}"
  printf 'AR_CREDIT_RELAY_PRIVATE_KEY_BASE64=%s\n' "${private}"
} >>"${MODULE_ENV}"
chmod 600 "${MODULE_ENV}"
echo "Added AR credit relay credentials to ${MODULE_ENV} (values not printed)."
