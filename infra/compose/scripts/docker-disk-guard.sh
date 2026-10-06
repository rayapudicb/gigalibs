#!/usr/bin/env bash
# docker-disk-guard.sh (WI-OI-101)
# Keeps local image builds from filling the host disk.
#
#   docker-disk-guard.sh check            refuse to build unless the disk has room; cleans up first when short
#   docker-disk-guard.sh prune            remove superseded gigalibs/* images and trim the build cache
#   docker-disk-guard.sh prune --dry-run  list what prune would remove
#
# Kept: every image the local .env files name (the release being built), every image a container (running or
# stopped) uses, the newest GIGALIBS_KEEP_IMAGE_VERSIONS tags of
# each gigalibs/* repository and build series (default 2: current and rollback; full and solution builds count
# separately), the pinned base images, and every image outside gigalibs/*. Volumes are never touched.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${COMPOSE_DIR}/../.." && pwd)"
PROFILE="${REPO_ROOT}/config/deployment-profiles/configuration-local-development-v1.json"
MIN_FREE_GB="${GIGALIBS_MIN_FREE_GB:-60}"
KEEP_VERSIONS="${GIGALIBS_KEEP_IMAGE_VERSIONS:-2}"
BUILD_CACHE_MAX="${GIGALIBS_BUILD_CACHE_MAX:-20GB}"
DRY_RUN=false

free_gb() {
  df -Pk "${REPO_ROOT}" | awk 'NR == 2 { printf "%d", $4 / 1048576 }'
}

container_image_ids() {
  local container_ids
  container_ids="$(docker ps -aq)"
  if [[ -n "${container_ids}" ]]; then
    # shellcheck disable=SC2086
    docker inspect --format '{{.Image}}' ${container_ids} | sort -u
  fi
}

# WI-OI-120n: the images the current release names in the local .env files (the release being built or about to be
# deployed). They are always kept: an unchanged image is reused with its old creation time, so ordering by creation
# time alone once removed a release's freshly tagged migrations image before it was deployed.
release_images() {
  local file
  for file in "${COMPOSE_DIR}"/.env "${COMPOSE_DIR}"/.env.*; do
    [[ -f "${file}" && "${file}" != *.example ]] || continue
    grep -hE '^[A-Z0-9_]+_IMAGE=gigalibs/' "${file}" | cut -d= -f2- || true
  done | sort -u
}

pinned_base_images() {
  node -e \
    'const fs=require("node:fs"); const policy=JSON.parse(fs.readFileSync(process.argv[1], "utf8")).artifactPolicy ?? {}; for (const key of ["baseImage", "finalRuntimeImage"]) if (policy[key]) console.log(policy[key]);' \
    "${PROFILE}"
  { grep -hoE '^# syntax=[^[:space:]]+' "${COMPOSE_DIR}"/docker/Dockerfile* 2>/dev/null || true; } |
    sed 's/^# syntax=//' | sort -u
}

prune() {
  local in_use repo created tag id ref versions removed=0 kept_refs="" release
  in_use="$(container_image_ids)"
  release="$(release_images)"

  for repo in $(docker images --format '{{.Repository}}' | grep '^gigalibs/' | sort -u); do
    local series current_series="-"
    versions=0
    # Each build series keeps its own versions: `<revision>-<state>` tags are the full build, and a trailing
    # `-<solution>` marks a solution build (WI-OI-083d); any other tag is a series of its own.
    while IFS='|' read -r series created tag id; do
      if [[ "${series}" != "${current_series}" ]]; then
        current_series="${series}"
        versions=0
      fi
      if [[ "${tag}" == "<none>" ]]; then
        ref="${id}"
      else
        ref="${repo}:${tag}"
        if grep -qxF "${ref}" <<<"${release}"; then
          kept_refs="${kept_refs}${ref}"$'\n'
          continue
        fi
        versions=$((versions + 1))
        if ((versions <= KEEP_VERSIONS)); then
          kept_refs="${kept_refs}${ref}"$'\n'
          continue
        fi
      fi
      if grep -qx "${id}" <<<"${in_use}"; then
        continue
      fi
      if [[ "${DRY_RUN}" == true ]]; then
        echo "would remove ${ref}"
      elif docker rmi "${ref}" >/dev/null; then
        echo "removed ${ref}"
      else
        continue
      fi
      removed=$((removed + 1))
    done < <(docker images --no-trunc --format '{{.CreatedAt}}|{{.Tag}}|{{.ID}}' "${repo}" |
      perl -F'\|' -lane 'print(($F[1] =~ /^[0-9a-f]{12}-[0-9a-f]{12}(?:-(.+))?$/ ? ($1 // "") : "~$F[1]") . "|$_")' |
      sort -t'|' -k1,1 -k2,2r)
  done

  if [[ "${DRY_RUN}" == true ]]; then
    echo "Dry run: ${removed} superseded gigalibs image(s) would be removed; the build cache would be trimmed to ${BUILD_CACHE_MAX}."
    return 0
  fi
  echo "Removed ${removed} superseded gigalibs image(s)."

  docker buildx prune -f --max-used-space "${BUILD_CACHE_MAX}" | tail -1
  echo "Build cache trimmed to at most ${BUILD_CACHE_MAX}."

  # A build-cache prune should never remove tagged images; say so loudly if it did.
  while IFS= read -r ref; do
    [[ -z "${ref}" ]] && continue
    if ! docker image inspect "${ref}" >/dev/null 2>&1; then
      echo "Warning: kept image ${ref} is missing after the build-cache trim; rebuild or re-pull it." >&2
    fi
  done <<<"${kept_refs}$(pinned_base_images)"
}

check() {
  local free attempt
  free="$(free_gb)"
  if ((free >= MIN_FREE_GB)); then
    echo "Disk guard: ${free} GB free (minimum ${MIN_FREE_GB} GB)."
    return 0
  fi
  echo "Disk guard: only ${free} GB free (minimum ${MIN_FREE_GB} GB); cleaning up before the build." >&2
  prune
  # Docker Desktop hands freed space back to the host gradually.
  for attempt in 1 2 3 4 5 6; do
    free="$(free_gb)"
    ((free >= MIN_FREE_GB)) && break
    sleep 10
  done
  if ((free < MIN_FREE_GB)); then
    echo "Error: only ${free} GB free after cleanup; an image build needs at least ${MIN_FREE_GB} GB." >&2
    echo "Free disk space outside Docker, or set GIGALIBS_MIN_FREE_GB lower if you accept the risk." >&2
    exit 1
  fi
  echo "Disk guard: ${free} GB free after cleanup."
}

case "${1:-}" in
  check)
    check
    ;;
  prune)
    [[ "${2:-}" == "--dry-run" ]] && DRY_RUN=true
    prune
    ;;
  *)
    echo "Usage: $(basename "$0") check | prune [--dry-run]" >&2
    exit 2
    ;;
esac
