#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_ENV="${SCRIPT_DIR}/../.env"

if [[ -f "${TARGET_ENV}" ]]; then
  echo "Error: ${TARGET_ENV} already exists. Remove or backup before generating new credentials." >&2
  exit 1
fi

generate_secret() {
  openssl rand -base64 32 | tr -d '\n/' | cut -c1-32
}

generate_password() {
  openssl rand -hex 24
}

echo "Generating secure credentials for standalone Accounts Receivable deployment..."

DB_ADMIN_PW=$(generate_password)
RUNTIME_DB_PW=$(generate_password)
WORKER_DB_PW=$(generate_password)
WEB_SESSION_SECRET=$(generate_secret)
WEBHOOK_SECRET=$(generate_secret)
CLIENT_SECRET=$(generate_secret)

cat <<EOF > "${TARGET_ENV}"
# Generated on $(date -u +"%Y-%m-%dT%H:%M:%SZ") for Accounts Receivable Customer-Managed deployment
AR_DB_ADMIN_PASSWORD=${DB_ADMIN_PW}
AR_RUNTIME_DB_PASSWORD=${RUNTIME_DB_PW}
AR_WORKER_DB_PASSWORD=${WORKER_DB_PW}

AR_WEB_SESSION_SECRET=${WEB_SESSION_SECRET}

# OIDC Identity Provider Configuration
AR_OIDC_ISSUER=https://auth.example.com
AR_OIDC_JWKS_URI=https://auth.example.com/.well-known/jwks.json
AR_OIDC_AUDIENCE=gigalibs-ar
AR_OIDC_CLIENT_ID=gigalibs-ar-client
AR_OIDC_CLIENT_SECRET=${CLIENT_SECRET}

# Outbox Webhook Dispatch Configuration
AR_EVENT_WEBHOOK_URL=https://events.example.com/ar-events
AR_EVENT_WEBHOOK_SECRET=${WEBHOOK_SECRET}
EOF

chmod 600 "${TARGET_ENV}"
echo "Credentials generated securely in ${TARGET_ENV} with 0600 permissions."
