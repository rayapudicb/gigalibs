#!/usr/bin/env bash
# Verifies the Codex review changes to WI-OI-085d in isolation: HEAD plus only its five files, then the conformance
# proof with the new order (readiness set before the image and the record) and the refusals it added. Cleans up
# containers, schema, role, image and copied secrets whatever happens.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; SP="${PROOF_WORK_DIR:?Set PROOF_WORK_DIR to an empty directory outside the repository}"; mkdir -p "$SP"; P="$SP/codex-verify"; C="$P/infra/compose"; L="$SP/codex-verify.log"
MAIN_REPO="$HOME/dev/gigalibs"; MAIN="$MAIN_REPO/infra/compose"; M=field-inspections; SCHEMA=gigalibs_field_inspections; ROLE=${SCHEMA}_runtime
CODEX_FILES=(.dockerignore .pi/work/WI-OI-085.md scripts/compute-source-state-sha256.mjs scripts/module-conformance.mjs scripts/module-manifests.mjs)
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
  log "cleaned up: schema $(psql_q "SELECT count(*) FROM pg_namespace WHERE nspname = '$SCHEMA'"), role $(psql_q "SELECT count(*) FROM pg_roles WHERE rolname = '$ROLE'"), containers $(docker ps -a --filter name=$M --format x | wc -l | tr -d ' '), secrets $(ls "$C"/.env* 2>/dev/null | grep -vc example)"
}
trap cleanup EXIT
conformance() { (cd "$P" && node scripts/module-conformance.mjs "$M" "$@") > "$SP/conf.out" 2>&1; local s=$?; grep -E '^FAIL|checks (passed|failed)|Recorded|Not recorded' "$SP/conf.out" >> "$L"; rm -f "$SP/conf.out"; return $s; }
audit() { (cd "$P" && node scripts/module-manifests.mjs) > "$SP/audit.out" 2>&1; local s=$?; grep -E 'conformance|PLANNED' "$SP/audit.out" | head -2 | cut -c1-180 >> "$L"; rm -f "$SP/audit.out"; return $s; }

rm -rf "$P"; mkdir -p "$P"
(cd "$MAIN_REPO" && git archive HEAD) | tar -x -f - -C "$P"
for f in "${CODEX_FILES[@]}"; do cp "$MAIN_REPO/$f" "$P/$f"; done
log "copy = HEAD $(git -C "$MAIN_REPO" rev-parse --short HEAD) + Codex files: ${CODEX_FILES[*]}"
cd "$P" || exit 1
pnpm install --offline >/dev/null 2>&1 || { log "FAIL install"; exit 1; }
for audit_script in module-manifests verify-layer-boundaries verify-sdlc-governance; do
  node "scripts/$audit_script.mjs" >/dev/null 2>&1 && log "audit $audit_script passes" || { log "FAIL audit $audit_script"; exit 1; }
done

node scripts/module-new.mjs "$M" --title "Field Inspections" --group "Workforce & Operations" --icon scale >/dev/null 2>&1 || { log "FAIL generate"; exit 1; }
pnpm install --offline >/dev/null 2>&1 && pnpm -s --filter "@gigalibs/$M-api..." build >/dev/null 2>&1 || { log "FAIL install/build"; exit 1; }
log "generated and built"
log "static conformance"; conformance || { log "FAIL static"; exit 1; }

API="$P/modules/$M/apps/api/src"; MIG="$P/modules/$M/db/migrations/000001_field_inspections_foundation.up.sql"
broken() {
  cp "$1" "$1.bak"; perl -0pi -e "$2" "$1"
  (cd "$P" && node scripts/module-conformance.mjs "$M") > "$SP/broken.out" 2>&1; local status=$?; mv "$1.bak" "$1"
  if [ $status -ne 0 ] && grep -qE "^FAIL $3 " "$SP/broken.out"; then log "broken copy refused by $3"; else log "FAIL broken copy not refused by $3"; cat "$SP/broken.out" >> "$L"; rm -f "$SP/broken.out"; exit 1; fi
  rm -f "$SP/broken.out"
}
broken "$MIG" "s/    EXECUTE format\('ALTER TABLE gigalibs_field_inspections.%I FORCE ROW LEVEL SECURITY', relation\);\n//" S11
broken "$API/records/records.controller.ts" "s/  \@Get\(\)\n  \@RequirePermissions\('field-inspections.records.read'\)\n/  \@Get\(\)\n/" S9
broken "$API/authorization.ts" "s/extends SignedContextGuardBase/extends Object/" S5

log "readiness set to REVIEW before the image and the record"
perl -pi -e 's/^(\s+readiness:) PLANNED$/$1 REVIEW/' "$P/modules/$M/module.yaml"
# Regenerate the catalogue for the new readiness before the image is built; only the named module's gate is deferred.
(cd "$P" && node scripts/module-manifests.mjs --write --conformance-module "$M" >/dev/null 2>&1) && log "regenerated with the named-module deferral" || { log "FAIL regenerate"; exit 1; }
audit && { log "FAIL REVIEW accepted without a record"; exit 1; } || log "REVIEW without a record: ordinary audit refuses"

git init -q && git add -A >/dev/null && git -c user.email=proof@gigalibs.invalid -c user.name=proof commit -qm "codex review verification"
( umask 077; for f in .env .env.modules .env.workforce .env.geospatial; do cp "$MAIN/$f" "$C/$f"; done )
bash "$C/scripts/refresh-source-identity.sh" >/dev/null 2>&1 && bash "$C/scripts/generate-generated-module-credentials.sh" "$M" >/dev/null 2>&1 || { log "FAIL refresh/credentials"; exit 1; }
bash "$C/scripts/build-generated-module-image.sh" "$M" > "$SP/build.out" 2>&1 || { tail -5 "$SP/build.out" >> "$L"; log "FAIL image"; exit 1; }
rm -f "$SP/build.out"
IMAGE="$(grep -E '^FIELD_INSPECTIONS_IMAGE=' "$C/.env.module.$M" | cut -d= -f2)"
"${COMPOSE[@]}" up -d "$M-api" >/dev/null 2>&1 || { log "FAIL compose up"; exit 1; }
for i in $(seq 1 60); do [ "$(docker inspect -f '{{.State.Health.Status}}' "gigalibs-configuration-local-$M-api-1" 2>/dev/null)" = healthy ] && break; sleep 2; done

log "live conformance with --record"
conformance --live --record || { log "FAIL live conformance"; exit 1; }
audit && log "REVIEW with the current record: ordinary audit passes" || { log "FAIL gate refused a current record"; exit 1; }
[ "$(cd "$P" && node scripts/compute-source-state-sha256.mjs)" = "$(docker inspect -f '{{index .Config.Labels "com.gigalibs.source-state-sha256"}}' "$IMAGE")" ] && log "writing conformance.json left the source identity unchanged" || { log "FAIL record changed the source identity"; exit 1; }

mv "$P/modules/$M/conformance.json" "$SP/record.bak"; audit && { log "FAIL accepted without a record"; exit 1; } || log "record removed: ordinary audit refuses"
mv "$SP/record.bak" "$P/modules/$M/conformance.json"
echo "// changed after conformance" >> "$API/records/records.service.ts"
audit && { log "FAIL accepted changed code"; exit 1; } || log "code changed after the record: ordinary audit refuses"
log "stale image against changed code"
conformance --live && { log "FAIL stale image accepted"; exit 1; } || log "live conformance refuses the old image (L0 identity)"
log "CODEX CHANGES VERIFIED"
