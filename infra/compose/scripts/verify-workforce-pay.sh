#!/usr/bin/env bash
set -euo pipefail

# WI-OI-070 pay readiness certification against the running Workforce API (workforce-pay.mjs runs inside the
# container). Run-scoped tenants wi-oi-070-cert-*: a Californian and an Indian week entered as corrections and
# approved four-eyes; reference packs; rate history (overlap and back-dating refused); missing rate refused; golden
# lines and totals; request-key replay; one live run per week; self-approval refused; void and an identical
# recalculation; approval final; a post-approval rate change leaves the run and its verification unchanged;
# place-scoped members and tenant B refused; restart persistence; database evidence that earning lines are
# append-only, an approved run is immutable for the runtime role and the owner, and lines sum to the totals.

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

# sign_context TENANT SUBJECT SCOPES_JSON [SPATIAL_SCOPE_JSON]
sign_context() {
  PRIVATE_KEY_BASE64="${PRIVATE_KEY_BASE64}" TENANT="$1" SUBJECT="$2" SCOPES="$3" SPATIAL="${4-}" node -e '
    const { createPrivateKey, randomUUID, sign } = require("node:crypto");
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: "gigalibs-control-plane", aud: "gigalibs-workforce-api", sub: process.env.SUBJECT,
      tenant_id: process.env.TENANT, session_id: `session-${process.env.SUBJECT}`, auth_version: 1, roles: ["MEMBER"],
      granted_scopes: JSON.parse(process.env.SCOPES), persona_type: "OPERATIONS_SUPERVISOR", org_scope: { mode: "FLAT_TENANT" },
      entitlement: { module_key: "gigaops", status: "ENABLED", version: "wi-oi-070" },
      iat: now, exp: now + 900, jti: randomUUID(),
    };
    if (process.env.SPATIAL) payload.spatial_scope = JSON.parse(process.env.SPATIAL);
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
    -e "PHASE=$1" -e "RUN=${RUN_ID}" -e "IDS=${IDS}" -e "TOKENS=${TOKENS}" -e "PERIOD_START=${PERIOD_START}" \
    -e "W1_SUBJECT=${W1}" -e "W2_SUBJECT=${W2}" \
    "$(workforce_container)" node --input-type=module - <"${SCRIPT_DIR}/workforce-pay.mjs"
}

sql() {
  docker exec -i "${POSTGRES_CONTAINER}" psql -U "${ADMIN_USER}" -d "${DATABASE_NAME}" -At -v ON_ERROR_STOP=1 -q "$@"
}

runtime_sql() {
  docker exec -i -e "PGPASSWORD=${RUNTIME_PASSWORD}" "${POSTGRES_CONTAINER}" \
    psql -h 127.0.0.1 -U "${RUNTIME_USER}" -d "${DATABASE_NAME}" -v ON_ERROR_STOP=1 -q "$@"
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
[[ -n "$(workforce_container)" ]] || fail "the Workforce API container is not running."

PRIVATE_KEY_BASE64="$(read_value "${WORKFORCE_ENV}" WORKFORCE_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64)"
POSTGRES_CONTAINER="$(read_value "${BASE_ENV}" CONTROL_POSTGRES_CONTAINER)"
ADMIN_USER="$(read_value "${BASE_ENV}" CONTROL_DB_USER)"
RUNTIME_URL="$(read_value "${WORKFORCE_ENV}" WORKFORCE_DATABASE_URL)"
DATABASE_NAME="$(SOURCE_URL="$(read_value "${WORKFORCE_ENV}" WORKFORCE_MIGRATIONS_DATABASE_URL)" node -e 'process.stdout.write(new URL(process.env.SOURCE_URL).pathname.slice(1))')"
RUNTIME_USER="$(SOURCE_URL="${RUNTIME_URL}" node -e 'process.stdout.write(decodeURIComponent(new URL(process.env.SOURCE_URL).username))')"
RUNTIME_PASSWORD="$(SOURCE_URL="${RUNTIME_URL}" node -e 'process.stdout.write(decodeURIComponent(new URL(process.env.SOURCE_URL).password))')"

RUN_ID="$(date -u +'%Y%m%dT%H%M%SZ')"
TENANT_A="wi-oi-070-cert-a-${RUN_ID}"
TENANT_B="wi-oi-070-cert-b-${RUN_ID}"
PERIOD_START="$(node -e 'const d=new Date(Date.now()-21*86400000);d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));process.stdout.write(d.toISOString().slice(0,10))')"
W1="wi-oi-070-ca-${RUN_ID}"
W2="wi-oi-070-in-${RUN_ID}"
WORKER='["workforce.time.punch"]'
TOKENS="$(
  ADMIN="$(sign_context "${TENANT_A}" "wi-oi-070-admin-${RUN_ID}" '["workforce:*"]')" \
  W1T="$(sign_context "${TENANT_A}" "${W1}" "${WORKER}")" \
  W2T="$(sign_context "${TENANT_A}" "${W2}" "${WORKER}")" \
  MGR="$(sign_context "${TENANT_A}" "wi-oi-070-mgr-${RUN_ID}" '["workforce.time.read","workforce.time.manage","workforce.timesheets.approve","workforce.pay.read","workforce.pay.manage","workforce.pay.approve"]')" \
  APPROVER="$(sign_context "${TENANT_A}" "wi-oi-070-approver-${RUN_ID}" '["workforce.pay.read","workforce.pay.approve"]')" \
  SCOPED="$(sign_context "${TENANT_A}" "wi-oi-070-scoped-${RUN_ID}" '["workforce.pay.read"]' '{"mode":"SCOPED_PLACES","place_ids":["00000000-0000-4000-8000-000000000001"]}')" \
  ADMIN_B="$(sign_context "${TENANT_B}" "wi-oi-070-admin-b-${RUN_ID}" '["workforce:*"]')" \
  node -e 'const e=process.env;process.stdout.write(JSON.stringify({admin:e.ADMIN,w1:e.W1T,w2:e.W2T,mgr:e.MGR,approver:e.APPROVER,scoped:e.SCOPED,admin_b:e.ADMIN_B}))'
)"

IDS='{}'
IDS="$(run_phase create)" || fail "pay readiness journey failed."
APPROVED="$(IDS="${IDS}" node -e 'process.stdout.write(JSON.parse(process.env.IDS).approvedId)')"

CONTAINER_ID="$(workforce_container)"
docker restart "${CONTAINER_ID}" >/dev/null
wait_until_healthy "${CONTAINER_ID}"
[[ "$(run_phase verify)" == "verified" ]] || fail "post-restart phase failed."

# Earning lines are append-only; an approved run is immutable for the runtime role and the schema owner.
if runtime_sql -c "BEGIN; SET LOCAL app.tenant_id = '${TENANT_A}'; UPDATE gigalibs_workforce.earning_lines SET amount_minor = 0; COMMIT;" >/dev/null 2>&1; then
  fail "the runtime role changed earning lines."
fi
if runtime_sql -c "BEGIN; SET LOCAL app.tenant_id = '${TENANT_A}'; DELETE FROM gigalibs_workforce.earning_lines; COMMIT;" >/dev/null 2>&1; then
  fail "the runtime role deleted earning lines."
fi
if runtime_sql -c "BEGIN; SET LOCAL app.tenant_id = '${TENANT_A}'; UPDATE gigalibs_workforce.pay_runs SET digest = repeat('0', 64) WHERE id = '${APPROVED}'; COMMIT;" >/dev/null 2>&1; then
  fail "the runtime role changed an approved pay run."
fi
if sql -c "UPDATE gigalibs_workforce.pay_runs SET status = 'VOIDED', void_reason = 'forced', approved_by = NULL, approved_at = NULL WHERE id = '${APPROVED}';" >/dev/null 2>&1; then
  fail "the schema owner voided an approved pay run."
fi
EXPORT_ID="$(IDS="${IDS}" node -e 'process.stdout.write(JSON.parse(process.env.IDS).exportId)')"
if runtime_sql -c "BEGIN; SET LOCAL app.tenant_id = '${TENANT_A}'; UPDATE gigalibs_workforce.pay_exports SET content = content || 'x' WHERE id = '${EXPORT_ID}'; COMMIT;" >/dev/null 2>&1; then
  fail "the runtime role rewrote an export file."
fi
if sql -c "DELETE FROM gigalibs_workforce.pay_exports WHERE id = '${EXPORT_ID}';" >/dev/null 2>&1; then
  fail "the schema owner deleted an export."
fi
REFUSED="$(sql -c "SELECT count(*) FROM gigalibs_workforce.audit_events WHERE tenant_id = '${TENANT_A}' AND action = 'WORKFORCE_PAY_EXPORT_RECONCILIATION_FAILED';")"
[[ "${REFUSED}" == "2" ]] || fail "expected 2 audited reconciliation refusals, found ${REFUSED}."
RECONCILED="$(sql -c "SELECT bool_and(t.amount = COALESCE(l.amount, 0)) FROM (SELECT x->>'currency' AS currency, (x->>'amountMinor')::bigint AS amount FROM gigalibs_workforce.pay_runs r, jsonb_array_elements(r.totals) x WHERE r.id = '${APPROVED}') t LEFT JOIN (SELECT currency, SUM(amount_minor) AS amount FROM gigalibs_workforce.earning_lines WHERE tenant_id = '${TENANT_A}' AND run_id = '${APPROVED}' GROUP BY currency) l ON l.currency = t.currency;")"
[[ "${RECONCILED}" == "t" ]] || fail "earning lines do not sum to the run totals."
TYPES="'WORKFORCE_PAY_RATE', 'WORKFORCE_PAY_RUN', 'WORKFORCE_PAY_EXPORT'"
AUDIT="$(sql -c "SELECT count(*) FROM gigalibs_workforce.audit_events WHERE tenant_id = '${TENANT_A}' AND entity_type IN (${TYPES}) AND action <> 'WORKFORCE_PAY_EXPORT_RECONCILIATION_FAILED';")"
OUTBOX="$(sql -c "SELECT count(*) FROM gigalibs_workforce.outbox_events WHERE tenant_id = '${TENANT_A}' AND aggregate_type IN (${TYPES});")"
[[ "${AUDIT}" == "${OUTBOX}" && "${AUDIT}" != "0" ]] || fail "pay audit ${AUDIT} and outbox ${OUTBOX} differ."
EVIDENCE_B="$(sql -c "SELECT (SELECT count(*) FROM gigalibs_workforce.pay_rates WHERE tenant_id = '${TENANT_B}') + (SELECT count(*) FROM gigalibs_workforce.pay_runs WHERE tenant_id = '${TENANT_B}');")"
[[ "${EVIDENCE_B}" == "0" ]] || fail "tenant B wrote ${EVIDENCE_B} pay rows."

echo "WI-OI-070 pay readiness verification passed for run ${RUN_ID} (week ${PERIOD_START}): reference packs US-CA-OT@1 and IN-48@1; rate history with overlap and back-dating refused; missing rate refused; golden lines (15) and totals (USD 1,040.00, INR 12,000.00) with the seventh-day and weekly-overtime rules traced; request-key replay; one live run per week; self-approval refused; void and an identical recalculation; approval final; a post-approval mid-week rate change left the run and its verification unchanged; place-scoped member and tenant B refused; restart persistence; earning lines append-only; approved run immutable for the runtime role and the schema owner; lines reconcile to totals; payroll export (WI-OI-071) created once, file digest and 15 rows verified, reconciled line by line, creator confirmation and two mismatched imports refused and audited, confirmed by a second person, file immutable for the runtime role and never deleted; ${AUDIT} audit = outbox facts."
