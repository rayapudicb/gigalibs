#!/usr/bin/env bash
# WI-OI-085d proof in a fresh throwaway copy: static conformance, broken copies, live conformance with --record, and
# the listing gate. Cleans up containers, schema, role, image and copied secrets whatever happens.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; SP="${PROOF_WORK_DIR:?Set PROOF_WORK_DIR to an empty directory outside the repository}"; mkdir -p "$SP"; P="$SP/module-proof"; C="$P/infra/compose"; L="$SP/conformance-proof.log"
MAIN_REPO="$HOME/dev/gigalibs"; MAIN="$MAIN_REPO/infra/compose"; M=field-inspections; SCHEMA=gigalibs_field_inspections; ROLE=${SCHEMA}_runtime
: > "$L"
log() { echo "=== $* $(date +%H:%M:%S)" >> "$L"; }
psql_q() { docker exec gigalibs-postgres psql -U gigalibs -d gigalibs -tAc "$1"; }
COMPOSE=(docker compose --env-file "$C/.env" --env-file "$C/.env.modules" --env-file "$C/.env.workforce"
  --env-file "$C/.env.geospatial" --env-file "$C/.env.module.$M" -f "$C/compose.yaml" -f "$C/compose.workforce.local.yaml"
  -f "$C/compose.geospatial.local.yaml" -f "$C/compose.modules.local.yaml" -f "$C/generated/compose.$M.yaml")
IMAGE=""
cleanup() {
  [ -f "$C/.env.module.$M" ] && "${COMPOSE[@]}" rm -sf "$M-api" "$M-migrations" >/dev/null 2>&1
  psql_q "DROP SCHEMA IF EXISTS $SCHEMA CASCADE" >/dev/null 2>&1
  psql_q "DO \$\$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$ROLE') THEN EXECUTE 'DROP OWNED BY $ROLE'; EXECUTE 'DROP ROLE $ROLE'; END IF; END \$\$" >/dev/null 2>&1
  [ -n "$IMAGE" ] && docker rmi "$IMAGE" >/dev/null 2>&1
  rm -f "$C/.env" "$C/.env.modules" "$C/.env.workforce" "$C/.env.geospatial" "$C/.env.module.$M"
  log "cleaned up: schema $(psql_q "SELECT count(*) FROM pg_namespace WHERE nspname = '$SCHEMA'"), role $(psql_q "SELECT count(*) FROM pg_roles WHERE rolname = '$ROLE'"), containers $(docker ps -a --filter name=$M --format x | wc -l | tr -d ' ')"
}
trap cleanup EXIT
conformance() { (cd "$P" && node scripts/module-conformance.mjs "$M" "$@") >> "$L" 2>&1; }
audit() { (cd "$P" && node scripts/module-manifests.mjs) > "$SP/audit.out" 2>&1; local s=$?; grep -E 'conformance|PLANNED' "$SP/audit.out" | head -3 >> "$L"; rm -f "$SP/audit.out"; return $s; }

rm -rf "$P"; mkdir -p "$P"
(cd "$MAIN_REPO" && git ls-files -co --exclude-standard -z | perl -0ne 'chomp; print "$_\0" if -e $_ || -l $_' | tar -c --null -T - -f -) | tar -x -f - -C "$P"
cd "$P" || exit 1
pnpm install --offline >/dev/null 2>&1
node scripts/module-new.mjs "$M" --title "Field Inspections" --group "Workforce & Operations" --icon scale >> "$L" 2>&1 || { log "FAIL generate"; exit 1; }
pnpm install --offline >/dev/null 2>&1 && pnpm -s --filter "@gigalibs/$M-api..." build > /dev/null 2>&1 || { log "FAIL install/build"; exit 1; }
log "generated and built"

log "static conformance"
conformance || { log "FAIL static conformance"; exit 1; }

API="$P/modules/$M/apps/api/src"; MIG="$P/modules/$M/db/migrations/000001_field_inspections_foundation.up.sql"
broken() { # file, perl expression, expected failing check
  cp "$1" "$1.bak"; perl -0pi -e "$2" "$1"
  (cd "$P" && node scripts/module-conformance.mjs "$M") > "$SP/broken.out" 2>&1
  local status=$?; mv "$1.bak" "$1"
  if [ $status -ne 0 ] && grep -qE "^FAIL $3 " "$SP/broken.out"; then log "broken copy refused by $3: $(grep -E "^FAIL $3 " "$SP/broken.out" | cut -c1-150)"; else log "FAIL broken copy not refused by $3"; cat "$SP/broken.out" >> "$L"; rm -f "$SP/broken.out"; exit 1; fi
  rm -f "$SP/broken.out"
}
broken "$MIG" "s/    EXECUTE format\('ALTER TABLE gigalibs_field_inspections.%I FORCE ROW LEVEL SECURITY', relation\);\n//" S11
broken "$API/records/records.controller.ts" "s/  \@Get\(\)\n  \@RequirePermissions\('field-inspections.records.read'\)\n/  \@Get\(\)\n/" S9
broken "$API/authorization.ts" "s/extends SignedContextGuardBase/extends Object/" S5

log "runtime for the live checks"
git init -q && git add -A >/dev/null && git -c user.email=proof@gigalibs.invalid -c user.name=proof commit -qm "module:new conformance proof"
( umask 077; for f in .env .env.modules .env.workforce .env.geospatial; do cp "$MAIN/$f" "$C/$f"; done )
bash "$C/scripts/refresh-source-identity.sh" >/dev/null 2>&1 && bash "$C/scripts/generate-generated-module-credentials.sh" "$M" >/dev/null 2>&1 || { log "FAIL refresh/credentials"; exit 1; }
bash "$C/scripts/build-generated-module-image.sh" "$M" >> "$L" 2>&1 || { log "FAIL image"; exit 1; }
IMAGE="$(grep -E '^FIELD_INSPECTIONS_IMAGE=' "$C/.env.module.$M" | cut -d= -f2)"
"${COMPOSE[@]}" up -d "$M-api" >/dev/null 2>&1 || { log "FAIL compose up"; exit 1; }
for i in $(seq 1 60); do [ "$(docker inspect -f '{{.State.Health.Status}}' "gigalibs-configuration-local-$M-api-1" 2>/dev/null)" = healthy ] && break; sleep 2; done

log "live conformance with --record"
conformance --live --record || { log "FAIL live conformance"; exit 1; }
[ -f "$P/modules/$M/conformance.json" ] && log "record: $(tr -d '\n ' < "$P/modules/$M/conformance.json" | cut -c1-160)"

log "listing gate"
perl -pi -e 's/^(\s+readiness:) PLANNED$/$1 REVIEW/' "$P/modules/$M/module.yaml"
(cd "$P" && node scripts/module-manifests.mjs --write >/dev/null 2>&1); audit && log "REVIEW with a current record: audit passes" || { log "FAIL gate refused a current record"; exit 1; }
mv "$P/modules/$M/conformance.json" "$SP/record.bak"; audit && { log "FAIL gate accepted REVIEW without a record"; exit 1; } || log "REVIEW without a record: audit refuses"
mv "$SP/record.bak" "$P/modules/$M/conformance.json"
echo "// changed after conformance" >> "$API/records/records.service.ts"; audit && { log "FAIL gate accepted changed code"; exit 1; } || log "REVIEW after a code change: audit refuses"
log "CONFORMANCE PROOF PASSED"
