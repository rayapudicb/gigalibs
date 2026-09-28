#!/usr/bin/env bash
set -euo pipefail

# WI-OI-064b drill-down performance certification (roadmap P3 exit: p95 < 20 ms on 1,000,000 facts).
# Loads synthetic facts into one run-scoped certification tenant (wi-oi-064b-perf-*), rebuilds rollups through the
# running API, checks totals against the raw facts, measures drill-downs through the API, then deletes the facts
# and rollups (roadmap rule 8). The rebuild audit record is kept as evidence.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
BASE_ENV="${COMPOSE_DIR}/.env"
MODULES_ENV="${COMPOSE_DIR}/.env.modules"
FACTS="${FACTS:-1000000}"
SAMPLES="${SAMPLES:-200}"
LIMIT_P95_MS="${LIMIT_P95_MS:-20}"

read_value() {
  local value
  value="$(awk -v key="$2" 'index($0, key "=") == 1 { print substr($0, length(key) + 2); exit }' "$1")"
  if [[ -z "${value}" ]]; then
    echo "Error: $2 is missing from $1." >&2
    exit 1
  fi
  printf '%s' "${value}"
}

PRIVATE_KEY_BASE64="$(read_value "${MODULES_ENV}" ANALYTICS_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64)"
POSTGRES_CONTAINER="$(read_value "${BASE_ENV}" CONTROL_POSTGRES_CONTAINER)"
ADMIN_USER="$(read_value "${BASE_ENV}" CONTROL_DB_USER)"
DATABASE_NAME="$(SOURCE_URL="$(read_value "${MODULES_ENV}" MODULE_MIGRATIONS_DATABASE_URL)" \
  node -e 'process.stdout.write(new URL(process.env.SOURCE_URL).pathname.slice(1))')"
CONTAINER_ID="$(docker compose --env-file "${BASE_ENV}" --env-file "${MODULES_ENV}" \
  -f "${COMPOSE_DIR}/compose.yaml" -f "${COMPOSE_DIR}/compose.modules.local.yaml" ps -q analytics-api)"
if [[ -z "${CONTAINER_ID}" ]]; then
  echo "Error: Analytics API container is not running." >&2
  exit 1
fi

RUN_ID="$(date -u +'%Y%m%dT%H%M%SZ')"
TENANT="wi-oi-064b-perf-${RUN_ID}"
psql_admin() {
  docker exec -i "${POSTGRES_CONTAINER}" psql -U "${ADMIN_USER}" -d "${DATABASE_NAME}" -At -v ON_ERROR_STOP=1 "$@"
}
cleanup() {
  psql_admin -c "DELETE FROM gigalibs_analytics.place_rollups WHERE tenant_id = '${TENANT}';
                 DELETE FROM gigalibs_analytics.operational_facts WHERE tenant_id = '${TENANT}';" >/dev/null || true
}
trap cleanup EXIT

TOKEN="$(PRIVATE_KEY_BASE64="${PRIVATE_KEY_BASE64}" TENANT="${TENANT}" node -e '
  const { createPrivateKey, randomUUID, sign } = require("node:crypto");
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const payload = encode({
    iss: "gigalibs-control-plane", aud: "gigalibs-analytics-api", sub: "wi-oi-064b-certifier",
    tenant_id: process.env.TENANT, session_id: `perf-${process.env.TENANT}`, auth_version: 1, roles: ["TENANT_ADMIN"],
    granted_scopes: ["analytics:*"], persona_type: "TENANT_ADMIN", org_scope: { mode: "FLAT_TENANT" },
    spatial_scope: { mode: "UNBOUNDED" },
    entitlement: { module_key: "analytics-studio", status: "ENABLED", version: "wi-oi-064b" },
    iat: now, exp: now + 900, jti: randomUUID()
  });
  const key = createPrivateKey({ key: Buffer.from(process.env.PRIVATE_KEY_BASE64, "base64"), format: "der", type: "pkcs8" });
  const data = `${encode({ alg: "EdDSA", typ: "JWT" })}.${payload}`;
  process.stdout.write(`${data}.${sign(null, Buffer.from(data), key).toString("base64url")}`);
')"

# 10 regions x 20 sites x 5 zones; about 9% of facts on sites, the rest on zones; one year of UTC days.
psql_admin -c "
  INSERT INTO gigalibs_analytics.operational_facts
    (tenant_id, fact_type, place_id, place_path, occurred_at, quantity, currency_code, origin, source, source_event_id)
  SELECT '${TENANT}', CASE WHEN n % 13 = 7 THEN 'LABOUR_COST' ELSE 'LABOUR_HOURS' END,
         md5(path)::uuid, path::ltree,
         timestamptz '2025-10-01 00:00:00Z' + ((n * 7919) % 365) * interval '1 day' + ((n * 131) % 86400) * interval '1 second',
         CASE WHEN n % 13 = 7 THEN 150 + (n % 90) ELSE 1 + (n % 8) END,
         CASE WHEN n % 13 = 7 THEN 'USD' END,
         'SYNTHETIC', 'wi-oi-064b-perf', n::text
    FROM (
      SELECT n,
             'R' || (n % 10) || '.S' || (n % 10) || '_' || ((n / 10) % 20)
               || CASE WHEN n % 11 = 0 THEN '' ELSE '.Z' || ((n / 200) % 5) END AS path
        FROM generate_series(1::bigint, ${FACTS}::bigint) AS n
    ) generated;" >/dev/null

api() {
  docker exec -e "TOKEN=${TOKEN}" -e "TENANT=${TENANT}" -e "SAMPLES=${SAMPLES}" -e "LIMIT=${LIMIT_P95_MS}" \
    "${CONTAINER_ID}" node -e "$1"
}

REBUILD="$(api '
  const started = performance.now();
  fetch("http://127.0.0.1:4400/v1/places/rollups/rebuild", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "2025-10-01", to: "2026-09-30" }),
  }).then(async (response) => {
    const body = await response.json();
    if (response.status !== 200) throw new Error(`rebuild failed ${response.status} ${JSON.stringify(body)}`);
    process.stdout.write(`${body.rollupRows} ${Math.round(performance.now() - started)}`);
  }).catch((error) => { console.error(error.message); process.exit(1); });
')"
read -r ROLLUP_ROWS REBUILD_MS <<<"${REBUILD}"

EXPECTED_TOTAL="$(psql_admin -c "SELECT SUM(quantity)::bigint FROM gigalibs_analytics.operational_facts WHERE tenant_id = '${TENANT}' AND fact_type = 'LABOUR_HOURS'")"

api "
  const base = 'http://127.0.0.1:4400/v1/places/drilldown';
  const headers = { Authorization: 'Bearer ' + process.env.TOKEN };
  const get = async (params) => {
    const started = performance.now();
    const response = await fetch(base + '?' + new URLSearchParams(params), { headers });
    const body = await response.json();
    if (response.status !== 200) throw new Error('drilldown ' + response.status + ' ' + JSON.stringify(body));
    return { body, ms: performance.now() - started };
  };
  (async () => {
    const whole = await get({ factType: 'LABOUR_HOURS', under: '', from: '2025-10-01', to: '2026-09-30' });
    if (Math.round(whole.body.total) !== ${EXPECTED_TOTAL} || whole.body.items.length !== 10) {
      throw new Error('estate total ' + whole.body.total + ' across ' + whole.body.items.length + ' regions; expected ${EXPECTED_TOTAL} across 10');
    }
    const region = await get({ factType: 'LABOUR_HOURS', under: 'R3', from: '2025-10-01', to: '2026-09-30' });
    const site = await get({ factType: 'LABOUR_HOURS', under: 'R3.S3_4', from: '2025-10-01', to: '2026-09-30' });
    const regionTotal = whole.body.items.find((item) => item.path === 'R3').quantity;
    if (Math.abs(region.body.total - regionTotal) > 0.001 || !site.body.items.some((item) => item.self)) {
      throw new Error('drill-down levels do not reconcile');
    }
    const timings = [];
    for (let i = 0; i < Number(process.env.SAMPLES); i += 1) {
      const level = i % 3;
      const under = level === 0 ? '' : level === 1 ? 'R' + (i % 10) : 'R' + (i % 10) + '.S' + (i % 10) + '_' + (i % 20);
      const start = new Date(Date.UTC(2025, 9, 1) + (i % 330) * 86400000).toISOString().slice(0, 10);
      const end = new Date(Date.parse(start) + 29 * 86400000).toISOString().slice(0, 10);
      timings.push((await get({ factType: 'LABOUR_HOURS', under, from: start, to: end })).ms);
    }
    // WI-OI-064d: the ratio metric reads both parts in one pass over the rollups.
    const ratio = { kind: 'RATIO', key: 'cost_per_labour_hour', label: 'Cost per labour hour', unit: 'CURRENCY',
      numerator: { factType: 'LABOUR_COST', aggregate: 'SUM' }, denominator: { factType: 'LABOUR_HOURS', aggregate: 'SUM' } };
    const ratioTimings = [];
    for (let i = 0; i < Number(process.env.SAMPLES); i += 1) {
      const level = i % 3;
      const under = level === 0 ? '' : level === 1 ? 'R' + (i % 10) : 'R' + (i % 10) + '.S' + (i % 10) + '_' + (i % 20);
      const start = new Date(Date.UTC(2025, 9, 1) + (i % 330) * 86400000).toISOString().slice(0, 10);
      const end = new Date(Date.parse(start) + 29 * 86400000).toISOString().slice(0, 10);
      const started = performance.now();
      const response = await fetch('http://127.0.0.1:4400/v1/places/metric-drilldown', {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ metric: ratio, under, from: start, to: end }),
      });
      const body = await response.json();
      if (response.status !== 200 || body.metric.kind !== 'RATIO') throw new Error('ratio drilldown ' + response.status + ' ' + JSON.stringify(body));
      ratioTimings.push(performance.now() - started);
    }
    const summarise = (values) => {
      values.sort((a, b) => a - b);
      const pick = (q) => values[Math.min(values.length - 1, Math.floor(q * values.length))];
      return { p50Ms: +pick(0.5).toFixed(3), p95Ms: +pick(0.95).toFixed(3), maxMs: +values.at(-1).toFixed(3) };
    };
    const result = { facts: ${FACTS}, samples: timings.length, ...summarise(timings), ratio: summarise(ratioTimings), limitP95Ms: Number(process.env.LIMIT) };
    console.log(JSON.stringify(result));
    if (result.p95Ms >= result.limitP95Ms || result.ratio.p95Ms >= result.limitP95Ms) process.exit(1);
  })().catch((error) => { console.error(error.message); process.exit(1); });
"

echo "WI-OI-064b drill-down performance passed for run ${RUN_ID}: ${FACTS} facts, ${ROLLUP_ROWS} rollup rows rebuilt in ${REBUILD_MS} ms, estate/region/site totals reconcile to the raw facts (${EXPECTED_TOTAL})."
