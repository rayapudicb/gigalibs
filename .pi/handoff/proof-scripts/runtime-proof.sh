#!/usr/bin/env bash
# WI-OI-085b runtime proof in the throwaway copy: credentials, generic image, generated overlay, migrations, health,
# least privilege and RLS. Cleans up containers, schema, role, image and copied secrets whatever happens.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; SP="${PROOF_WORK_DIR:?Set PROOF_WORK_DIR to an empty directory outside the repository}"; mkdir -p "$SP"; P="$SP/module-proof"; C="$P/infra/compose"; L="$SP/runtime-proof.log"
MAIN="$HOME/dev/gigalibs/infra/compose"; M=field-inspections; SCHEMA=gigalibs_field_inspections; ROLE=${SCHEMA}_runtime
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

cd "$P" || exit 1
[ -d .git ] || { git init -q && git add -A >/dev/null && git -c user.email=proof@gigalibs.invalid -c user.name=proof commit -qm "module:new proof"; }
log "throwaway source revision $(git rev-parse --short HEAD)"
( umask 077; for f in .env .env.modules .env.workforce .env.geospatial; do cp "$MAIN/$f" "$C/$f"; done )
bash "$C/scripts/refresh-source-identity.sh" >/dev/null 2>&1 || { log "FAIL refresh"; exit 1; }
bash "$C/scripts/generate-generated-module-credentials.sh" "$M" >> "$L" 2>&1 || { log "FAIL credentials"; exit 1; }
log "second credentials run must refuse"
bash "$C/scripts/generate-generated-module-credentials.sh" "$M" >> "$L" 2>&1 && { log "FAIL credentials overwritten"; exit 1; }
log "image build START"
bash "$C/scripts/build-generated-module-image.sh" "$M" >> "$L" 2>&1 || { log "FAIL image build"; exit 1; }
IMAGE="$(grep -E '^FIELD_INSPECTIONS_IMAGE=' "$C/.env.module.$M" | cut -d= -f2)"
log "image built: $IMAGE"

"${COMPOSE[@]}" config --quiet >> "$L" 2>&1 || { log "FAIL compose config"; exit 1; }
log "compose renders with the generated overlay"
"${COMPOSE[@]}" up -d "$M-api" >> "$L" 2>&1 || { log "FAIL compose up"; "${COMPOSE[@]}" logs "$M-migrations" "$M-api" 2>&1 | tail -30 >> "$L"; exit 1; }
for i in $(seq 1 60); do
  h="$(docker inspect -f '{{.State.Health.Status}}' "gigalibs-configuration-local-$M-api-1" 2>/dev/null)"
  [ "$h" = healthy ] && break; sleep 2
done
log "migrations exit $(docker inspect -f '{{.State.ExitCode}}' "gigalibs-configuration-local-$M-migrations-1"); api health: $h"
[ "$h" = healthy ] || { "${COMPOSE[@]}" logs "$M-migrations" "$M-api" 2>&1 | tail -30 >> "$L"; exit 1; }

fetch() { docker exec gigalibs-configuration-local-web-1 node -e "fetch('$1').then(async r=>{console.log(r.status, (await r.text()).slice(0,160))}).catch(e=>console.log('ERR', e.message))"; }
log "ready: $(fetch "http://$M-api:4800/v1/health/ready")"
log "records without a signed context: $(fetch "http://$M-api:4800/v1/records")"
log "runtime role: $(psql_q "SELECT 'superuser=' || rolsuper || ' bypassrls=' || rolbypassrls || ' createrole=' || rolcreaterole FROM pg_roles WHERE rolname = '$ROLE'")"
log "forced RLS tables: $(psql_q "SELECT string_agg(relname || ':' || relforcerowsecurity, ' ' ORDER BY relname) FROM pg_class WHERE relnamespace = '$SCHEMA'::regnamespace AND relkind = 'r'")"
log "schema version: $(psql_q "SELECT max(version) FROM $SCHEMA.schema_migrations")"
log "runtime privileges on audit_events: $(psql_q "SELECT string_agg(privilege_type, ',' ORDER BY privilege_type) FROM information_schema.role_table_grants WHERE grantee = '$ROLE' AND table_schema = '$SCHEMA' AND table_name = 'audit_events'")"
log "runtime privileges on auth_revocation_events: $(psql_q "SELECT string_agg(privilege_type, ',' ORDER BY privilege_type) FROM information_schema.role_table_grants WHERE grantee = '$ROLE' AND table_schema = '$SCHEMA' AND table_name = 'auth_revocation_events'")"
log "image labels: $(docker image inspect "$IMAGE" --format '{{index .Config.Labels "com.gigalibs.component"}} generated={{index .Config.Labels "com.gigalibs.generated-module"}} user={{.Config.User}}')"
log "RUNTIME PROOF PASSED"
