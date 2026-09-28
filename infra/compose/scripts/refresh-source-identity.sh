#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${COMPOSE_DIR}/../.." && pwd)"
LOCAL_ENV="${COMPOSE_DIR}/.env"
MODULE_ENV="${COMPOSE_DIR}/.env.modules"
WORKFORCE_ENV="${COMPOSE_DIR}/.env.workforce"
GEOSPATIAL_ENV="${COMPOSE_DIR}/.env.geospatial"

if [[ ! -f "${LOCAL_ENV}" ]]; then
  echo "Error: ${LOCAL_ENV} is required; run generate-credentials.sh first." >&2
  exit 1
fi

SOURCE_REVISION="$(git -C "${REPO_ROOT}" rev-parse HEAD)"
SOURCE_STATE_SHA256="$(node "${REPO_ROOT}/scripts/compute-source-state-sha256.mjs")"
TAG="${SOURCE_REVISION:0:12}-${SOURCE_STATE_SHA256:0:12}"
RELEASE_ID="local-$(date -u +'%Y%m%dT%H%M%SZ')-${TAG}"
TEMP_ENV="$(mktemp "${COMPOSE_DIR}/.env-refresh.XXXXXX")"
trap 'rm -f "${TEMP_ENV}"' EXIT

awk \
  -v revision="${SOURCE_REVISION}" \
  -v state="${SOURCE_STATE_SHA256}" \
  -v release="${RELEASE_ID}" \
  -v tag="${TAG}" '
    /^RELEASE_ID=/ { print "RELEASE_ID=" release; next }
    /^SOURCE_REVISION=/ { print "SOURCE_REVISION=" revision; next }
    /^SOURCE_STATE_SHA256=/ { print "SOURCE_STATE_SHA256=" state; next }
    /^MIGRATIONS_IMAGE=/ { print "MIGRATIONS_IMAGE=gigalibs/control-plane-migrations:" tag; next }
    /^API_IMAGE=/ { print "API_IMAGE=gigalibs/playground-api:" tag; next }
    /^WEB_IMAGE=/ { print "WEB_IMAGE=gigalibs/workflow-platform:" tag; next }
    { print }
  ' "${LOCAL_ENV}" >"${TEMP_ENV}"

chmod 600 "${TEMP_ENV}"
mv "${TEMP_ENV}" "${LOCAL_ENV}"
trap - EXIT
echo "Updated local source identity to ${SOURCE_REVISION} / ${SOURCE_STATE_SHA256}; secrets were preserved and not printed."

if [[ -f "${MODULE_ENV}" ]]; then
  MODULE_TEMP_ENV="$(mktemp "${COMPOSE_DIR}/.env-modules-refresh.XXXXXX")"
  awk \
    -v tag="${TAG}" '
      /^CONNECTOR_HUB_IMAGE=/ { print "CONNECTOR_HUB_IMAGE=gigalibs/connector-hub-api:" tag; next }
      /^ANALYTICS_IMAGE=/ { print "ANALYTICS_IMAGE=gigalibs/analytics-api:" tag; next }
      /^CMMS_IMAGE=/ { print "CMMS_IMAGE=gigalibs/cmms-api:" tag; next }
      { print }
    ' "${MODULE_ENV}" >"${MODULE_TEMP_ENV}"
  chmod 600 "${MODULE_TEMP_ENV}"
  mv "${MODULE_TEMP_ENV}" "${MODULE_ENV}"
  echo "Updated WI-OI-059 module image identities; module secrets were preserved and not printed."
fi

if [[ -f "${WORKFORCE_ENV}" ]]; then
  WORKFORCE_TEMP_ENV="$(mktemp "${COMPOSE_DIR}/.env-workforce-refresh.XXXXXX")"
  awk \
    -v tag="${TAG}" '
      /^WORKFORCE_IMAGE=/ { print "WORKFORCE_IMAGE=gigalibs/workforce-api:" tag; next }
      { print }
    ' "${WORKFORCE_ENV}" >"${WORKFORCE_TEMP_ENV}"
  chmod 600 "${WORKFORCE_TEMP_ENV}"
  mv "${WORKFORCE_TEMP_ENV}" "${WORKFORCE_ENV}"
  echo "Updated WI-OI-061 Workforce image identity; Workforce secrets were preserved and not printed."
fi

if [[ -f "${GEOSPATIAL_ENV}" ]]; then
  GEOSPATIAL_TEMP_ENV="$(mktemp "${COMPOSE_DIR}/.env-geospatial-refresh.XXXXXX")"
  awk \
    -v tag="${TAG}" '
      /^GEOSPATIAL_IMAGE=/ { print "GEOSPATIAL_IMAGE=gigalibs/geospatial-api:" tag; next }
      { print }
    ' "${GEOSPATIAL_ENV}" >"${GEOSPATIAL_TEMP_ENV}"
  chmod 600 "${GEOSPATIAL_TEMP_ENV}"
  mv "${GEOSPATIAL_TEMP_ENV}" "${GEOSPATIAL_ENV}"
  echo "Updated WI-OI-063 Geospatial image identity; Geospatial secrets were preserved and not printed."
fi

# WI-OI-085b: each generated module keeps its image identity in .env.module.<name>.
for GENERATED_ENV in "${COMPOSE_DIR}"/.env.module.*; do
  [[ -f "${GENERATED_ENV}" ]] || continue
  GENERATED_TEMP_ENV="$(mktemp "${COMPOSE_DIR}/.env-module-refresh.XXXXXX")"
  awk \
    -v tag="${TAG}" '
      match($0, /^[A-Z][A-Z0-9_]*_IMAGE=gigalibs\/[a-z0-9-]+:/) { print substr($0, 1, RLENGTH) tag; next }
      { print }
    ' "${GENERATED_ENV}" >"${GENERATED_TEMP_ENV}"
  chmod 600 "${GENERATED_TEMP_ENV}"
  mv "${GENERATED_TEMP_ENV}" "${GENERATED_ENV}"
  echo "Updated the generated module image identity in $(basename "${GENERATED_ENV}"); its secrets were preserved and not printed."
done
