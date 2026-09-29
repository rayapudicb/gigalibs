#!/usr/bin/env bash
# Live web certification on 127.0.0.1:5190 without touching the web on 5180.
# Usage: live-web.sh <web-image> <log-file>
set -uo pipefail
IMAGE="${1:?web image}"; LOG="${2:?log file}"
HERE="$(cd "$(dirname "$0")" && pwd)"; SP="${PROOF_WORK_DIR:?Set PROOF_WORK_DIR to an empty directory outside the repository}"; mkdir -p "$SP"
REPO="$HOME/dev/gigalibs"; C="$REPO/infra/compose"
ENVFILE="$SP/e2e-web.env"; CREDS="$SP/e2e-creds.json"; NAME=gigalibs-e2e-web
: > "$LOG"
log() { echo "=== $* $(date +%H:%M:%S)" >> "$LOG"; }
cleanup() {
  # KEEP_RUNNING=1: leave the container, credentials and sessions for a follow-up proof; it cleans up.
  [ "${KEEP_RUNNING:-}" = 1 ] && return
  docker rm -f "$NAME" >/dev/null 2>&1
  rm -f "$ENVFILE" "$CREDS"
  # Revoke every session of the run-scoped verification users.
  docker exec gigalibs-postgres psql -U gigalibs -d gigalibs -tAc \
    "UPDATE sessions SET status='REVOKED', \"revokedAt\"=now() WHERE status='ACTIVE' AND \"userId\" IN (SELECT id FROM users WHERE email LIKE 'gigaops-web.%@gigalibs.invalid')" \
    >> "$LOG" 2>&1 && log "sessions revoked"
}
trap cleanup EXIT

cd "$C" || exit 1
( umask 077
  docker compose --env-file .env --env-file .env.workforce --env-file .env.geospatial --env-file .env.modules \
    -f compose.yaml -f compose.workforce.local.yaml -f compose.geospatial.local.yaml -f compose.modules.local.yaml \
    config --format json 2>>"$LOG" |
    node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const e=JSON.parse(s).services.web.environment;for(const[k,v]of Object.entries(e))if(v!==null&&v!=="")console.log(`${k}=${v}`)})' > "$ENVFILE" )
[ -s "$ENVFILE" ] || { log "FAIL no web environment"; exit 1; }

docker rm -f "$NAME" >/dev/null 2>&1
docker run -d --name "$NAME" --network gigalibs-configuration-local -p 127.0.0.1:5190:5180 \
  --init --read-only --tmpfs /tmp:rw,noexec,nosuid,size=64m --tmpfs /app/.next/cache:rw,noexec,nosuid,size=128m \
  --security-opt no-new-privileges:true --cap-drop ALL --env-file "$ENVFILE" "$IMAGE" >> "$LOG" 2>&1 || { log "FAIL docker run"; exit 1; }
for i in $(seq 1 60); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 http://127.0.0.1:5190/api/health/ready)" = 200 ] && break
  sleep 2
done
[ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 http://127.0.0.1:5190/api/health/ready)" = 200 ] || { log "FAIL web not ready"; docker logs "$NAME" 2>&1 | tail -20 >> "$LOG"; exit 1; }
log "web ready on 5190"

DBURL="$(grep -E '^DATABASE_URL=' "$C/.env" | cut -d= -f2- | sed 's/host.docker.internal/127.0.0.1/')"
log "web-path verification START"
if (cd "$REPO/apps/playground-api" && DATABASE_URL="$DBURL" WEB_TEST_URL=http://127.0.0.1:5190 KEEP_SESSIONS=true \
    node scripts/verify-gigaops-web-path.mjs > "$CREDS" 2>> "$LOG"); then log "web-path verification PASS"
else log "web-path verification FAIL"; exit 1; fi

cat > "$REPO/e2e/test-results/local-chrome.config.ts" <<'EOF'
import base from '../playwright.config';
export default {
  ...base,
  testDir: '../specs',
  outputDir: './artifacts',
  reporter: [['list']],
  use: { ...base.use, channel: 'chrome', video: 'off', screenshot: 'off', trace: 'off' },
  projects: [{ name: 'chrome', use: { channel: 'chrome' } }],
};
EOF
E2E_EMAIL="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8").trim().split("\n").pop()).email)' "$CREDS")"
E2E_PASSWORD="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8").trim().split("\n").pop()).password)' "$CREDS")"
E2E_SITE_ID="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8").trim().split("\n").pop()).siteId)' "$CREDS")"
E2E_WORK_ORDER_ID="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8").trim().split("\n").pop()).workOrderId)' "$CREDS")"
log "playwright START"
if (cd "$REPO/e2e" && E2E_EMAIL="$E2E_EMAIL" E2E_PASSWORD="$E2E_PASSWORD" E2E_SITE_ID="$E2E_SITE_ID" \
    E2E_WORK_ORDER_ID="$E2E_WORK_ORDER_ID" PLAYWRIGHT_TEST_BASE_URL=http://127.0.0.1:5190 \
    npx playwright test --config test-results/local-chrome.config.ts specs/gigaops-p5-p8.spec.ts >> "$LOG" 2>&1); then
  log "playwright PASS"
else log "playwright FAIL"; exit 1; fi
log "LIVE PASSED"
