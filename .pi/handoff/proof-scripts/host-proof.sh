#!/usr/bin/env bash
# WI-OI-085e proof in a fresh throwaway copy of the working tree: two modules in the shared module host plus one with
# its own service. Cleans up containers, schemas, roles, images and copied secrets whatever happens.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; SP="${PROOF_WORK_DIR:?Set PROOF_WORK_DIR to an empty directory outside the repository}"; mkdir -p "$SP"; P="$SP/host-proof"; C="$P/infra/compose"; L="$SP/host-proof.log"
MAIN_REPO="$HOME/dev/gigalibs"; MAIN="$MAIN_REPO/infra/compose"
A=field-inspections; B=site-visits; S=vendor-checks
: > "$L"
log() { echo "=== $* $(date +%H:%M:%S)" >> "$L"; }
psql_q() { docker exec gigalibs-postgres psql -U gigalibs -d gigalibs -tAc "$1"; }
COMPOSE=(docker compose --env-file "$C/.env" --env-file "$C/.env.modules" --env-file "$C/.env.module.host"
  --env-file "$C/.env.module.$A" --env-file "$C/.env.module.$B" --env-file "$C/.env.module.$S"
  -f "$C/compose.yaml" -f "$C/compose.modules.local.yaml" -f "$C/generated/compose.module-host.yaml" -f "$C/generated/compose.$S.yaml")
IMAGES=()
cleanup() {
  [ -f "$C/.env.module.host" ] && "${COMPOSE[@]}" rm -sf module-host "$A-migrations" "$B-migrations" "$S-api" "$S-migrations" >/dev/null 2>&1
  for m in $A $B $S; do
    schema="gigalibs_${m//-/_}"; role="${schema}_runtime"
    psql_q "DROP SCHEMA IF EXISTS $schema CASCADE" >/dev/null 2>&1
    psql_q "DO \$\$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$role') THEN EXECUTE 'DROP OWNED BY $role'; EXECUTE 'DROP ROLE $role'; END IF; END \$\$" >/dev/null 2>&1
  done
  for image in ${IMAGES[@]+"${IMAGES[@]}"}; do docker rmi "$image" >/dev/null 2>&1; done
  rm -f "$C"/.env "$C"/.env.modules "$C"/.env.workforce "$C"/.env.geospatial "$C"/.env.module.*
  log "cleaned up: schemas $(psql_q "SELECT count(*) FROM pg_namespace WHERE nspname IN ('gigalibs_field_inspections','gigalibs_site_visits','gigalibs_vendor_checks')"), roles $(psql_q "SELECT count(*) FROM pg_roles WHERE rolname LIKE 'gigalibs_field_inspections%' OR rolname LIKE 'gigalibs_site_visits%' OR rolname LIKE 'gigalibs_vendor_checks%'"), containers $(docker ps -a --format '{{.Names}}' | grep -cE 'module-host|field-inspections|site-visits|vendor-checks'), secrets $(ls "$C"/.env* 2>/dev/null | grep -vc example)"
}
trap cleanup EXIT
fail() { log "FAIL $*"; exit 1; }
conformance() { (cd "$P" && node scripts/module-conformance.mjs "$@") > "$SP/conf.out" 2>&1; local s=$?; grep -E '^FAIL|checks (passed|failed)' "$SP/conf.out" | sed "s/^/  [$1] /" >> "$L"; rm -f "$SP/conf.out"; return $s; }

rm -rf "$P"; mkdir -p "$P"
(cd "$MAIN_REPO" && git ls-files -co --exclude-standard -z | perl -0ne 'chomp; print "$_\0" if -e $_ || -l $_' | tar -c --null -T - -f -) | tar -x -f - -C "$P"
cd "$P" || exit 1
pnpm install --offline >/dev/null 2>&1 || fail "install"
node scripts/module-new.mjs "$A" --title "Field Inspections" --group "Workforce & Operations" --icon scale >> "$L" 2>&1 || fail "generate $A"
node scripts/module-new.mjs "$B" --title "Site Visits" --group "Workforce & Operations" --icon map-pin >> "$L" 2>&1 || fail "generate $B"
node scripts/module-new.mjs "$S" --title "Vendor Checks" --group "Platform" --hosting service >> "$L" 2>&1 || fail "generate $S"
node scripts/module-new.mjs host --title "Host Module" --group "Platform" > /dev/null 2>&1 && fail "reserved name accepted" || log "the reserved name host is refused"
pnpm install --offline >/dev/null 2>&1 || fail "install after generate"
pnpm -s --filter "@gigalibs/module-host..." --filter "@gigalibs/$S-api..." build > "$SP/build.out" 2>&1 || { tail -20 "$SP/build.out" >> "$L"; fail "build"; }
rm -f "$SP/build.out"
log "generated: $(ls infra/compose/generated | tr '\n' ' ')"
log "host list: $(grep -oE "name: '[a-z-]+'" apps/module-host/src/hosted-modules.generated.ts | tr '\n' ' ')"
log "host dependencies on modules: $(node -e 'console.log(Object.keys(require("./apps/module-host/package.json").dependencies).filter((d)=>/-api$/.test(d)).join(" "))')"
cp apps/module-host/package.json "$SP/host-package.bak"
node -e 'const f="apps/module-host/package.json";const p=require("./"+f);delete p.dependencies["@gigalibs/field-inspections-api"];require("fs").writeFileSync(f,JSON.stringify(p,null,2)+"\n")'
node scripts/module-manifests.mjs > "$SP/audit.out" 2>&1 && fail "host without a hosted module's dependency accepted"
log "host without $A's dependency refused: $(grep -oE 'must depend on [^"]+' "$SP/audit.out" | head -1)"
mv "$SP/host-package.bak" apps/module-host/package.json; rm -f "$SP/audit.out"

for m in $A $B $S; do conformance "$m" || fail "static conformance $m"; done

git init -q && git add -A >/dev/null && git -c user.email=proof@gigalibs.invalid -c user.name=proof commit -qm "module host proof"
( umask 077; for f in .env .env.modules .env.workforce .env.geospatial; do cp "$MAIN/$f" "$C/$f"; done )
bash "$C/scripts/refresh-source-identity.sh" >/dev/null 2>&1 || fail "refresh"
for m in $A $B $S; do bash "$C/scripts/generate-generated-module-credentials.sh" "$m" >> "$L" 2>&1 || fail "credentials $m"; done
grep -q '_IMAGE=' "$C/.env.module.$A" && fail "a hosted module got its own image line" || log "hosted modules have no image of their own; .env.module.host: $(grep -c MODULE_HOST_IMAGE "$C/.env.module.host") line"
log "host image build START"
bash "$C/scripts/build-module-host-image.sh" > "$SP/build.out" 2>&1 || { tail -15 "$SP/build.out" >> "$L"; fail "host image"; }
grep -E '^Built the module host' "$SP/build.out" | cut -c1-120 >> "$L"; rm -f "$SP/build.out"
IMAGES+=("$(grep -E '^MODULE_HOST_IMAGE=' "$C/.env.module.host" | cut -d= -f2)")
bash "$C/scripts/build-generated-module-image.sh" "$S" > "$SP/build.out" 2>&1 || { tail -15 "$SP/build.out" >> "$L"; fail "service image"; }
rm -f "$SP/build.out"
IMAGES+=("$(grep -E '^VENDOR_CHECKS_IMAGE=' "$C/.env.module.$S" | cut -d= -f2)")
log "images built: ${IMAGES[*]}"

"${COMPOSE[@]}" up -d module-host "$S-api" > "$SP/up.out" 2>&1 || { tail -5 "$SP/up.out" >> "$L"; for m in $A $B; do docker logs "gigalibs-configuration-local-$m-migrations-1" 2>&1 | tail -6 | sed "s/^/  [$m-migrations] /" >> "$L"; done; fail "compose up"; }
rm -f "$SP/up.out"
for i in $(seq 1 60); do
  h1="$(docker inspect -f '{{.State.Health.Status}}' gigalibs-configuration-local-module-host-1 2>/dev/null)"
  h2="$(docker inspect -f '{{.State.Health.Status}}' "gigalibs-configuration-local-$S-api-1" 2>/dev/null)"
  [ "$h1" = healthy ] && [ "$h2" = healthy ] && break; sleep 2
done
log "module-host: $h1; $S-api: $h2; migrations exit: $A=$(docker inspect -f '{{.State.ExitCode}}' "gigalibs-configuration-local-$A-migrations-1") $B=$(docker inspect -f '{{.State.ExitCode}}' "gigalibs-configuration-local-$B-migrations-1") $S=$(docker inspect -f '{{.State.ExitCode}}' "gigalibs-configuration-local-$S-migrations-1")"
[ "$h1" = healthy ] && [ "$h2" = healthy ] || { docker logs gigalibs-configuration-local-module-host-1 2>&1 | tail -20 >> "$L"; fail "not healthy"; }
log "host readiness: $(docker exec gigalibs-configuration-local-web-1 node -e "fetch('http://module-host:4790/health/ready').then(async r=>console.log(r.status,(await r.text()).slice(0,200)))")"
log "roles: $(psql_q "SELECT string_agg(rolname || ' super=' || rolsuper || ' bypassrls=' || rolbypassrls, '; ' ORDER BY rolname) FROM pg_roles WHERE rolname IN ('gigalibs_field_inspections_runtime','gigalibs_site_visits_runtime','gigalibs_vendor_checks_runtime')")"
# Separate -c commands with ON_ERROR_STOP: the read must fail with permission denied, not merely print nothing.
own="$(docker exec gigalibs-postgres psql -U gigalibs -d gigalibs -v ON_ERROR_STOP=1 -tA -c "SET ROLE gigalibs_field_inspections_runtime" -c "SELECT count(*) FROM gigalibs_field_inspections.records" 2>&1)" || fail "own read failed: $own"
cross="$(docker exec gigalibs-postgres psql -U gigalibs -d gigalibs -v ON_ERROR_STOP=1 -tA -c "SET ROLE gigalibs_field_inspections_runtime" -c "SELECT count(*) FROM gigalibs_site_visits.records" 2>&1)"; cross_exit=$?
[ "$cross_exit" -ne 0 ] && grep -q 'permission denied for schema gigalibs_site_visits' <<<"$cross" && log "$A's role reads its own records ($(tail -1 <<<"$own")) but not $B's: exit $cross_exit, $(grep -o 'permission denied[^"]*' <<<"$cross")" || fail "cross-module read not denied: exit $cross_exit $cross"

cat > "$P/cross-module-check.mjs" <<'EOF'
// A context signed for one hosted module is refused by another hosted module (different key and audience).
import { createPrivateKey, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const dir = '/repo/modules/field-inspections/apps/api/node_modules/@gigalibs/auth-core';
const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
const { signPlatformContextToken } = await import(pathToFileURL(join(dir, pkg.exports['.'].import)).href);
const key = createPrivateKey({ key: Buffer.from(process.env.KEY_A, 'base64'), format: 'der', type: 'pkcs8' }).export({ format: 'pem', type: 'pkcs8' }).toString();
const now = Math.floor(Date.now() / 1000);
const token = signPlatformContextToken({ iss: 'gigalibs-control-plane', aud: 'gigalibs-field-inspections-api', sub: 'u', tenant_id: 'cross-module-proof', session_id: 's', auth_version: 1, roles: ['TENANT_ADMIN'], granted_scopes: ['*'], persona_type: 'TENANT_ADMIN', org_scope: { mode: 'FLAT_TENANT' }, entitlement: { module_key: 'field-inspections', status: 'ENABLED', version: 'v1' }, iat: now, exp: now + 60, jti: randomUUID() }, key);
const call = async (path) => (await fetch(`http://module-host:4790${path}`, { headers: { Authorization: `Bearer ${token}` } })).status;
console.log(JSON.stringify({ own: await call('/field-inspections/v1/records'), other: await call('/site-visits/v1/records') }));
EOF
IMG="$(node -e 'console.log(require("./config/deployment-profiles/configuration-local-development-v1.json").artifactPolicy.baseImage)')"
result="$(docker run --rm --network gigalibs-configuration-local --read-only --cap-drop ALL -v "$P:/repo:ro" -w /repo -e "KEY_A=$(grep -E '^FIELD_INSPECTIONS_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64=' "$C/.env.module.$A" | cut -d= -f2)" "$IMG" node cross-module-check.mjs 2>&1 | tail -1)"
rm -f "$P/cross-module-check.mjs"  # an untracked file would change the source-state identity live conformance checks
[ "$result" = '{"own":200,"other":401}' ] && log "a context for $A is accepted by $A and refused by $B: $result" || fail "cross-module context: $result"
psql_q "DELETE FROM gigalibs_field_inspections.records WHERE tenant_id = 'cross-module-proof'" >/dev/null 2>&1

for m in $A $B $S; do conformance "$m" --live || fail "live conformance $m"; done
log "HOST PROOF PASSED"
