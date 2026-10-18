# shellcheck shell=bash
# Sources e2e/uat.env (or legacy e2e/.env.uat) if present. Does not print secrets.
set -a
_lue_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
for _lue_f in "$_lue_dir/uat.env" "$_lue_dir/.env.uat"; do
  if [ -f "$_lue_f" ]; then
    # shellcheck disable=SC1090
    . "$_lue_f"
    break
  fi
done
unset _lue_f _lue_dir
set +a
export PLAYWRIGHT_TEST_BASE_URL="${PLAYWRIGHT_TEST_BASE_URL:-http://127.0.0.1:5180}"
