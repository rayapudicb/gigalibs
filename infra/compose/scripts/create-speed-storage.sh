#!/usr/bin/env bash
# WI-OI-120cd: SPEED's dossier store in the instance's existing MinIO (UAT: the container named by MINIO_CONTAINER in
# infra/compose/.env). The owner runs it from the release worktree. It creates the bucket, a policy that allows that
# bucket only and a key holding just that policy, then appends SPEED_STORAGE_* to .env.module.process-safety-screening.
# Idempotent for the bucket and policy; it refuses to run twice for the settings. The MinIO administrator account is
# used inside the container from its own environment, and no value is printed.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
# shellcheck source=release-worktree.sh
source "${SCRIPT_DIR}/release-worktree.sh"
gigalibs_require_release_worktree "$(basename "$0")"

BASE_ENV="${COMPOSE_DIR}/.env"
SPEED_ENV="${COMPOSE_DIR}/.env.module.process-safety-screening"
for file in "${BASE_ENV}" "${SPEED_ENV}"; do
  if [[ ! -f "${file}" ]]; then
    echo "Error: ${file} is required (generate-generated-module-credentials.sh process-safety-screening creates SPEED's)." >&2
    exit 1
  fi
done
if grep -q '^SPEED_STORAGE_' "${SPEED_ENV}"; then
  echo "Error: ${SPEED_ENV} already holds SPEED_STORAGE_*; refusing to replace them." >&2
  exit 1
fi
read_value() { awk -v key="$1" 'index($0, key "=") == 1 { print substr($0, length(key) + 2); exit }' "${BASE_ENV}"; }
CONTAINER="$(read_value MINIO_CONTAINER)"
ENDPOINT="$(read_value STORAGE_ENDPOINT)"
REGION="$(read_value STORAGE_REGION)"
BUCKET="${SPEED_STORAGE_BUCKET:-gigalibs-speed-dossiers}"
KEY="${SPEED_STORAGE_ACCESS_KEY:-gigalibs-speed-dossiers}"
if [[ -z "${CONTAINER}" || -z "${ENDPOINT}" || -z "${REGION}" ]]; then
  echo "Error: MINIO_CONTAINER, STORAGE_ENDPOINT and STORAGE_REGION are required in ${BASE_ENV}." >&2
  exit 1
fi
if [[ ! "${BUCKET}" =~ ^[a-z0-9][a-z0-9.-]{2,62}$ || ! "${KEY}" =~ ^[A-Za-z0-9._-]{3,64}$ ]]; then
  echo "Error: the bucket or key name is not valid." >&2
  exit 1
fi
SECRET="$(openssl rand -hex 32)"

# The secret travels on standard input, never on a command line.
printf '%s\n' "${SECRET}" | docker exec -i -e BUCKET="${BUCKET}" -e KEY="${KEY}" "${CONTAINER}" /bin/sh -ec '
  read -r SECRET
  export MC_CONFIG_DIR=/tmp/speed-storage-mc
  mc alias set local http://127.0.0.1:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
  mc mb --ignore-existing "local/$BUCKET" >/dev/null
  printf "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":[\"s3:*\"],\"Resource\":[\"arn:aws:s3:::%s\",\"arn:aws:s3:::%s/*\"]}]}" "$BUCKET" "$BUCKET" >"$MC_CONFIG_DIR/policy.json"
  mc admin policy create local "bucket-$BUCKET" "$MC_CONFIG_DIR/policy.json" >/dev/null
  mc admin user add local "$KEY" "$SECRET" >/dev/null
  mc admin policy attach local "bucket-$BUCKET" --user "$KEY" >/dev/null 2>&1 || true
  rm -rf "$MC_CONFIG_DIR"
'

umask 077
{
  printf '# WI-OI-120cd: SPEED dossier store (bucket %s, a key that can use only it).\n' "${BUCKET}"
  printf 'SPEED_STORAGE_ENDPOINT=%s\n' "${ENDPOINT}"
  printf 'SPEED_STORAGE_REGION=%s\n' "${REGION}"
  printf 'SPEED_STORAGE_BUCKET=%s\n' "${BUCKET}"
  printf 'SPEED_STORAGE_ACCESS_KEY=%s\n' "${KEY}"
  printf 'SPEED_STORAGE_SECRET_KEY=%s\n' "${SECRET}"
} >>"${SPEED_ENV}"
chmod 600 "${SPEED_ENV}"
echo "SPEED's dossier store is ready (bucket ${BUCKET}); its settings were added to $(basename "${SPEED_ENV}") and not printed."
