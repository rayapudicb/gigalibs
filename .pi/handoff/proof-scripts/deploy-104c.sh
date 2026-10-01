#!/usr/bin/env bash
# WI-OI-104c deploy (owner-approved 2026-09-30): migrations jobs, then APIs, Redis and the kernel worker, then the 5180
# web, one service at a time with --no-deps; stops at the first failure. Backup first: gigalibs_backup_20260930_083914Z.
set -uo pipefail
cd ~/dev/gigalibs/infra/compose || exit 1
SP=/private/tmp/claude-501/-Users-rayapudi/7e540710-a7a2-4b98-bf5a-871b8ca5b513/scratchpad
TAG=$(grep '^WEB_IMAGE=' .env | sed 's/.*://')
[ -n "$TAG" ] || { echo 'FAIL: no WEB_IMAGE tag'; exit 1; }
DC=(docker compose --env-file .env --env-file .env.workforce --env-file .env.geospatial --env-file .env.modules
    -f compose.yaml -f compose.workforce.local.yaml -f compose.geospatial.local.yaml -f compose.modules.local.yaml)
C=gigalibs-configuration-local
step() { echo "== $* ($(date +%H:%M:%S))"; }
fail() { echo "FAIL: $*"; exit 1; }
state() { docker inspect -f '{{.State.Status}} {{.State.ExitCode}}' "$C-$1-1" 2>/dev/null; }
health() { docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$C-$1-1" 2>/dev/null; }

step "compose intends"
"${DC[@]}" config --format json 2>/dev/null > "$SP/compose.json" || fail "compose config"
node -e 'const s=require(process.argv[1]).services;for(const[k,v]of Object.entries(s))console.log(" ",k.padEnd(26),v.image)' "$SP/compose.json"
bad=$(node -e 'const s=require(process.argv[1]).services;console.log(Object.entries(s).filter(([k,v])=>k!=="redis"&&!v.image.endsWith(process.argv[2])).map(([k])=>k).join(" "))' "$SP/compose.json" "$TAG")
rm -f "$SP/compose.json"
[ -z "$bad" ] || fail "services not on $TAG: $bad"

for job in migrations cmms-migrations workforce-migrations geospatial-migrations connector-hub-migrations analytics-migrations; do
  step "migrations job: $job"
  "${DC[@]}" up -d --no-deps --force-recreate "$job" > "$SP/$job.out" 2>&1 || { tail -5 "$SP/$job.out"; fail "$job up"; }
  for _ in $(seq 1 100); do s=$(state "$job"); [ "${s%% *}" = exited ] && break; sleep 3; done
  echo "  $s; $(docker logs --tail 1 "$C-$job-1" 2>&1 | cut -c1-150)"
  [ "$s" = "exited 0" ] || { docker logs --tail 20 "$C-$job-1" 2>&1 | cut -c1-200; fail "$job did not succeed"; }
done

step "core migrations recorded"
docker exec gigalibs-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tA -c "SELECT migration_name FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND migration_name >= '"'"'20260930'"'"' ORDER BY 1"' | sed 's/^/  /' | tee "$SP/core-migrations.txt"
grep -q 20260930010000_kernel_job_schedules "$SP/core-migrations.txt" || fail "kernel_job_schedules not recorded"

# Consumers before producers (WI-OI-105 lesson): a relay's peer must know its key before the relay starts delivering,
# so Analytics (inbox for the Hub and Geospatial) goes first, then Geospatial (inbox for the Hub), then the Hub.
for svc in api cmms-api workforce-api analytics-api geospatial-api connector-hub-api redis kernel-worker web; do
  step "replace $svc"
  "${DC[@]}" up -d --no-deps "$svc" > "$SP/$svc.out" 2>&1 || { tail -5 "$SP/$svc.out"; fail "$svc up"; }
  for _ in $(seq 1 80); do h=$(health "$svc"); [ "$h" = healthy ] && break; sleep 3; done
  echo "  $svc: $h, $(docker inspect -f '{{.Config.Image}}' "$C-$svc-1")"
  [ "$h" = healthy ] || { docker logs --tail 20 "$C-$svc-1" 2>&1 | cut -c1-200; fail "$svc not healthy"; }
done

step "kernel worker"
sleep 12
docker logs "$C-kernel-worker-1" 2>&1 | tail -5 | cut -c1-200 | sed 's/^/  /'
docker logs "$C-kernel-worker-1" 2>&1 | grep -q 'BullMQ on' || fail "kernel worker did not start with Redis"
! docker logs "$C-kernel-worker-1" 2>&1 | grep -q 'tick failed' || fail "kernel worker ticks are failing"
echo "  redis host ports: $(docker port "$C-redis-1" | wc -l | tr -d ' '); kernel-worker host ports: $(docker port "$C-kernel-worker-1" | wc -l | tr -d ' ')"

step "5180"
for p in /api/health/ready /login /analytics/reports; do
  printf '  %-22s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 10 http://127.0.0.1:5180$p)"
done
step "Connector Hub refuses an unsigned request that only names a tenant"
code=$(docker exec "$C-web-1" node -e "fetch('http://connector-hub-api:4100/api/connectors/v1/connections',{headers:{'x-tenant-id':'any-tenant'}}).then(r=>console.log(r.status)).catch(e=>console.log('ERR '+e.message))")
echo "  unsigned request with X-Tenant-Id -> $code"
[ "$code" = 401 ] || fail "Connector Hub did not refuse an unsigned request"
step "done"
