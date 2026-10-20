# shellcheck shell=bash
# WI-OI-120bo: only a checkout on a release/* branch may act on UAT (compose project gigalibs-configuration-local).
# Source this file, then call gigalibs_require_release_worktree (UAT-only scripts) or gigalibs_is_release_worktree.
# The check reads the branch of the checkout this file lives in; there is no override.

if [[ -n "${BASH_VERSION:-}" && -n "${BASH_SOURCE[0]:-}" ]]; then
  _gigalibs_release_lib_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
elif [[ -n "${ZSH_VERSION:-}" ]]; then
  _gigalibs_release_lib_dir="$(cd "$(dirname "${(%):-%x}")" && pwd)"
else
  _gigalibs_release_lib_dir="$(cd "$(dirname "$0")" && pwd)"
fi
GIGALIBS_CHECKOUT_ROOT="$(cd "${_gigalibs_release_lib_dir}/../../.." && pwd -P)"
unset _gigalibs_release_lib_dir

gigalibs_is_release_worktree() {
  local branch
  branch="$(git -C "${GIGALIBS_CHECKOUT_ROOT}" symbolic-ref --quiet --short HEAD 2>/dev/null || true)"
  [[ "${branch}" == release/* ]]
}

gigalibs_require_release_worktree() {
  if ! gigalibs_is_release_worktree; then
    echo "Error: refusing to run ${1:-this script}: it acts on UAT (compose project gigalibs-configuration-local)" >&2
    echo "and runs only from the release worktree (a checkout on a release/* branch)." >&2
    exit 1
  fi
}
