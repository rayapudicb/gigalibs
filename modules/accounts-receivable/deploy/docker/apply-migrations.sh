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

for migration_file in $(ls -1 /opt/gigalibs-ar/migrations/*.up.sql 2>/dev/null | sort); do
  version=$(basename "$migration_file" | cut -d'_' -f1 | sed 's/^0*//')
  if [ -n "$version" ]; then
    applied=$(psql -XAtqc "SELECT EXISTS (SELECT 1 FROM gigalibs_ar.schema_migrations WHERE version = ${version})")
    if [ "$applied" != "t" ]; then
      echo "Applying $migration_file..."
      psql -X -v ON_ERROR_STOP=1 -f "$migration_file"
    fi
  fi
done

if [ "${AR_COMPOSE_GRANT_ROLES:-false}" = "true" ]; then
  psql -X -v ON_ERROR_STOP=1 -f /opt/gigalibs-ar/grant-compose-roles.sql
fi

echo "AR migrations are current"
