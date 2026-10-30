#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
restore_db="acadex_restore_drill"
docker compose --profile test up -d postgres-test >/dev/null
backup_path="$(docker compose exec -T backup sh -ec 'ls -1t /backups/acadex-*.dump 2>/dev/null | head -n1')"
if [[ -z "$backup_path" ]]; then
  echo "No completed backup found in the backup volume." >&2
  exit 1
fi

cleanup() {
  docker compose exec -T postgres-test psql -U schoolos -d postgres -c "DROP DATABASE IF EXISTS ${restore_db} WITH (FORCE)" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker compose exec -T postgres-test psql -U schoolos -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${restore_db} WITH (FORCE)" >/dev/null
docker compose exec -T postgres-test psql -U schoolos -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${restore_db} OWNER schoolos" >/dev/null
docker compose exec -T backup cat "$backup_path" | docker compose exec -T postgres-test pg_restore --no-owner --no-acl -U schoolos -d "$restore_db"
version="$(docker compose exec -T postgres-test psql -U schoolos -d "$restore_db" -Atc 'SELECT version_num FROM alembic_version')"
users="$(docker compose exec -T postgres-test psql -U schoolos -d "$restore_db" -Atc 'SELECT count(*) FROM users')"
echo "Restore succeeded from ${backup_path}"
echo "Restored Alembic revision: ${version}"
echo "Restored user rows: ${users}"
