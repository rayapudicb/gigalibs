# shellcheck shell=bash
# WI-OI-120bo: project guard for compose-modules-local.sh. Sourced; sets COMPOSE_PROJECT_NAME and
# GIGALIBS_COMPOSE_ENV_SUFFIX. Outside the release worktree only the isolated test project is allowed.
set -euo pipefail

if [[ -n "${BASH_VERSION:-}" && -n "${BASH_SOURCE[0]:-}" ]]; then
  _compose_local_script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
elif [[ -n "${ZSH_VERSION:-}" ]]; then
  _compose_local_script_dir="$(cd "$(dirname "${(%):-%x}")" && pwd)"
else
  _compose_local_script_dir="$(cd "$(dirname "$0")" && pwd)"
fi
SCRIPT_DIR="${_compose_local_script_dir}"
COMPOSE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
# shellcheck source=release-worktree.sh
source "${SCRIPT_DIR}/release-worktree.sh"

UAT_COMPOSE_PROJECT='gigalibs-configuration-local'
TEST_COMPOSE_PROJECT='gigalibs-test'

compose_modules_local_resolve_project() {
  if gigalibs_is_release_worktree; then
    COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-$(awk '/^name:/ { print $2; exit }' "${COMPOSE_DIR}/compose.yaml")}"
    GIGALIBS_COMPOSE_ENV_SUFFIX="${GIGALIBS_COMPOSE_ENV_SUFFIX:-}"
    return 0
  fi
  COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-${TEST_COMPOSE_PROJECT}}"
  if [[ "${COMPOSE_PROJECT_NAME}" == "${UAT_COMPOSE_PROJECT}" ]]; then
    echo "Error: refusing Docker Compose project ${UAT_COMPOSE_PROJECT} (UAT) outside the release worktree." >&2
    exit 1
  fi
  if [[ "${COMPOSE_PROJECT_NAME}" != "${TEST_COMPOSE_PROJECT}" ]]; then
    echo "Error: outside the release worktree only COMPOSE_PROJECT_NAME=${TEST_COMPOSE_PROJECT} is allowed." >&2
    exit 1
  fi
  GIGALIBS_COMPOSE_ENV_SUFFIX='.test'
}

compose_modules_local_resolve_project
export COMPOSE_PROJECT_NAME GIGALIBS_COMPOSE_ENV_SUFFIX
