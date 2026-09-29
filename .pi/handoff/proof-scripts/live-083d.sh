#!/usr/bin/env bash
# WI-OI-083d live proof. Usage: live-083d.sh <full web image> <solution web image> <log-file>
# 1. Full web on 5190: web paths + Playwright (live-web.sh, kept running for the control checks).
# 2. Solution web on 5191 with the same hardening and no CMMS settings; HTTP proof against the full web as control.
# 3. Bundle scan of both images for CMMS screens and routes.
# 4. Cleanup: containers, temporary secret files, verification sessions.
set -uo pipefail
FULL="${1:?full image}"; SOLUTION_IMAGE="${2:?solution image}"; LOG="${3:?log}"
HERE="$(cd "$(dirname "$0")" && pwd)"; SP="${PROOF_WORK_DIR:?Set PROOF_WORK_DIR to an empty directory outside the repository}"; mkdir -p "$SP"; C="$HOME/dev/gigalibs/infra/compose"
FULL_ENV="$SP/e2e-web.env"; SOLUTION_ENV="$SP/solution-web.env"; CREDS="$SP/e2e-creds.json"
log() { echo "=== $* $(date +%H:%M:%S)" >> "$LOG"; }
cleanup() {
  docker rm -f gigalibs-e2e-web gigalibs-solution-web >/dev/null 2>&1
  rm -f "$FULL_ENV" "$SOLUTION_ENV" "$CREDS" "$HOME/dev/gigalibs/e2e/test-results/local-chrome.config.ts"
  rm -rf "$SP/bundle-scan"
  docker exec gigalibs-postgres psql -U gigalibs -d gigalibs -tAc \
    "UPDATE sessions SET status='REVOKED', \"revokedAt\"=now() WHERE status='ACTIVE' AND \"userId\" IN (SELECT id FROM users WHERE email LIKE 'gigaops-web.%@gigalibs.invalid')" \
    >> "$LOG" 2>&1 && log "sessions revoked"
}
trap cleanup EXIT

KEEP_RUNNING=1 bash "$HERE/live-web.sh" "$FULL" "$SP/live-full.log"; status=$?
cat "$SP/live-full.log" >> "$LOG"; rm -f "$SP/live-full.log"
[ $status = 0 ] || { log "FAIL full web"; exit 1; }

( umask 077; grep -vE '^CMMS_' "$FULL_ENV" > "$SOLUTION_ENV" )
docker run -d --name gigalibs-solution-web --network gigalibs-configuration-local -p 127.0.0.1:5191:5180 \
  --init --read-only --tmpfs /tmp:rw,noexec,nosuid,size=64m --tmpfs /app/.next/cache:rw,noexec,nosuid,size=128m \
  --security-opt no-new-privileges:true --cap-drop ALL --env-file "$SOLUTION_ENV" "$SOLUTION_IMAGE" >> "$LOG" 2>&1 || { log "FAIL docker run"; exit 1; }
for i in $(seq 1 60); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 http://127.0.0.1:5191/api/health/ready)" = 200 ] && break
  sleep 2
done
[ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 http://127.0.0.1:5191/api/health/ready)" = 200 ] || { log "FAIL solution web not ready"; docker logs gigalibs-solution-web 2>&1 | tail -20 >> "$LOG"; exit 1; }
log "solution web ready on 5191 without CMMS settings ($(grep -c '^CMMS_' "$FULL_ENV") removed)"

log "HTTP proof START"
if node "$HERE/verify-solution-web.mjs" "$CREDS" http://127.0.0.1:5191 http://127.0.0.1:5190 >> "$LOG" 2>&1; then log "HTTP proof PASS"; else log "HTTP proof FAIL"; exit 1; fi

log "bundle scan START"
for image in "$FULL" "$SOLUTION_IMAGE"; do
  dir="$SP/bundle-scan/$(echo "$image" | tr '/:' '__')"; mkdir -p "$dir"
  cid="$(docker create "$image")"; docker export "$cid" | tar -x -C "$dir" app/.next app/node_modules/@gigalibs 2>/dev/null; docker rm "$cid" >/dev/null
  hits="$(grep -rlE 'CmmsWorkspace|EAM Operations Console|/cmms/work-orders|@gigalibs/cmms-web' "$dir/app/.next" 2>/dev/null | wc -l | tr -d ' ')"
  pages="$(find "$dir/app/.next/server/app" -path '*cmms*' -name '*.js' 2>/dev/null | wc -l | tr -d ' ')"
  pkg="$([ -e "$dir/app/node_modules/@gigalibs/cmms-web" ] && echo present || echo absent)"
  echo "$image: .next files mentioning CMMS screens/routes: $hits; compiled CMMS route files: $pages; node_modules/@gigalibs/cmms-web: $pkg" >> "$LOG"
done
log "LIVE 083d PASSED"
