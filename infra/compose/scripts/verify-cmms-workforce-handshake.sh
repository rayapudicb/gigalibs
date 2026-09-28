#!/usr/bin/env bash
set -euo pipefail

# WI-OI-068 CMMS ↔ Workforce handshake certification (ADR-0007 option A) against the running CMMS and Workforce
# APIs (cmms-workforce-handshake.mjs runs inside the CMMS container). Run-scoped tenants wi-oi-068-cert-*:
#   staffing request → Workforce requirement → booking → CMMS projection; unknown capability refused with a
#   reason; work-order cancellation cascades; a withdrawn request is never resurrected; one live request per
#   work order; direct inbox redelivery is a duplicate and a stale version never overwrites; relay and user
#   tokens are mutually refused, as are wrong audience, wrong source, tenant mismatch, tampered body and a
#   forged key; outbox replay in both directions repeats no effect; restart persistence; tenant B denied.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${COMPOSE_DIR}/../.." && pwd)"
BASE_ENV="${COMPOSE_DIR}/.env"
MODULE_ENV="${COMPOSE_DIR}/.env.modules"
WORKFORCE_ENV="${COMPOSE_DIR}/.env.workforce"
AUTH_CORE="${REPO_ROOT}/packages/auth-core/dist/index.js"

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

# sign_context KEY_BASE64 AUDIENCE MODULE_KEY SCOPE TENANT SESSION
sign_context() {
  PRIVATE_KEY_BASE64="$1" AUDIENCE="$2" MODULE_KEY="$3" SCOPE="$4" TENANT="$5" SESSION="$6" node -e '
    const { createPrivateKey, randomUUID, sign } = require("node:crypto");
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: "gigalibs-control-plane", aud: process.env.AUDIENCE, sub: "wi-oi-068-handshake-certifier",
      tenant_id: process.env.TENANT, session_id: process.env.SESSION, auth_version: 1, roles: ["TENANT_ADMIN"],
      granted_scopes: [process.env.SCOPE], persona_type: "OPERATIONS_SUPERVISOR", org_scope: { mode: "FLAT_TENANT" },
      entitlement: { module_key: process.env.MODULE_KEY, status: "ENABLED", version: "wi-oi-068" },
      iat: now, exp: now + 900, jti: randomUUID(),
    };
    const data = `${encode({ alg: "EdDSA", typ: "JWT" })}.${encode(payload)}`;
    const key = createPrivateKey({ key: Buffer.from(process.env.PRIVATE_KEY_BASE64, "base64"), format: "der", type: "pkcs8" });
    process.stdout.write(`${data}.${sign(null, Buffer.from(data), key).toString("base64url")}`);
  '
}

container() {
  docker ps -q --filter "label=com.docker.compose.service=$1" --filter status=running | head -1
}

run_phase() {
  docker exec -i \
    -e "PHASE=$1" -e "RUN=${RUN_ID}" -e "IDS=${IDS}" -e "DELIVERIES=${DELIVERIES}" \
    -e "CMMS_TOKEN_A=${CMMS_TOKEN_A}" -e "CMMS_TOKEN_B=${CMMS_TOKEN_B}" \
    -e "WORKFORCE_TOKEN_A=${WORKFORCE_TOKEN_A}" -e "WORKFORCE_TOKEN_B=${WORKFORCE_TOKEN_B}" \
    "$(container cmms-api)" node --input-type=module - <"${SCRIPT_DIR}/cmms-workforce-handshake.mjs"
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

# wait_for "label" SQL expected
wait_for() {
  for _ in $(seq 1 90); do
    [[ "$(sql -c "$2")" == "$3" ]] && return 0
    sleep 1
  done
  fail "$1: expected $3, found $(sql -c "$2")."
}

for file in "${BASE_ENV}" "${MODULE_ENV}" "${WORKFORCE_ENV}" "${AUTH_CORE}"; do
  [[ -f "${file}" ]] || fail "${file} is required."
done
[[ -n "$(container cmms-api)" ]] || fail "the CMMS API container is not running."
[[ -n "$(container workforce-api)" ]] || fail "the Workforce API container is not running."

POSTGRES_CONTAINER="$(read_value "${BASE_ENV}" CONTROL_POSTGRES_CONTAINER)"
ADMIN_USER="$(read_value "${BASE_ENV}" CONTROL_DB_USER)"
DATABASE_NAME="$(SOURCE_URL="$(read_value "${MODULE_ENV}" MODULE_MIGRATIONS_DATABASE_URL)" node -e 'process.stdout.write(new URL(process.env.SOURCE_URL).pathname.slice(1))')"
CMMS_KEY="$(read_value "${MODULE_ENV}" CMMS_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64)"
WORKFORCE_KEY="$(read_value "${WORKFORCE_ENV}" WORKFORCE_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64)"
CMMS_INBOX_SIGNING_KEY="$(read_value "${WORKFORCE_ENV}" CMMS_INBOX_RELAY_PRIVATE_KEY_BASE64)"

RUN_ID="$(date -u +'%Y%m%dT%H%M%SZ')"
TENANT_A="wi-oi-068-cert-a-${RUN_ID}"
TENANT_B="wi-oi-068-cert-b-${RUN_ID}"
CMMS_TOKEN_A="$(sign_context "${CMMS_KEY}" gigalibs-cmms-api asset-maintenance 'cmms:*' "${TENANT_A}" handshake-cmms-a)"
CMMS_TOKEN_B="$(sign_context "${CMMS_KEY}" gigalibs-cmms-api asset-maintenance 'cmms:*' "${TENANT_B}" handshake-cmms-b)"
WORKFORCE_TOKEN_A="$(sign_context "${WORKFORCE_KEY}" gigalibs-workforce-api gigaops 'workforce:*' "${TENANT_A}" handshake-wf-a)"
WORKFORCE_TOKEN_B="$(sign_context "${WORKFORCE_KEY}" gigalibs-workforce-api gigaops 'workforce:*' "${TENANT_B}" handshake-wf-b)"

# Phase 1: the end-to-end journey.
IDS='{}'
DELIVERIES='{}'
IDS="$(run_phase create)" || fail "handshake journey failed."
id_of() { IDS="${IDS}" node -e "process.stdout.write(JSON.parse(process.env.IDS).$1)"; }
WO1="$(id_of wo1)"
BOOKING_ID="$(id_of bookingId)"

# Phase 2: direct inbox deliveries signed on the host (the peer key never enters a container).
DELIVERIES="$(AUTH_CORE="${AUTH_CORE}" KEY="${CMMS_INBOX_SIGNING_KEY}" IDS="${IDS}" TENANT_A="${TENANT_A}" TENANT_B="${TENANT_B}" node --input-type=module -e '
  import { createPrivateKey, generateKeyPairSync, randomUUID } from "node:crypto";
  const { signRelayToken } = await import(process.env.AUTH_CORE);
  const ids = JSON.parse(process.env.IDS);
  const pem = createPrivateKey({ key: Buffer.from(process.env.KEY, "base64"), format: "der", type: "pkcs8" }).export({ format: "pem", type: "pkcs8" }).toString();
  const envelope = {
    messageId: randomUUID(), tenantId: process.env.TENANT_A, eventType: "WORKFORCE_RESOURCE_BOOKING_STATUS_CHANGED_V1",
    aggregateType: "WORKFORCE_BOOKING", aggregateId: ids.bookingId, aggregateVersion: 1, correlationId: "wi-oi-068-direct",
    causationId: null, schemaVersion: 1,
    payload: { sourceType: "CMMS_WORK_ORDER", sourceRef: ids.wo1, requirementId: ids.requirementId, resourceId: ids.personId,
      resourceName: "Stale", startsAt: "2026-11-02T08:00:00.000Z", endsAt: "2026-11-02T12:00:00.000Z", from: "CONFIRMED", to: "DRAFT" },
    occurredAt: new Date().toISOString(),
  };
  const body = JSON.stringify(envelope);
  const token = (overrides = {}, key = pem, signedBody = body) => signRelayToken({
    audience: "gigalibs-cmms-inbox", source: "workforce", tenantId: envelope.tenantId, messageId: envelope.messageId, body: signedBody, ...overrides,
  }, key);
  const foreign = generateKeyPairSync("ed25519").privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  process.stdout.write(JSON.stringify({
    stale: { body, token: token() },
    wrongAudience: { body, token: token({ audience: "gigalibs-workforce-inbox" }) },
    wrongSource: { body, token: token({ source: "cmms" }) },
    tenantMismatch: { body, token: token({ tenantId: process.env.TENANT_B }) },
    tampered: { body: JSON.stringify({ ...envelope, aggregateVersion: 99 }), token: token() },
    forged: { body, token: token({}, foreign) },
  }));
')"
[[ "$(run_phase inbox)" == "inbox-verified" ]] || fail "direct inbox phase failed."

# Phase 3: outbox replay in both directions repeats no effect.
REQUEST_ROW="$(sql -c "SELECT id FROM gigalibs_cmms.outbox_events WHERE tenant_id = '${TENANT_A}' AND event_type = 'CMMS_STAFFING_REQUESTED_V1' AND payload->>'workOrderId' = '${WO1}';")"
BOOKING_ROW="$(sql -c "SELECT id FROM gigalibs_workforce.outbox_events WHERE tenant_id = '${TENANT_A}' AND event_type = 'WORKFORCE_RESOURCE_BOOKING_CREATED_V1' AND aggregate_id = '${BOOKING_ID}';")"
[[ -n "${REQUEST_ROW}" && -n "${BOOKING_ROW}" ]] || fail "the relayed outbox rows were not found."
sql -c "UPDATE gigalibs_cmms.outbox_events SET status = 'PENDING', available_at = now(), published_at = NULL WHERE id = '${REQUEST_ROW}';
        UPDATE gigalibs_workforce.outbox_events SET status = 'PENDING', available_at = now(), published_at = NULL WHERE id = '${BOOKING_ROW}';" >/dev/null
wait_for "CMMS replay republished" "SELECT status FROM gigalibs_cmms.outbox_events WHERE id = '${REQUEST_ROW}';" PUBLISHED
wait_for "Workforce replay republished" "SELECT status FROM gigalibs_workforce.outbox_events WHERE id = '${BOOKING_ROW}';" PUBLISHED
REQUIREMENTS="$(sql -c "SELECT count(*) FROM gigalibs_workforce.work_requirements WHERE tenant_id = '${TENANT_A}' AND source_ref = '${WO1}';")"
[[ "${REQUIREMENTS}" == "1" ]] || fail "replaying the staffing request produced ${REQUIREMENTS} requirements."
RECEIPTS="$(sql -c "SELECT (SELECT count(*) FROM gigalibs_workforce.inbox_receipts WHERE tenant_id = '${TENANT_A}' AND message_id = '${REQUEST_ROW}') || ':' || (SELECT count(*) FROM gigalibs_cmms.inbox_receipts WHERE tenant_id = '${TENANT_A}' AND message_id = '${BOOKING_ROW}');")"
[[ "${RECEIPTS}" == "1:1" ]] || fail "replayed messages hold ${RECEIPTS} receipts; expected 1:1."
PROJECTION="$(sql -c "SELECT status || ':' || source_version FROM gigalibs_cmms.work_order_bookings WHERE tenant_id = '${TENANT_A}' AND booking_ref = '${BOOKING_ID}';")"
[[ "${PROJECTION}" == "CONFIRMED:2" ]] || fail "the replayed booking fact changed the projection to ${PROJECTION}."

# Phase 4: both modules restart; state persists and the relays resume.
for service in cmms-api workforce-api; do
  CONTAINER_ID="$(container "${service}")"
  docker restart "${CONTAINER_ID}" >/dev/null
  wait_until_healthy "${CONTAINER_ID}"
done
[[ "$(run_phase verify)" == "verified" ]] || fail "post-restart phase failed."

# Database evidence.
UNSETTLED="$(sql -c "SELECT (SELECT count(*) FROM gigalibs_cmms.outbox_events WHERE tenant_id = '${TENANT_A}' AND event_type LIKE 'CMMS_STAFFING_%' AND status <> 'PUBLISHED') + (SELECT count(*) FROM gigalibs_workforce.outbox_events WHERE tenant_id = '${TENANT_A}' AND payload->>'sourceType' = 'CMMS_WORK_ORDER' AND status <> 'PUBLISHED');")"
[[ "${UNSETTLED}" == "0" ]] || fail "${UNSETTLED} handshake fact(s) were not delivered."
LIVE="$(sql -c "SELECT count(*) FROM (SELECT work_order_id FROM gigalibs_cmms.work_order_staffing WHERE tenant_id = '${TENANT_A}' AND status IN ('REQUESTED', 'ACCEPTED') GROUP BY 1 HAVING count(*) > 1) duplicated;")"
[[ "${LIVE}" == "0" ]] || fail "${LIVE} work order(s) hold more than one live staffing request."
FAILED="$(sql -c "SELECT string_agg(DISTINCT last_error_code, ',') FROM gigalibs_cmms.inbox_receipts WHERE tenant_id = '${TENANT_A}' AND status <> 'PROCESSED';")"
[[ -z "${FAILED}" ]] || fail "CMMS inbox refused Workforce facts: ${FAILED}."
REFUSED="$(sql -c "SELECT string_agg(DISTINCT last_error_code, ',') FROM gigalibs_workforce.inbox_receipts WHERE tenant_id = '${TENANT_A}' AND status <> 'PROCESSED';")"
[[ "${REFUSED}" == "WORKFORCE_CAPABILITY_UNKNOWN" ]] || fail "Workforce refusals were ${REFUSED:-none}; expected only the unknown capability."
# Per work order, each consumer received facts in the order the producer recorded them.
OUT_OF_ORDER="$(sql -c "
  SELECT count(*) FROM (
    SELECT rank() OVER (PARTITION BY o.payload->>'workOrderId' ORDER BY o.created_at, o.id) AS produced,
           rank() OVER (PARTITION BY o.payload->>'workOrderId' ORDER BY r.received_at, r.id) AS consumed
      FROM gigalibs_cmms.outbox_events o
      JOIN gigalibs_workforce.inbox_receipts r ON r.tenant_id = o.tenant_id AND r.message_id = o.id
     WHERE o.tenant_id = '${TENANT_A}' AND o.event_type LIKE 'CMMS_STAFFING_%'
    UNION ALL
    SELECT rank() OVER (PARTITION BY o.payload->>'sourceRef' ORDER BY o.created_at, o.id),
           rank() OVER (PARTITION BY o.payload->>'sourceRef' ORDER BY r.received_at, r.id)
      FROM gigalibs_workforce.outbox_events o
      JOIN gigalibs_cmms.inbox_receipts r ON r.tenant_id = o.tenant_id AND r.message_id = o.id
     WHERE o.tenant_id = '${TENANT_A}' AND o.payload->>'sourceType' = 'CMMS_WORK_ORDER'
  ) ranked WHERE produced <> consumed;")"
[[ "${OUT_OF_ORDER}" == "0" ]] || fail "${OUT_OF_ORDER} fact(s) reached their consumer out of order."
ORPHANS="$(sql -c "SELECT count(*) FROM gigalibs_workforce.work_requirements q JOIN gigalibs_cmms.work_order_staffing s ON s.tenant_id = q.tenant_id AND s.request_key = q.request_key WHERE q.tenant_id = '${TENANT_A}' AND q.status <> 'CANCELLED' AND s.status = 'CANCELLED';")"
[[ "${ORPHANS}" == "0" ]] || fail "${ORPHANS} Workforce requirement(s) stayed open for withdrawn staffing."
RELAYED="$(sql -c "SELECT count(*) FROM gigalibs_cmms.work_order_events WHERE tenant_id = '${TENANT_A}' AND event_type = 'STAFFING_UPDATED' AND actor_subject = 'relay:workforce';")"
CMMS_RECEIPTS="$(sql -c "SELECT count(*) FROM gigalibs_cmms.inbox_receipts WHERE tenant_id = '${TENANT_A}';")"
WORKFORCE_RECEIPTS="$(sql -c "SELECT count(*) FROM gigalibs_workforce.inbox_receipts WHERE tenant_id = '${TENANT_A}';")"
AUDIT="$(sql -c "SELECT (SELECT count(*) FROM gigalibs_cmms.audit_events WHERE tenant_id = '${TENANT_A}') = (SELECT count(*) FROM gigalibs_cmms.outbox_events WHERE tenant_id = '${TENANT_A}');")"
[[ "${AUDIT}" == "t" ]] || fail "CMMS audit evidence and outbox facts differ for tenant A."
EVIDENCE_B="$(sql -c "SELECT (SELECT count(*) FROM gigalibs_cmms.work_order_staffing WHERE tenant_id = '${TENANT_B}') + (SELECT count(*) FROM gigalibs_cmms.work_order_bookings WHERE tenant_id = '${TENANT_B}') + (SELECT count(*) FROM gigalibs_cmms.inbox_receipts WHERE tenant_id = '${TENANT_B}') + (SELECT count(*) FROM gigalibs_workforce.inbox_receipts WHERE tenant_id = '${TENANT_B}') + (SELECT count(*) FROM gigalibs_cmms.audit_events WHERE tenant_id = '${TENANT_B}');")"
[[ "${EVIDENCE_B}" == "0" ]] || fail "tenant B holds ${EVIDENCE_B} handshake rows."
RELAY_ROLES="$(sql -c "SELECT string_agg(DISTINCT r.rolname, ',' ORDER BY r.rolname) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace CROSS JOIN pg_roles r WHERE n.nspname IN ('gigalibs_cmms', 'gigalibs_workforce') AND p.proname LIKE 'relay\_%' AND NOT r.rolsuper AND r.rolname NOT LIKE 'pg\_%' AND has_function_privilege(r.oid, p.oid, 'EXECUTE');")"
[[ "${RELAY_ROLES}" == "gigalibs_cmms_runtime,gigalibs_workforce_runtime" ]] || fail "unexpected roles can execute the relay functions: ${RELAY_ROLES}."
PUBLIC_EXECUTE="$(sql -c "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname IN ('gigalibs_cmms', 'gigalibs_workforce') AND p.proname LIKE 'relay\_%' AND (p.proacl IS NULL OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'));")"
[[ "${PUBLIC_EXECUTE}" == "0" ]] || fail "${PUBLIC_EXECUTE} relay function(s) are still executable by PUBLIC."
CROSS_EXECUTE="$(sql -c "SELECT has_function_privilege('gigalibs_workforce_runtime', 'gigalibs_cmms.relay_lease_workforce_events(integer, integer)', 'EXECUTE') OR has_function_privilege('gigalibs_cmms_runtime', 'gigalibs_workforce.relay_lease_cmms_events(integer, integer)', 'EXECUTE');")"
[[ "${CROSS_EXECUTE}" == "f" ]] || fail "one module's runtime role can execute the other module's relay lease."
echo "WI-OI-068 handshake verification passed for run ${RUN_ID}: staffing request → Workforce requirement (sourced from the work order, capability resolved) → booking confirmed → CMMS projection without worker master data; unknown capability refused with its reason; one live request per work order; work-order cancellation cascaded to the requirement and booking; a withdrawn request was not resurrected and a new request got its own requirement; direct redelivery a duplicate and a stale version ignored; user contexts refused at both inboxes and relay tokens refused on user routes; wrong audience, wrong source, tenant mismatch, tampered body and forged key refused; outbox replay in both directions repeated no effect (1 requirement, 1:1 receipts, projection CONFIRMED:2); ${CMMS_RECEIPTS} CMMS and ${WORKFORCE_RECEIPTS} Workforce receipts, ${RELAYED} relay-authored work-order events, every handshake fact delivered in per-work-order order with no requirement left open for withdrawn staffing; restart persistence with delivery resumed; tenant B denied and holds no rows; relay functions executable only by their own module's runtime role (PUBLIC revoked)."
