#!/usr/bin/env bash
# WI-OI-107 single deploy (owner's "go", batch way of working): backup, source identity, every image (build cache
# trimmed before each), migrations (Workforce 15, Geospatial 7) and services (consumers before producers), then the
# live web proof and the packs end-to-end proof. Stops at the first failure.
set -uo pipefail
SP=/private/tmp/claude-501/-Users-rayapudi/7e540710-a7a2-4b98-bf5a-871b8ca5b513/scratchpad
cd ~/dev/gigalibs || exit 1
step() { echo "##### $* ($(date +%H:%M:%S))"; }
fail() { echo "DEPLOY-107 FAILED: $*"; exit 1; }
step backup
bash infra/compose/scripts/backup.sh > "$SP/backup.out" 2>&1 || { tail -5 "$SP/backup.out"; fail backup; }
tail -2 "$SP/backup.out"
step "source identity"
bash infra/compose/scripts/refresh-source-identity.sh > "$SP/refresh.out" 2>&1 || { tail -5 "$SP/refresh.out"; fail refresh; }
TAG=$(grep '^WEB_IMAGE=' infra/compose/.env | sed 's/.*://'); echo "  tag $TAG"
step "superseded images"
bash infra/compose/scripts/docker-disk-guard.sh prune 2>&1 | tail -2
for build in ${BUILDS:-build-images build-module-images build-workforce-image build-geospatial-image}; do
  step "trim build cache, then $build"
  docker builder prune -f --max-used-space 4gb 2>&1 | tail -1
  sleep 15
  BUILDS="$build" bash "$SP/build-resume.sh" || fail "$build"
done
step "deploy (migrations, services)"
bash "$SP/deploy-104c.sh" > "$SP/deploy-107.log" 2>&1; rc=$?; tail -25 "$SP/deploy-107.log"; [ $rc = 0 ] || fail deploy
step "live web proof (5190)"
bash "$SP/live-web.sh" "gigalibs/workflow-platform:$TAG" "$SP/live-107.log"; rc=$?
grep -E "passed|failed|FAIL" "$SP/live-107.log" | tail -4; [ $rc = 0 ] || fail live-web
step "packs end-to-end proof (5190)"
bash "$SP/e2e-107.sh" "$TAG" > "$SP/e2e-107.log" 2>&1; rc=$?
grep -E "^==|✓|✘|passed|failed|FAIL|Error|  [a-z]+\.pack-apply" "$SP/e2e-107.log" | tail -25; [ $rc = 0 ] || fail e2e
echo "DEPLOY-107 PASSED $(date +%H:%M:%S) tag $TAG"
