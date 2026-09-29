#!/usr/bin/env bash
# generate-generated-module-credentials.sh (WI-OI-085b)
# Creates infra/compose/.env.module.<module> for one generated module: its image identity, a least-privilege runtime
# database role URL, and the Ed25519 key pair the web BFF signs its platform contexts with. It never replaces an
# existing file, so secrets survive; refresh-source-identity.sh keeps the image identity current. Values are never
# printed.
#   generate-generated-module-credentials.sh <module>
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
BASE_ENV="${COMPOSE_DIR}/.env"
INDEX="${COMPOSE_DIR}/generated/modules.json"

MODULE="${1:-}"
if [[ ! "${MODULE}" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ || "${MODULE}" == host || "${MODULE}" == module-host ]]; then
  echo "Usage: $(basename "$0") <module>" >&2
  exit 2
fi
TARGET_ENV="${COMPOSE_DIR}/.env.module.${MODULE}"
if [[ -e "${TARGET_ENV}" ]]; then
  echo "Error: ${TARGET_ENV} already exists; it is never replaced." >&2
  exit 1
fi
for required_file in "${BASE_ENV}" "${INDEX}"; do
  if [[ ! -f "${required_file}" ]]; then
    echo "Error: ${required_file} is required." >&2
    exit 1
  fi
done

module_value() {
  node -e '
    const index = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
    const entry = index[process.argv[2]];
    if (!entry) { console.error(`Error: ${process.argv[2]} is not a generated module; run pnpm modules:catalog.`); process.exit(1); }
    process.stdout.write(String(entry[process.argv[3]]));
  ' "${INDEX}" "${MODULE}" "$1"
}
read_value() {
  awk -v key="$1" 'index($0, key "=") == 1 { print substr($0, length(key) + 2); exit }' "${BASE_ENV}"
}

PREFIX="$(module_value prefix)"
SCHEMA="$(module_value schema)"
IMAGE="$(module_value image)"
HOSTING="$(module_value hosting)"
SOURCE_REVISION="$(read_value SOURCE_REVISION)"
SOURCE_STATE_SHA256="$(read_value SOURCE_STATE_SHA256)"
DATABASE_URL="$(read_value DATABASE_URL)"
if [[ -z "${SOURCE_REVISION}" || -z "${SOURCE_STATE_SHA256}" || -z "${DATABASE_URL}" ]]; then
  echo "Error: SOURCE_REVISION, SOURCE_STATE_SHA256 and DATABASE_URL are required in ${BASE_ENV}." >&2
  exit 1
fi

KEY_DIR="$(mktemp -d)"
TEMP_ENV="$(mktemp "${COMPOSE_DIR}/.env-module-new.XXXXXX")"
trap 'rm -rf "${KEY_DIR}" "${TEMP_ENV}"' EXIT
chmod 600 "${TEMP_ENV}"
openssl genpkey -algorithm Ed25519 -out "${KEY_DIR}/private.pem" >/dev/null 2>&1
openssl pkey -in "${KEY_DIR}/private.pem" -pubout -out "${KEY_DIR}/public.pem" >/dev/null 2>&1

RUNTIME_URL="$(
  SOURCE_DATABASE_URL="${DATABASE_URL}" RUNTIME_USERNAME="${SCHEMA}_runtime" RUNTIME_PASSWORD="$(openssl rand -hex 32)" \
    node -e '
      const url = new URL(process.env.SOURCE_DATABASE_URL);
      url.username = process.env.RUNTIME_USERNAME;
      url.password = process.env.RUNTIME_PASSWORD;
      process.stdout.write(url.toString());
    '
)"
{
  printf '# Generated module %s (WI-OI-085b): image identity, runtime role and platform-context key pair.\n' "${MODULE}"
  # A hosted module runs in the module host image (.env.module.host); only a service module has its own image.
  if [[ "${HOSTING}" == service ]]; then
    printf '%s_IMAGE=%s:%s-%s\n' "${PREFIX}" "${IMAGE}" "${SOURCE_REVISION:0:12}" "${SOURCE_STATE_SHA256:0:12}"
  fi
  printf '%s_DATABASE_URL=%s\n' "${PREFIX}" "${RUNTIME_URL}"
  printf '%s_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64=%s\n' "${PREFIX}" \
    "$(openssl pkey -in "${KEY_DIR}/private.pem" -outform DER | base64 | tr -d '\n')"
  printf '%s_PLATFORM_CONTEXT_PUBLIC_KEY_BASE64=%s\n' "${PREFIX}" \
    "$(openssl pkey -pubin -in "${KEY_DIR}/public.pem" -outform DER | base64 | tr -d '\n')"
} >"${TEMP_ENV}"
mv "${TEMP_ENV}" "${TARGET_ENV}"
trap 'rm -rf "${KEY_DIR}"' EXIT
HOST_ENV="${COMPOSE_DIR}/.env.module.host"
if [[ "${HOSTING}" == host && ! -e "${HOST_ENV}" ]]; then
  ( umask 077
    printf '# The shared module host (WI-OI-085e): its image identity. refresh-source-identity.sh keeps it current.\n' >"${HOST_ENV}"
    printf 'MODULE_HOST_IMAGE=gigalibs/module-host:%s-%s\n' "${SOURCE_REVISION:0:12}" "${SOURCE_STATE_SHA256:0:12}" >>"${HOST_ENV}" )
  echo "Created ${HOST_ENV} for the module host."
fi
echo "Created ${TARGET_ENV} for ${MODULE} (image identity, runtime role ${SCHEMA}_runtime, key pair); values were not printed."
