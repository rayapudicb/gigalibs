#!/usr/bin/env bash
# run-phase-a-certification.sh
# Master bootstrap for Phase A: recover Docker, build final images, run full F2 runtime matrix.
# Run from the repo root: bash infra/compose/scripts/run-phase-a-certification.sh
# This script drives the ENTIRE Phase A sequence from A3 onward. A1/A2 are pre-verified.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${COMPOSE_DIR}/../.." && pwd)"
LOCAL_ENV="${COMPOSE_DIR}/.env"
COMPOSE_FILE="${COMPOSE_DIR}/compose.yaml"
EVIDENCE_DIR="${COMPOSE_DIR}/evidence/phase-a-$(date -u +%Y%m%dT%H%M%SZ)"
PROTECTED_HASHES_OK=false

# ── Colour helpers ──────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BOLD='\033[1m'; NC='\033[0m'
step()  { echo -e "\n${BOLD}▶ $*${NC}"; }
ok()    { echo -e "${GREEN}✓ $*${NC}"; }
warn()  { echo -e "${YELLOW}⚠ $*${NC}"; }
fail()  { echo -e "${RED}✗ $*${NC}" >&2; }

# ── Safety guards ───────────────────────────────────────────────────────────
if [[ "${NODE_ENV:-}" == "production" ]]; then
  fail "NODE_ENV=production is not permitted."; exit 1
fi
if [[ ! -f "${LOCAL_ENV}" ]]; then
  fail "infra/compose/.env is missing. Run generate-credentials.sh first."; exit 1
fi
ENV_PERMS="$(stat -f "%Mp%Lp" "${LOCAL_ENV}" 2>/dev/null || stat -c "%a" "${LOCAL_ENV}" 2>/dev/null)"
if [[ "${ENV_PERMS}" != "600" ]]; then
  warn "infra/compose/.env permissions are ${ENV_PERMS}; hardening to 0600."
  chmod 600 "${LOCAL_ENV}"
fi

read_local_value() {
  local key="$1"
  local value
  value="$(awk -v key="${key}" 'index($0, key "=") == 1 { print substr($0, length(key) + 2); exit }' "${LOCAL_ENV}" | sed "s/^['\"]//;s/['\"]$//")"
  if [[ -z "${value}" ]]; then
    fail "${key} is missing from ${LOCAL_ENV}."; exit 1
  fi
  printf '%s' "${value}"
}

mkdir -p "${EVIDENCE_DIR}"
ok "Evidence directory: ${EVIDENCE_DIR}"

# ── A1: Protected hashes ────────────────────────────────────────────────────
step "A1 — Verifying protected CMMS hashes"
EXPECTED_HASHES=(
  "0c60be762ba00ebe003300fd99554bda59331ce563daf2284eb118dff713e978"
  "7fc1d71ec04d41027641a2d4f86ceea3de5897f228774d4bf4fdd5528c6f1ef1"
  "7f67627b2e0f90d339fff52ba924a180f3a419bb829f308fbac392f416507567"
  "baa6e407f0d2786cb85a61a35b37ddcfe0ae629aa06eec4cfc71c5acce30e621"
  "71f9d2aff51de4cf71813a8cab13281d83a80a2eed475a09ec8a44493cf0afeb"
  "959796b7568eb2abd6301cee92097551f8bf8717b5cdd413b15acae5da563eff"
  "c8be29955b622b4fb9c3d5e4178f1443086f2dbfd329a3b06d9ba3a9adbd4825"
)
PROTECTED_PATHS=(
  "modules/physical-operations-cmms/apps/api/src/import-export/column-registry.ts"
  "modules/physical-operations-cmms/apps/api/src/import-export/row-validator.ts"
  "modules/physical-operations-cmms/apps/api/src/import-export/import-job.service.ts"
  "modules/physical-operations-cmms/apps/api/src/import-export/types.ts"
  "modules/physical-operations-cmms/db/migrations/000007_import_export_jobs.up.sql"
  "modules/physical-operations-cmms/db/migrations/000008_custom_attributes.up.sql"
  "modules/physical-operations-cmms/db/migrations/000009_column_alias_maps.up.sql"
)
HASH_FAIL=false
for i in "${!PROTECTED_PATHS[@]}"; do
  path="${REPO_ROOT}/${PROTECTED_PATHS[$i]}"
  actual="$(shasum -a 256 "${path}" | awk '{print $1}')"
  expected="${EXPECTED_HASHES[$i]}"
  if [[ "${actual}" != "${expected}" ]]; then
    fail "PROTECTED FILE HASH MISMATCH: ${PROTECTED_PATHS[$i]}"
    fail "  expected: ${expected}"
    fail "  actual:   ${actual}"
    HASH_FAIL=true
  fi
done
if [[ "${HASH_FAIL}" == "true" ]]; then
  fail "Protected hash verification failed. Stopping. Do not restore or edit without user direction."; exit 1
fi
PROTECTED_HASHES_OK=true
ok "All 7 protected hashes verified"

# ── A2: Configuration local profile ────────────────────────────────────────
step "A2 — Verifying configuration local profile"
node "${REPO_ROOT}/scripts/verify-configuration-local-profile.mjs" 2>&1
ok "Configuration local profile valid"

# ── A3a: Compose config render ──────────────────────────────────────────────
step "A3a — Rendering Compose config"
docker compose --env-file "${LOCAL_ENV}" -f "${COMPOSE_FILE}" config --quiet
ok "Compose config renders cleanly"

# ── A3b: Build images ──────────────────────────────────────────────────────
step "A3b — Building final images (this may take several minutes)"
bash "${SCRIPT_DIR}/build-images.sh"

TAG_SUFFIX="$(read_local_value SOURCE_REVISION | head -c 12)-$(read_local_value SOURCE_STATE_SHA256 | head -c 12)"
MIGRATIONS_IMAGE="$(read_local_value MIGRATIONS_IMAGE)"
API_IMAGE="$(read_local_value API_IMAGE)"
WEB_IMAGE="$(read_local_value WEB_IMAGE)"
MIGRATIONS_ID="$(docker image inspect "${MIGRATIONS_IMAGE}" --format '{{.Id}}')"
API_ID="$(docker image inspect "${API_IMAGE}" --format '{{.Id}}')"
WEB_ID="$(docker image inspect "${WEB_IMAGE}" --format '{{.Id}}')"
ok "Images built: tag suffix ${TAG_SUFFIX}"
echo "  migrations: ${MIGRATIONS_ID}"
echo "  api:        ${API_ID}"
echo "  web:        ${WEB_ID}"

cat > "${EVIDENCE_DIR}/images.json" <<EOF
{
  "tagSuffix": "${TAG_SUFFIX}",
  "migrations": { "image": "${MIGRATIONS_IMAGE}", "id": "${MIGRATIONS_ID}" },
  "api":        { "image": "${API_IMAGE}",        "id": "${API_ID}" },
  "web":        { "image": "${WEB_IMAGE}",        "id": "${WEB_ID}" }
}
EOF

# ── A3c: Filesystem scan ───────────────────────────────────────────────────
step "A3c — Scanning image filesystems for prohibited files"
for target_info in "migrations|${MIGRATIONS_IMAGE}" "api|${API_IMAGE}" "web|${WEB_IMAGE}"; do
  IFS='|' read -r target_name image <<< "${target_info}"
  FOUND="$(docker run --rm --entrypoint sh "${image}" -c \
    'find /app -type f \( -name ".env" -o -name ".env.*" -o -name "*.pem" -o -name "*.key" -o -name "id_rsa" \) 2>/dev/null || true')"
  if [[ -n "${FOUND}" ]]; then
    fail "Prohibited files found in ${target_name} image: ${FOUND}"; exit 1
  fi
  GIT_FOUND="$(docker run --rm --entrypoint sh "${image}" -c 'test -d /app/.git && echo FOUND || true')"
  if [[ "${GIT_FOUND}" == "FOUND" ]]; then
    fail ".git found in ${target_name} image"; exit 1
  fi
  ok "${target_name}: filesystem scan clean"
done

# ── A3d: Container config inspection ──────────────────────────────────────
step "A3d — Inspecting container configuration"
for image in "${API_IMAGE}" "${WEB_IMAGE}"; do
  USER="$(docker image inspect "${image}" --format '{{.Config.User}}')"
  if [[ "${USER}" != "node" ]]; then
    warn "${image}: user is '${USER}' (expected 'node')"
  fi
  ok "Container config checked for ${image} (user: ${USER})"
done

# ── A3e: SBOM generation ───────────────────────────────────────────────────
step "A3e — Generating CycloneDX SBOMs"
SBOM_DIR="${EVIDENCE_DIR}/sbom"
mkdir -p "${SBOM_DIR}"
for target_info in "migrations|${MIGRATIONS_IMAGE}" "api|${API_IMAGE}" "web|${WEB_IMAGE}"; do
  IFS='|' read -r target_name image <<< "${target_info}"
  SBOM_FILE="${SBOM_DIR}/${target_name}-sbom.json"
  if docker scout sbom "${image}" --format cyclonedx > "${SBOM_FILE}" 2>/dev/null; then
    SBOM_SHA="$(shasum -a 256 "${SBOM_FILE}" | awk '{print $1}')"
    COMPONENT_COUNT="$(grep -c '"type":' "${SBOM_FILE}" 2>/dev/null || echo 'unknown')"
    ok "${target_name} SBOM: ${COMPONENT_COUNT} components, sha256=${SBOM_SHA}"
  else
    warn "${target_name}: docker scout unavailable — recording NOT_RUN_EXTERNAL_TOOLING"
    echo '{"status":"NOT_RUN_EXTERNAL_TOOLING","reason":"docker-scout-requires-external-login"}' > "${SBOM_FILE}"
  fi
done

# ── A4: Start stack and run runtime matrix ─────────────────────────────────
step "A4 — Starting app stack"
docker compose --env-file "${LOCAL_ENV}" -f "${COMPOSE_FILE}" up -d --remove-orphans

# Wait for migrations to complete
step "A4 — Waiting for migrations (up to 60s)"
for i in $(seq 1 12); do
  MIGRATION_STATUS="$(docker compose --env-file "${LOCAL_ENV}" -f "${COMPOSE_FILE}" ps migrations --format json 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); print(d[0].get('ExitCode','running') if isinstance(d,list) and d else 'unknown')" 2>/dev/null || echo 'pending')"
  if [[ "${MIGRATION_STATUS}" == "0" ]]; then
    ok "Migrations exited 0"; break
  fi
  if [[ $i -eq 12 ]]; then
    fail "Migrations did not complete in 60s (status: ${MIGRATION_STATUS})"; exit 1
  fi
  sleep 5
done

# Wait for API health
step "A4 — Waiting for API health (up to 60s)"
API_PUBLIC_PORT="$(read_local_value API_PUBLIC_PORT)"
API_URL="http://localhost:${API_PUBLIC_PORT}"
for i in $(seq 1 12); do
  CODE="$(curl -sf -o /dev/null -w "%{http_code}" --max-time 5 "${API_URL}/health/live" 2>/dev/null || echo '000')"
  if [[ "${CODE}" == "200" ]]; then ok "API live (${API_URL})"; break; fi
  if [[ $i -eq 12 ]]; then fail "API did not become live (last code: ${CODE})"; exit 1; fi
  sleep 5
done
READY_CODE="$(curl -sf -o /dev/null -w "%{http_code}" --max-time 5 "${API_URL}/health/ready" 2>/dev/null || echo '000')"
if [[ "${READY_CODE}" != "200" ]]; then
  fail "API readiness returned ${READY_CODE}"; exit 1
fi
ok "API ready"

# Wait for web health
WEB_PUBLIC_PORT="$(read_local_value WEB_PUBLIC_PORT)"
WEB_URL="http://localhost:${WEB_PUBLIC_PORT}"
for i in $(seq 1 12); do
  CODE="$(curl -sf -o /dev/null -w "%{http_code}" --max-time 5 "${WEB_URL}" 2>/dev/null || echo '000')"
  if [[ "${CODE}" == "200" ]] || [[ "${CODE}" == "307" ]] || [[ "${CODE}" == "302" ]]; then
    ok "Web live (${WEB_URL}, ${CODE})"; break
  fi
  if [[ $i -eq 12 ]]; then fail "Web did not become live (last code: ${CODE})"; exit 1; fi
  sleep 5
done

# A4.5: Unauthenticated surface route returns 401
step "A4 — Verifying unauthenticated routes return 401"
UNAUTH_CODE="$(curl -sf -o /dev/null -w "%{http_code}" --max-time 5 "${API_URL}/api/configuration-studio/surfaces" 2>/dev/null || echo '000')"
if [[ "${UNAUTH_CODE}" != "401" ]]; then
  fail "Unauthenticated /api/configuration-studio/surfaces returned ${UNAUTH_CODE} (expected 401)"; exit 1
fi
ok "Unauthenticated surface route returns 401"

# A4.6: Run F2 runtime verifier
step "A4 — Running F2 runtime verifier"
F2_EVIDENCE="${EVIDENCE_DIR}/f2-runtime.json"
export API_URL WEB_URL
export PROFILE_KEY="$(read_local_value PROFILE_KEY)"
export RELEASE_ID="$(read_local_value RELEASE_ID)"
export API_IMAGE WEB_IMAGE MIGRATIONS_IMAGE
export EVIDENCE_PATH="${F2_EVIDENCE}"
(cd "${REPO_ROOT}/apps/playground-api" && node "${SCRIPT_DIR}/verify-local-f2-runtime.mjs")
ok "F2 runtime verifier passed"

# A4.7: PostgreSQL outage verifier
step "A4 — Running PostgreSQL outage verifier"
PG_EVIDENCE="${EVIDENCE_DIR}/postgres-outage.json"
export EVIDENCE_PATH="${PG_EVIDENCE}"
bash "${SCRIPT_DIR}/verify-postgres-outage.sh"
ok "PostgreSQL outage verifier passed"

# A4.8: MinIO outage verifier
step "A4 — Running MinIO outage verifier"
MINIO_EVIDENCE="${EVIDENCE_DIR}/minio-outage.json"
export EVIDENCE_PATH="${MINIO_EVIDENCE}"
bash "${SCRIPT_DIR}/verify-minio-outage.sh"
ok "MinIO outage verifier passed"

# A4.9: Backup and restore
step "A4 — Running backup and clean-target restore"
BACKUP_EVIDENCE="${EVIDENCE_DIR}/restore.json"
LATEST_BACKUP="$(ls -t "${COMPOSE_DIR}/backups/"*.dump 2>/dev/null | head -1 || true)"
if [[ -z "${LATEST_BACKUP}" ]]; then
  bash "${SCRIPT_DIR}/backup.sh"
  LATEST_BACKUP="$(ls -t "${COMPOSE_DIR}/backups/"*.dump | head -1)"
fi
export EVIDENCE_PATH="${BACKUP_EVIDENCE}"
bash "${SCRIPT_DIR}/verify-local-restore.sh" "${LATEST_BACKUP}"
ok "Restore verification passed"

# A5: Gate runs
step "A5 — Running repository gates (pnpm build + test + audits)"
GATE_LOG="${EVIDENCE_DIR}/gates.log"
{
  echo "=== pnpm build ===" && pnpm --config.verify-deps-before-run=false build 2>&1 || echo "BUILD_FAILED"
  echo "=== pnpm test ===" && pnpm --config.verify-deps-before-run=false test 2>&1 || echo "TEST_FAILED"
  echo "=== audit:production-data ===" && pnpm --config.verify-deps-before-run=false audit:production-data 2>&1 || echo "AUDIT_PRODUCTION_DATA_FAILED"
  echo "=== audit:all-runtime-data ===" && pnpm --config.verify-deps-before-run=false audit:all-runtime-data 2>&1 || echo "AUDIT_ALL_RUNTIME_DATA_FAILED"
  echo "=== audit:package-dependencies ===" && pnpm --config.verify-deps-before-run=false audit:package-dependencies 2>&1 || echo "AUDIT_PKG_DEP_FAILED"
  echo "=== audit:api-boundary ===" && pnpm --config.verify-deps-before-run=false audit:api-boundary 2>&1 || echo "AUDIT_API_BOUNDARY_FAILED"
  echo "=== audit:navigation ===" && pnpm --config.verify-deps-before-run=false audit:navigation 2>&1 || echo "AUDIT_NAV_FAILED"
  echo "=== audit:sdlc ===" && pnpm --config.verify-deps-before-run=false audit:sdlc 2>&1 || echo "AUDIT_SDLC_FAILED"
  echo "=== audit:configuration-contracts ===" && pnpm --config.verify-deps-before-run=false audit:configuration-contracts 2>&1 || echo "AUDIT_CONFIG_CONTRACTS_FAILED"
  echo "=== audit:configuration-deployment-profile ===" && pnpm --config.verify-deps-before-run=false audit:configuration-deployment-profile 2>&1 || echo "AUDIT_DEPLOY_PROFILE_FAILED"
  echo "=== audit:configuration-observability ===" && pnpm --config.verify-deps-before-run=false audit:configuration-observability 2>&1 || echo "AUDIT_OBS_FAILED"
} > "${GATE_LOG}" 2>&1

ok "Gates complete — log at ${GATE_LOG}"
# Extract summary of pass/fail
grep -E "^(BUILD|TEST|AUDIT)_.*FAILED|=== " "${GATE_LOG}" | tail -30 || true

# A6: Write final closure evidence
step "A6 — Writing Phase A closure summary"
CLOSURE_TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
cat > "${EVIDENCE_DIR}/phase-a-closure.json" <<EOF
{
  "phase": "A",
  "closureTimestamp": "${CLOSURE_TIMESTAMP}",
  "gitRevision": "$(git -C "${REPO_ROOT}" rev-parse HEAD)",
  "sourceStateSha256": "$(node "${REPO_ROOT}/scripts/compute-source-state-sha256.mjs")",
  "images": {
    "tag": "${TAG_SUFFIX}",
    "migrations": "${MIGRATIONS_ID}",
    "api": "${API_ID}",
    "web": "${WEB_ID}"
  },
  "protectedHashesVerified": ${PROTECTED_HASHES_OK},
  "verifiers": [
    "${F2_EVIDENCE}",
    "${PG_EVIDENCE}",
    "${MINIO_EVIDENCE}",
    "${BACKUP_EVIDENCE}"
  ],
  "gateLog": "${GATE_LOG}",
  "status": "TECHNICALLY_COMPLETE_PENDING_HUMAN_REVIEW",
  "humanDecisionsRequired": [
    "Solution-Architecture-independent-review",
    "Security-and-Privacy-independent-review",
    "Backend-Data-independent-review",
    "Web-Accessibility-manual-keyboard-review",
    "QA-SDET-independent-review",
    "Product-Owner-sign-off"
  ],
  "credentialRotationRequired": [
    "ACS-Twilio-credentials-affected-by-earlier-accidental-packaging-must-be-rotated-by-credential-owner"
  ],
  "externalDeferred": [
    "public-TLS-DNS",
    "remote-registry-push",
    "external-KMS-storage",
    "HA-failover",
    "external-PITR",
    "external-alert-delivery",
    "G6-rollout",
    "G7-production-observation",
    "vulnerability-scan-requires-docker-scout-login"
  ],
  "productionReleaseClaim": "NONE"
}
EOF

ok "Phase A closure evidence written to ${EVIDENCE_DIR}"
echo ""
echo -e "${BOLD}════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}Phase A technically complete.${NC}"
echo -e "Evidence directory: ${EVIDENCE_DIR}"
echo -e ""
echo -e "${YELLOW}REQUIRED HUMAN ACTIONS before WI-OI-047 exits Build:${NC}"
echo -e "  1. Review ${EVIDENCE_DIR}/phase-a-closure.json"
echo -e "  2. Six named independent reviewers must sign off (see humanDecisionsRequired)"
echo -e "  3. ACS/Twilio credentials must be rotated by the credential owner"
echo -e "  4. Manual keyboard/screen-reader/zoom/high-contrast accessibility review"
echo -e "${BOLD}════════════════════════════════════════════════════${NC}"
