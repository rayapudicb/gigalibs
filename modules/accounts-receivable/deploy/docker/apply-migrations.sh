#!/bin/sh
set -eu

if [ -z "${PGHOST:-}" ] || [ -z "${PGDATABASE:-}" ] || [ -z "${PGUSER:-}" ]; then
  echo "PGHOST, PGDATABASE, and PGUSER are required" >&2
  exit 64
fi

until pg_isready -q; do
  sleep 1
done

if [ "$(psql -XAtqc "SELECT to_regclass('gigalibs_ar.schema_migrations') IS NOT NULL")" != "t" ]; then
  psql -X -v ON_ERROR_STOP=1 -f /opt/gigalibs-ar/migrations/000001_ar_foundation.up.sql
fi

if [ "$(psql -XAtqc "SELECT EXISTS (SELECT 1 FROM gigalibs_ar.schema_migrations WHERE version = 2)")" != "t" ]; then
  psql -X -v ON_ERROR_STOP=1 -f /opt/gigalibs-ar/migrations/000002_ar_outbox_delivery.up.sql
fi

if [ "${AR_COMPOSE_GRANT_ROLES:-false}" = "true" ]; then
  psql -X -v ON_ERROR_STOP=1 -f /opt/gigalibs-ar/grant-compose-roles.sql
fi

echo "AR migrations are current"
