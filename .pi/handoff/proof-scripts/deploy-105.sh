#!/usr/bin/env bash
# WI-OI-105 single deploy (owner, 2026-09-30: "batch"): backup, the new relay key pair, source identity, every image,
# migrations and services (--no-deps, one at a time), then the live web proof and the places end-to-end proof.
# Stops at the first failure.
set -uo pipefail
SP=/private/tmp/claude-501/-Users-rayapudi/7e540710-a7a2-4b98-bf5a-871b8ca5b513/scratchpad
cd ~/dev/gigalibs || exit 1
step() { echo "##### $* ($(date +%H:%M:%S))"; }
fail() { echo "DEPLOY-105 FAILED: $*"; exit 1; }
step backup
bash infra/compose/scripts/backup.sh > "$SP/backup.out" 2>&1 || { tail -5 "$SP/backup.out"; fail backup; }
tail -2 "$SP/backup.out"
step "credentials (appends missing groups only)"
bash infra/compose/scripts/generate-module-runtime-credentials.sh 2>&1 | tail -2
grep -q '^GEOSPATIAL_HUB_INBOX_RELAY_PUBLIC_KEY_BASE64=' infra/compose/.env.modules || fail "GEOSPATIAL_HUB key pair missing"
step "source identity"
bash infra/compose/scripts/refresh-source-identity.sh > "$SP/refresh.out" 2>&1 || { tail -5 "$SP/refresh.out"; fail refresh; }
TAG=$(grep '^WEB_IMAGE=' infra/compose/.env | sed 's/.*://'); echo "  tag $TAG"
step builds
bash "$SP/build-104c.sh" || fail builds
step "deploy (migrations, services)"
bash "$SP/deploy-104c.sh" > "$SP/deploy-105.log" 2>&1; rc=$?; tail -25 "$SP/deploy-105.log"; [ $rc = 0 ] || fail deploy
grep -q "FAIL" "$SP/deploy-105.log" && fail "deploy log has FAIL"
step "live web proof (5190)"
bash "$SP/live-web.sh" "gigalibs/workflow-platform:$TAG" "$SP/live-105.log"; rc=$?
grep -E "passed|failed|FAIL" "$SP/live-105.log" | tail -4; [ $rc = 0 ] || fail live-web
step "places end-to-end proof (5190)"
bash "$SP/e2e-105.sh" "$TAG" > "$SP/e2e-105.log" 2>&1; rc=$?
grep -E "^==|✓|✘|passed|failed|FAIL|Error" "$SP/e2e-105.log" | tail -25; [ $rc = 0 ] || fail e2e
echo "DEPLOY-105 PASSED $(date +%H:%M:%S) tag $TAG"
