# shellcheck shell=bash
# Sources e2e/uat.env (or legacy e2e/.env.uat) if present. Does not print secrets.
# GIGALIBS_E2E_ENV_FILE names one file instead (for example test.env for the isolated gigalibs-test stack);
# that file must exist, so a missing test-stack file never falls back to UAT.
set -a
_lue_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -n "${GIGALIBS_E2E_ENV_FILE:-}" ]]; then
  if [[ ! -f "$_lue_dir/${GIGALIBS_E2E_ENV_FILE}" ]]; then
    set +a
    echo "Error: e2e/${GIGALIBS_E2E_ENV_FILE} is missing (test stack: run infra/compose/scripts/generate-test-stack-credentials.sh)." >&2
    unset _lue_dir
    return 1 2>/dev/null || exit 1
  fi
  _lue_candidates=("$_lue_dir/${GIGALIBS_E2E_ENV_FILE}")
else
  _lue_candidates=("$_lue_dir/uat.env" "$_lue_dir/.env.uat")
fi
for _lue_f in "${_lue_candidates[@]}"; do
  if [ -f "$_lue_f" ]; then
    # shellcheck disable=SC1090
    . "$_lue_f"
    break
  fi
done
unset _lue_f _lue_dir _lue_candidates
set +a
export PLAYWRIGHT_TEST_BASE_URL="${PLAYWRIGHT_TEST_BASE_URL:-http://127.0.0.1:5180}"

# Minimal P2P/O2C (pnpm test:minimal-p2p-o2c) runs on the isolated test stack with e2e/test.env; it writes data
# and refuses UAT unless GIGALIBS_ALLOW_UAT_WRITE_E2E=1 (owner approval).
