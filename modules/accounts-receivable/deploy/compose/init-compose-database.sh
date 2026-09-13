#!/bin/sh
set -eu

if [ -z "${AR_RUNTIME_DB_PASSWORD:-}" ] || [ -z "${AR_WORKER_DB_PASSWORD:-}" ]; then
  echo "AR runtime and worker database passwords are required" >&2
  exit 64
fi

psql -X -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=runtime_password="$AR_RUNTIME_DB_PASSWORD" \
  --set=worker_password="$AR_WORKER_DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE ar_runtime LOGIN PASSWORD %L', :'runtime_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ar_runtime') \gexec
SELECT format('CREATE ROLE ar_worker LOGIN PASSWORD %L', :'worker_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ar_worker') \gexec
SQL
