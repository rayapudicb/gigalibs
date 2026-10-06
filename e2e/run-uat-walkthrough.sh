#!/usr/bin/env bash
# WI-OI-120 (U28a): the UAT walk-through, run by the owner on this Mac against http://127.0.0.1:5180.
#   1. enters the UAT starter data on the screens, in a browser you can watch (Catalogue, then Inventory);
#   2. opens every screen as the tenant administrator and records what each one does;
#   3. opens the board: e2e/test-results/uat-screen-inventory/index.html (keep it open while testing by hand).
#
# Usage:  bash e2e/run-uat-walkthrough.sh              # data, then every screen
#         bash e2e/run-uat-walkthrough.sh --screens    # every screen only (creates nothing)
#         bash e2e/run-uat-walkthrough.sh --tour       # guided tour of Automate & Run and Intelligence, visible
#         bash e2e/run-uat-walkthrough.sh --approvals  # maker-checker with the second (approver) login
#         bash e2e/run-uat-walkthrough.sh --ledger     # general ledger: a book, a month of journals, the reports
#         bash e2e/run-uat-walkthrough.sh --all        # data, approvals, ledger, Add new, modules, inventory flow, screens
# The login is asked for here and lives only in this shell: it is never written to a file or printed.
# E2E_UAT_TENANT picks the tenant when the login has several (default "GigaLibs Global Enterprise").
set -euo pipefail
cd "$(dirname "$0")"

BASE="${PLAYWRIGHT_TEST_BASE_URL:-http://127.0.0.1:5180}"
# One sign-in check before anything runs, so a mistyped login costs one attempt, not one per step. Five failed
# sign-ins within 15 minutes lock the account for 15 minutes (WI-OI-120e).
for attempt in 1 2; do
  if [ -z "${E2E_UAT_ADMIN_EMAIL:-}" ]; then read -r -p "UAT tenant administrator email: " E2E_UAT_ADMIN_EMAIL; fi
  if [ -z "${E2E_UAT_ADMIN_PASSWORD:-}" ]; then read -r -s -p "Password (not shown): " E2E_UAT_ADMIN_PASSWORD; echo; fi
  E2E_UAT_ADMIN_EMAIL="$(printf '%s' "$E2E_UAT_ADMIN_EMAIL" | tr -d '[:space:]')"
  export E2E_UAT_ADMIN_EMAIL E2E_UAT_ADMIN_PASSWORD
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
    *) echo "Sign-in refused: ${answer#* }"
       [ "$attempt" = 2 ] && { echo "Check the login by signing in at $BASE/login, then run again."; exit 1; }
       unset E2E_UAT_ADMIN_EMAIL E2E_UAT_ADMIN_PASSWORD ;;
  esac
done

mode="${1:-}"
if [ "$mode" = "--approvals" ] || [ "$mode" = "--ledger" ] || [ "$mode" = "--all" ]; then
  if [ -z "${E2E_UAT_APPROVER_EMAIL:-}" ]; then read -r -p "UAT approver email: " E2E_UAT_APPROVER_EMAIL; fi
  if [ -z "${E2E_UAT_APPROVER_PASSWORD:-}" ]; then read -r -s -p "Approver password (not shown): " E2E_UAT_APPROVER_PASSWORD; echo; fi
  export E2E_UAT_APPROVER_EMAIL E2E_UAT_APPROVER_PASSWORD
fi

echo "Checking the Playwright browser (downloads once, about 150 MB)…"
npx playwright install chromium >/dev/null

status=0
run() { npx playwright test "$@" --workers=1 --reporter=list || status=1; }
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
  --screens) ;;
  --all)
    echo "== Starter data";            run specs/uat-starter-data.spec.ts
    echo "== Maker-checker approvals"; run specs/uat-approvals.spec.ts
    echo "== General ledger";          run specs/uat-general-ledger.spec.ts
    echo "== Add new from a picker";   run specs/uat-add-new.spec.ts
    echo "== Every module opens";      run specs/uat-preview-modules.spec.ts
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
[ -f "$board" ] && open "$board"
[ "$status" = 0 ] || echo "Some steps failed: the messages above say where. Paste them to Claude."
exit "$status"
