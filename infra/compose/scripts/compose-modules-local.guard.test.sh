#!/usr/bin/env bash
# WI-OI-120bo: proves that nothing outside the release worktree can act on UAT (compose project
# gigalibs-configuration-local). No Docker: scripts run in throwaway checkouts with a stub `docker` that records any call.
set -euo pipefail
if [[ -n "${GIGALIBS_GUARD_TEST_RUNNING:-}" ]]; then
  echo "Error: guard test re-entered itself." >&2
  exit 1
fi
export GIGALIBS_GUARD_TEST_RUNNING=1

SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(cd "${SCRIPTS_DIR}/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT

failures=0
pass() { echo "PASS: $*"; }
fail() {
  echo "FAIL: $*"
  failures=$((failures + 1))
}

# A checkout copy holding only what the guards read: the scripts and compose.yaml, on the given branch.
make_checkout() {
  local root="$1" branch="$2"
  mkdir -p "${root}/infra/compose/scripts"
  cp "${SCRIPTS_DIR}"/*.sh "${root}/infra/compose/scripts/"
  cp "${COMPOSE_DIR}/compose.yaml" "${root}/infra/compose/compose.yaml"
  git -C "${root}" init -q -b "${branch}"
}
FEATURE="${WORK}/feature"
RELEASE="${WORK}/release"
make_checkout "${FEATURE}" feature/guard-test
make_checkout "${RELEASE}" release/guard-test

mkdir -p "${WORK}/bin"
printf '#!/usr/bin/env bash\ntouch "%s/docker-called"\nexit 97\n' "${WORK}" >"${WORK}/bin/docker"
chmod +x "${WORK}/bin/docker"

guard() {
  local root="$1"
  shift
  env "$@" bash -c "source '${root}/infra/compose/scripts/compose-modules-local-guard-only.sh' && echo \"\${COMPOSE_PROJECT_NAME} \${GIGALIBS_COMPOSE_ENV_SUFFIX}\""
}

# 1. The compose wrapper's project guard.
if guard "${FEATURE}" COMPOSE_PROJECT_NAME=gigalibs-configuration-local >/dev/null 2>&1; then
  fail "feature checkout accepted COMPOSE_PROJECT_NAME=gigalibs-configuration-local"
else
  pass "feature checkout refuses gigalibs-configuration-local"
fi
if guard "${FEATURE}" COMPOSE_PROJECT_NAME=some-other-project >/dev/null 2>&1; then
  fail "feature checkout accepted an arbitrary project"
else
  pass "feature checkout refuses any project other than gigalibs-test"
fi
result="$(guard "${FEATURE}" -u COMPOSE_PROJECT_NAME 2>&1 || true)"
if [[ "${result}" == "gigalibs-test .test" ]]; then
  pass "feature checkout defaults to gigalibs-test with .env.test* files"
else
  fail "feature checkout default was '${result}', expected 'gigalibs-test .test'"
fi
result="$(guard "${FEATURE}" COMPOSE_PROJECT_NAME=gigalibs-test GIGALIBS_COMPOSE_ENV_SUFFIX= 2>&1 || true)"
if [[ "${result}" == "gigalibs-test .test" ]]; then
  pass "feature checkout cannot point gigalibs-test at the UAT .env files"
else
  fail "feature checkout honoured an empty env suffix: '${result}'"
fi
result="$(guard "${RELEASE}" -u COMPOSE_PROJECT_NAME 2>&1 || true)"
if [[ "${result}" == "gigalibs-configuration-local " ]]; then
  pass "release checkout keeps UAT's project from compose.yaml"
else
  fail "release checkout resolved '${result}', expected 'gigalibs-configuration-local '"
fi

# 2. Every UAT-only script refuses outside the release worktree before it calls Docker.
uat_only=()
for script in "${SCRIPTS_DIR}"/*.sh; do
  [[ "$(basename "${script}")" == "$(basename "${BASH_SOURCE[0]}")" ]] && continue
  grep -q '^gigalibs_require_release_worktree "' "${script}" && uat_only+=("$(basename "${script}")")
done
if ((${#uat_only[@]} < 29)); then
  fail "expected at least 29 UAT-only scripts, found ${#uat_only[@]}"
fi
for name in "${uat_only[@]}"; do
  rm -f "${WORK}/docker-called"
  if output="$(cd "${FEATURE}" && PATH="${WORK}/bin:${PATH}" bash "infra/compose/scripts/${name}" /dev/null 2>&1 </dev/null)"; then
    fail "${name} exited 0 in a feature checkout"
  elif [[ -e "${WORK}/docker-called" ]]; then
    fail "${name} called docker before refusing"
  elif [[ "${output}" != *"runs only from the release worktree"* ]]; then
    fail "${name} failed for another reason: ${output%%$'\n'*}"
  fi
done
pass "${#uat_only[@]} UAT-only scripts refuse outside the release worktree without calling docker"
if (cd "${RELEASE}" && bash -c "source infra/compose/scripts/release-worktree.sh && gigalibs_is_release_worktree"); then
  pass "a release/* checkout is recognised as the release worktree"
else
  fail "a release/* checkout was not recognised"
fi

# 3. No new script may act on containers without a guard. Builds remove only their own build containers;
#    backup.sh only reads (pg_dump).
unguarded=()
for script in "${SCRIPTS_DIR}"/*.sh; do
  name="$(basename "${script}")"
  [[ "${name}" == build-*.sh || "${name}" == backup.sh || "${name}" == "$(basename "${BASH_SOURCE[0]}")" ]] && continue
  if grep -qE 'docker (exec|stop|start|restart|kill|pause|rm)\b|docker[ -]compose[^|;&]*\b(up|down|run|stop|start|restart|rm|kill)\b|"\$\{[A-Z_]*COMPOSE[A-Z_]*\[@\]\}" +(up|down|run|stop|start|restart|rm|kill)\b' "${script}" &&
    ! grep -qE '^gigalibs_require_release_worktree "|compose-modules-local(-guard-only)?\.sh' "${script}"; then
    unguarded+=("${name}")
  fi
done
if ((${#unguarded[@]} == 0)); then
  pass "every script that acts on containers is guarded"
else
  fail "unguarded scripts act on containers: ${unguarded[*]}"
fi

if ((failures > 0)); then
  echo "${failures} guard test(s) failed."
  exit 1
fi
echo "All compose guard tests passed."
