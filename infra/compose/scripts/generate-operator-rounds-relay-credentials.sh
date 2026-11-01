#!/usr/bin/env bash
set -euo pipefail

# WI-OI-133: dedicated Ed25519 identities for Rounds -> CMMS (corrective actions), Rounds -> Workforce (eligibility)
# and Rounds -> Analytics (reading facts). The module host keeps only the private keys in .env.module.operator-rounds;
# each consumer keeps only its public key. Existing keys are never printed or replaced.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_SUFFIX="${GIGALIBS_COMPOSE_ENV_SUFFIX:-}"
MODULE_ENV="${COMPOSE_DIR}/.env${ENV_SUFFIX}.modules"
WORKFORCE_ENV="${COMPOSE_DIR}/.env${ENV_SUFFIX}.workforce"
ROUNDS_ENV="${COMPOSE_DIR}/.env${ENV_SUFFIX}.module.operator-rounds"

for file in "${MODULE_ENV}" "${WORKFORCE_ENV}" "${ROUNDS_ENV}"; do
  if [[ ! -f "${file}" ]]; then
    echo "Error: ${file} is required; run generate-generated-module-credentials.sh operator-rounds first." >&2
    exit 1
  fi
done

if grep -q -E '^(CMMS|ANALYTICS)_ROUNDS_INBOX_RELAY_PUBLIC_KEY_BASE64=' "${MODULE_ENV}" ||
   grep -q '^WORKFORCE_ROUNDS_INBOX_RELAY_PUBLIC_KEY_BASE64=' "${WORKFORCE_ENV}" ||
   grep -q -E '^OPERATOR_ROUNDS_(CMMS|WORKFORCE|ANALYTICS)_INBOX_RELAY_PRIVATE_KEY_BASE64=' "${ROUNDS_ENV}"; then
  echo "Error: a Rounds relay key already exists; refusing to replace it." >&2
  exit 1
fi

KEY_DIR="$(mktemp -d)"
trap 'rm -rf "${KEY_DIR}"' EXIT
umask 077

# Generates one key pair and appends: the consumer's public key to $2 as $3, the producer's private key and target
# origin to the Rounds env as OPERATOR_ROUNDS_<peer>_INBOX_RELAY_PRIVATE_KEY_BASE64 / OPERATOR_ROUNDS_RELAY_<peer>_URL.
pair() {
  local peer="$1" consumer_env="$2" public_name="$3" origin="$4"
  openssl genpkey -algorithm Ed25519 -out "${KEY_DIR}/${peer}.pem" >/dev/null 2>&1
  printf '%s=%s\n' "${public_name}" \
    "$(openssl pkey -in "${KEY_DIR}/${peer}.pem" -pubout -outform DER | base64 | tr -d '\n')" >>"${consumer_env}"
  printf 'OPERATOR_ROUNDS_%s_INBOX_RELAY_PRIVATE_KEY_BASE64=%s\n' "${peer}" \
    "$(openssl pkey -in "${KEY_DIR}/${peer}.pem" -outform DER | base64 | tr -d '\n')" >>"${ROUNDS_ENV}"
  printf 'OPERATOR_ROUNDS_RELAY_%s_URL=%s\n' "${peer}" "${origin}" >>"${ROUNDS_ENV}"
}

pair CMMS "${MODULE_ENV}" CMMS_ROUNDS_INBOX_RELAY_PUBLIC_KEY_BASE64 http://cmms-api:4200
pair ANALYTICS "${MODULE_ENV}" ANALYTICS_ROUNDS_INBOX_RELAY_PUBLIC_KEY_BASE64 http://analytics-api:4400
pair WORKFORCE "${WORKFORCE_ENV}" WORKFORCE_ROUNDS_INBOX_RELAY_PUBLIC_KEY_BASE64 http://workforce-api:4700
chmod 600 "${MODULE_ENV}" "${WORKFORCE_ENV}" "${ROUNDS_ENV}"
echo "Appended the Rounds -> CMMS, Analytics and Workforce relay keys without printing secret values."
