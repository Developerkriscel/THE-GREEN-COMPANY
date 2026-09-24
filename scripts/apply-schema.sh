#!/usr/bin/env bash
#
# Apply the Royal Green schema to any Postgres database, in order.
#
#   ./scripts/apply-schema.sh "postgresql://user:pass@host:5432/dbname"
#
# Pass --shim to install the plain-Postgres compatibility layer first. Use that
# for a stock Postgres (or CI); omit it for a real Supabase database, which
# already provides the auth/storage schemas and the anon/authenticated roles.
#
#   ./scripts/apply-schema.sh --shim "postgresql://..."
#
# Safe to re-run against a scratch database; NOT idempotent against one that
# already has the schema (the migrations use plain CREATE TABLE).

set -euo pipefail

SHIM=0
if [[ "${1:-}" == "--shim" ]]; then
  SHIM=1
  shift
fi

DB_URL="${1:-${DATABASE_URL:-}}"
if [[ -z "$DB_URL" ]]; then
  echo "usage: $0 [--shim] <postgres-connection-string>" >&2
  echo "   or: DATABASE_URL=... $0 [--shim]" >&2
  exit 64
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ON_ERROR_STOP is the whole point: a half-applied schema is worse than none.
PSQL=(psql "$DB_URL" -v ON_ERROR_STOP=1 --quiet --no-psqlrc)

if [[ $SHIM -eq 1 ]]; then
  echo "==> compat shim (auth/storage schemas, anon+authenticated roles)"
  "${PSQL[@]}" -f "$ROOT/supabase/compat/00_plain_postgres_shim.sql"
fi

for migration in "$ROOT"/supabase/migrations/*.sql; do
  echo "==> $(basename "$migration")"
  "${PSQL[@]}" -f "$migration"
done

echo
echo "Schema applied. Sanity check:"
"${PSQL[@]}" -c "
  select
    (select count(*) from pg_tables where schemaname = 'public')                  as tables,
    (select count(*) from pg_policies where schemaname = 'public')                as policies,
    (select count(*) from public.ranks)                                           as ranks,
    (select count(*) from pg_tables
      where schemaname = 'public' and rowsecurity)                                as rls_enabled;
"
