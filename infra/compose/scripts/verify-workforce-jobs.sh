#!/usr/bin/env bash
set -euo pipefail

# WI-OI-065 job profiles, positions and engagements certification against the running Workforce API
# (workforce-jobs.mjs runs inside the container). Creates run-scoped records under two tenants
# (wi-oi-065-cert-*): effective-dated revisions and as-of reads; overlap refusal by the database; engagement
# windows, end and withdrawal; exact place scope; restart persistence; tenant B denied; evidence rows.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
BASE_ENV="${COMPOSE_DIR}/.env"
WORKFORCE_ENV="${COMPOSE_DIR}/.env.workforce"

read_value() {
  local file="$1" key="$2" value
  value="$(awk -v key="${key}" 'index($0, key "=") == 1 { print substr($0, length(key) + 2); exit }' "${file}")"
  if [[ -z "${value}" ]]; then
    echo "Error: ${key} is missing from ${file}." >&2
    exit 1
  fi
  printf '%s' "${value}"
}

fail() {
  echo "Error: $*" >&2
  exit 1
}

# sign_context TENANT SESSION [SPATIAL_SCOPE_JSON]
sign_context() {
  PRIVATE_KEY_BASE64="${PRIVATE_KEY_BASE64}" TENANT="$1" SESSION="$2" SPATIAL_SCOPE="${3-}" node -e '
    const { createPrivateKey, randomUUID, sign } = require("node:crypto");
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: "gigalibs-control-plane", aud: "gigalibs-workforce-api", sub: "wi-oi-065-certifier",
      tenant_id: process.env.TENANT, session_id: process.env.SESSION, auth_version: 1, roles: ["TENANT_ADMIN"],
      granted_scopes: ["workforce:*"], persona_type: "OPERATIONS_SUPERVISOR", org_scope: { mode: "FLAT_TENANT" },
      entitlement: { module_key: "gigaops", status: "ENABLED", version: "wi-oi-065" },
      iat: now, exp: now + 900, jti: randomUUID(),
    };
    if (process.env.SPATIAL_SCOPE) payload.spatial_scope = JSON.parse(process.env.SPATIAL_SCOPE);
    const data = `${encode({ alg: "EdDSA", typ: "JWT" })}.${encode(payload)}`;
    const key = createPrivateKey({ key: Buffer.from(process.env.PRIVATE_KEY_BASE64, "base64"), format: "der", type: "pkcs8" });
    process.stdout.write(`${data}.${sign(null, Buffer.from(data), key).toString("base64url")}`);
  '
}

workforce_container() {
  docker ps -q --filter label=com.docker.compose.service=workforce-api --filter status=running | head -1
}

run_phase() {
  docker exec -i \
    -e "PHASE=$1" -e "RUN=${RUN_ID}" -e "IDS=${IDS}" -e "SITE_X=${SITE_X}" -e "SITE_Y=${SITE_Y}" \
    -e "TOKEN_A=${TOKEN_A}" -e "TOKEN_B=${TOKEN_B}" -e "TOKEN_PLACE=${TOKEN_PLACE}" \
    "$(workforce_container)" node --input-type=module - <"${SCRIPT_DIR}/workforce-jobs.mjs"
}

sql() {
  docker exec -i "${POSTGRES_CONTAINER}" psql -U "${ADMIN_USER}" -d "${DATABASE_NAME}" -At -v ON_ERROR_STOP=1 -q "$@"
}

wait_until_healthy() {
  for _ in $(seq 1 60); do
    [[ "$(docker inspect --format '{{.State.Health.Status}}' "$1")" == "healthy" ]] && return 0
    sleep 2
  done
  fail "$1 did not become healthy after restart."
}

for file in "${BASE_ENV}" "${WORKFORCE_ENV}"; do
  [[ -f "${file}" ]] || fail "${file} is required."
done

PRIVATE_KEY_BASE64="$(read_value "${WORKFORCE_ENV}" WORKFORCE_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64)"
POSTGRES_CONTAINER="$(read_value "${BASE_ENV}" CONTROL_POSTGRES_CONTAINER)"
ADMIN_USER="$(read_value "${BASE_ENV}" CONTROL_DB_USER)"
DATABASE_NAME="$(SOURCE_URL="$(read_value "${WORKFORCE_ENV}" WORKFORCE_MIGRATIONS_DATABASE_URL)" node -e 'process.stdout.write(new URL(process.env.SOURCE_URL).pathname.slice(1))')"
[[ -n "$(workforce_container)" ]] || fail "the Workforce API container is not running."

RUN_ID="$(date -u +'%Y%m%dT%H%M%SZ')"
TENANT_A="wi-oi-065-cert-a-${RUN_ID}"
TENANT_B="wi-oi-065-cert-b-${RUN_ID}"
SITE_X="$(node -e 'process.stdout.write(require("node:crypto").randomUUID())')"
SITE_Y="$(node -e 'process.stdout.write(require("node:crypto").randomUUID())')"
TOKEN_A="$(sign_context "${TENANT_A}" jobs-a)"
TOKEN_B="$(sign_context "${TENANT_B}" jobs-b)"
TOKEN_PLACE="$(sign_context "${TENANT_A}" jobs-place "{\"mode\":\"SCOPED_PLACES\",\"place_ids\":[\"${SITE_Y}\"]}")"

IDS='{}'
IDS="$(run_phase create)" || fail "jobs create phase failed."

CONTAINER_ID="$(workforce_container)"
docker restart "${CONTAINER_ID}" >/dev/null
wait_until_healthy "${CONTAINER_ID}"
[[ "$(run_phase verify)" == "verified" ]] || fail "jobs verify phase failed."

CONSTRAINTS="$(sql -c "SELECT count(*) FROM pg_constraint WHERE contype = 'x' AND connamespace = 'gigalibs_workforce'::regnamespace AND conname IN ('engagements_one_incumbent', 'job_profile_revisions_no_overlap');")"
[[ "${CONSTRAINTS}" == "2" ]] || fail "expected the two job exclusion constraints, found ${CONSTRAINTS}."
AUDIT_A="$(sql -c "SELECT count(*) FROM gigalibs_workforce.audit_events WHERE tenant_id = '${TENANT_A}' AND action LIKE 'WORKFORCE_%' AND entity_type IN ('WORKFORCE_JOB_PROFILE', 'WORKFORCE_POSITION', 'WORKFORCE_ENGAGEMENT');")"
OUTBOX_A="$(sql -c "SELECT count(*) FROM gigalibs_workforce.outbox_events WHERE tenant_id = '${TENANT_A}' AND aggregate_type IN ('WORKFORCE_JOB_PROFILE', 'WORKFORCE_POSITION', 'WORKFORCE_ENGAGEMENT');")"
EVIDENCE_B="$(sql -c "SELECT (SELECT count(*) FROM gigalibs_workforce.audit_events WHERE tenant_id = '${TENANT_B}') + (SELECT count(*) FROM gigalibs_workforce.positions WHERE tenant_id = '${TENANT_B}');")"
[[ "${AUDIT_A}" == "13" && "${OUTBOX_A}" == "13" ]] || fail "tenant A job audit ${AUDIT_A} and outbox ${OUTBOX_A} must both be 13 (2 profile, 4 position, 7 engagement facts)."
[[ "${EVIDENCE_B}" == "0" ]] || fail "tenant B wrote ${EVIDENCE_B} rows."
UNFORCED="$(sql -c "SELECT count(*) FROM pg_class WHERE relnamespace = 'gigalibs_workforce'::regnamespace AND relname IN ('job_profiles', 'job_profile_revisions', 'positions', 'engagements') AND NOT (relrowsecurity AND relforcerowsecurity);")"
[[ "${UNFORCED}" == "0" ]] || fail "${UNFORCED} job table(s) lack forced row-level security."

echo "WI-OI-065 jobs verification passed for run ${RUN_ID}: effective-dated profile (revision closes the prior one, back-dated and stale revisions refused, as-of titles), required capabilities resolved; positions at two sites (before-profile and duplicate refused); one incumbent per position enforced by the database, TEAM refused, windows and FTE enforced, end then successor the next day, future engagement withdrawn and reused; as-of incumbents and vacancies; exact place scope; restart persistence; tenant B denied 8 reads/writes; ${AUDIT_A} audit = outbox facts; forced RLS on the four job tables."
