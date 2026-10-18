#!/usr/bin/env bash
# WI-OI-120 (U28a): the UAT walk-through, run by the owner on this Mac against http://127.0.0.1:5180.
#   1. enters the UAT starter data on the screens, in a browser you can watch (Catalogue, then Inventory);
#   2. opens every screen as the tenant administrator and records what each one does;
#   3. opens the board: e2e/test-results/uat-screen-inventory/index.html (keep it open while testing by hand).
#
# Non-interactive: copy e2e/uat.env.example → e2e/uat.env (gitignored), or export vars yourself.
#   pnpm e2e:uat:inventory
#   pnpm e2e:uat:journey
#
# Usage:  bash e2e/run-uat-walkthrough.sh              # data, then every screen
#         bash e2e/run-uat-walkthrough.sh --screens    # every screen only (creates nothing)
#         bash e2e/run-uat-walkthrough.sh --inventory  # F0.5 inventory business flow only
#         bash e2e/run-uat-walkthrough.sh --tour       # guided tour of Automate & Run and Intelligence, visible
#         bash e2e/run-uat-walkthrough.sh --approvals  # maker-checker with the second (approver) login
#         bash e2e/run-uat-walkthrough.sh --ledger     # general ledger: a book, a month of journals, the reports
#         bash e2e/run-uat-walkthrough.sh --journey    # a new customer from sign-up to maintenance work, as five people
#         bash e2e/run-uat-walkthrough.sh --all        # data, approvals, ledger, Add new, modules, inventory flow, screens
# E2E_UAT_TENANT picks the tenant when the login has several (default "GigaLibs Global Enterprise").
set -euo pipefail
_e2e_dir="$(cd "$(dirname "$0")" && pwd)"
cd "$_e2e_dir"
# shellcheck source=load-uat-env.sh
source "$_e2e_dir/load-uat-env.sh"
# shellcheck source=ensure-playwright-ready.sh
source "$_e2e_dir/ensure-playwright-ready.sh"

BASE="${PLAYWRIGHT_TEST_BASE_URL:-http://127.0.0.1:5180}"
NONINTERACTIVE="${GIGALIBS_E2E_NONINTERACTIVE:-0}"

require_var() {
  local name="$1" hint="$2"
  if [ -n "${!name:-}" ]; then return 0; fi
  if [ "$NONINTERACTIVE" = 1 ]; then
    echo "Missing $name. $hint"
    echo "Create e2e/uat.env from e2e/uat.env.example (gitignored) or export the variable, then rerun."
    exit 1
  fi
  return 1
}

prompt_admin_login() {
  if require_var E2E_UAT_ADMIN_EMAIL "UAT tenant administrator email."; then :; else read -r -p "UAT tenant administrator email: " E2E_UAT_ADMIN_EMAIL; fi
  if require_var E2E_UAT_ADMIN_PASSWORD "UAT tenant administrator password."; then :; else read -r -s -p "Password (not shown): " E2E_UAT_ADMIN_PASSWORD; echo; fi
  E2E_UAT_ADMIN_EMAIL="$(printf '%s' "$E2E_UAT_ADMIN_EMAIL" | tr -d '[:space:]')"
  export E2E_UAT_ADMIN_EMAIL E2E_UAT_ADMIN_PASSWORD
}

# One sign-in check before anything runs, so a mistyped login costs one attempt, not one per step. Five failed
# sign-ins within 15 minutes lock the account for 15 minutes (WI-OI-120e).
for attempt in 1 2; do
  prompt_admin_login
  answer="$(node -e '
    fetch(process.argv[1] + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: process.argv[1] },
      body: JSON.stringify({ email: process.env.E2E_UAT_ADMIN_EMAIL, password: process.env.E2E_UAT_ADMIN_PASSWORD }),
    }).then(async (r) => console.log(r.status, (await r.text()).slice(0, 160))).catch((e) => console.log(0, e.message));
  ' "$BASE")"
  case "$answer" in
    200*) echo "Signed in as $E2E_UAT_ADMIN_EMAIL."; break ;;
    429*) echo "This account is locked after too many failed sign-ins; wait 15 minutes and run again."; exit 1 ;;
    *)
      echo "Sign-in refused: ${answer#* }"
      if [ "$attempt" = 2 ]; then
        echo "Check the login by signing in at $BASE/login, then run again."
        exit 1
      fi
      unset E2E_UAT_ADMIN_EMAIL E2E_UAT_ADMIN_PASSWORD
      ;;
  esac
done

mode="${1:-}"
if [ "$mode" = "--approvals" ] || [ "$mode" = "--ledger" ] || [ "$mode" = "--all" ]; then
  if require_var E2E_UAT_APPROVER_EMAIL "UAT approver email."; then :; else read -r -p "UAT approver email: " E2E_UAT_APPROVER_EMAIL; fi
  if require_var E2E_UAT_APPROVER_PASSWORD "UAT approver password."; then :; else read -r -s -p "Approver password (not shown): " E2E_UAT_APPROVER_PASSWORD; echo; fi
  export E2E_UAT_APPROVER_EMAIL E2E_UAT_APPROVER_PASSWORD
fi

status=0
run() { pnpm exec playwright test "$@" --workers=1 --reporter=list || status=1; }
case "$mode" in
  --tour)
    UAT_SLOWMO="${UAT_SLOWMO:-250}" run specs/uat-tour-automate-intelligence.spec.ts --headed
    exit "$status" ;;
  --approvals)
    UAT_SLOWMO="${UAT_SLOWMO:-150}" run specs/uat-approvals.spec.ts --headed
    exit "$status" ;;
  --ledger)
    run specs/uat-general-ledger.spec.ts
    exit "$status" ;;
  --inventory)
    run specs/inventory-business-flow.spec.ts
    exit "$status" ;;
  --journey)
    if require_var E2E_JOURNEY_PASSWORD "Password for journey sign-ups (12+ characters)."; then :; else
      read -r -s -p "Password for the journey's new sign-ups (12+ characters, not shown): " E2E_JOURNEY_PASSWORD
      echo
    fi
    export E2E_JOURNEY_PASSWORD
    run specs/journey-tenant-to-value.spec.ts
    board="$(pwd)/test-results/journey/index.html"
    [ -f "$board" ] && { echo "Journey board: $board"; [ "$NONINTERACTIVE" != 1 ] && open "$board"; }
    exit "$status" ;;
  --screens) ;;
  --all)
    echo "== Starter data"; run specs/uat-starter-data.spec.ts
    echo "== Maker-checker approvals"; run specs/uat-approvals.spec.ts
    echo "== General ledger"; run specs/uat-general-ledger.spec.ts
    echo "== Add new from a picker"; run specs/uat-add-new.spec.ts
    echo "== Every module opens"; run specs/uat-preview-modules.spec.ts
    echo "== Inventory business flow"; run specs/inventory-business-flow.spec.ts ;;
  *)
    echo "== Starter data, entered on the screens (watch the browser)"
    UAT_SLOWMO="${UAT_SLOWMO:-150}" run specs/uat-starter-data.spec.ts --headed ;;
esac
echo "== Every screen"
run specs/uat-screen-inventory.spec.ts

board="$(pwd)/test-results/uat-screen-inventory/index.html"
echo
echo "Board: $board"
[ -f "$board" ] && [ "$NONINTERACTIVE" != 1 ] && open "$board"
[ "$status" = 0 ] || echo "Some steps failed: the messages above say where. Paste them to Claude."
exit "$status"
