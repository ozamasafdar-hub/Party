#!/usr/bin/env bash
#
# Run the database's own rules against a real Postgres.
#
# The app's join gates live in PL/pgSQL triggers, and until this existed the
# only way to test them was to run SQL against the production Supabase
# project and read the error. That is how a migration silently dropped the
# Host Pro-only check: the app still hid the button, so nothing looked
# wrong. This builds a throwaway database from docs/database-schema.sql,
# loads both seed files, and asserts what every gate should do.
#
#   docs/sql-tests/run.sh
#
# Needs postgresql-16 (or newer) client + server binaries. Nothing here
# touches the real project.
#
# What is faked, and what is not: bootstrap.sql stubs the parts of Supabase
# the schema leans on — auth.users, auth.uid(), storage, and a PostGIS
# shim, since the map's radius search is not what is under test. The
# schema, the triggers, the RLS policies and the seeds are the real files,
# read straight from docs/. A pass here means the SQL is sound; it does not
# prove anything about how the client calls it.

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCS="$(dirname "$HERE")"
PORT="${WYN_TEST_PORT:-5433}"
PGDATA_DIR="${WYN_TEST_PGDATA:-/var/lib/postgresql/wyn/data}"
SOCK=/tmp
PSQL="psql -h $SOCK -p $PORT -U postgres"

for d in /usr/lib/postgresql/*/bin; do [ -d "$d" ] && export PATH="$d:$PATH"; done
command -v initdb >/dev/null || { echo "postgres server binaries not found"; exit 2; }

# ---------------------------------------------------------------------------
# A cluster, if one is not already listening. Postgres refuses to run as
# root, so this drops to the postgres account when it has to.
# ---------------------------------------------------------------------------
if ! pg_isready -h $SOCK -p "$PORT" -q 2>/dev/null; then
  echo "starting postgres on port $PORT"
  AS=""
  [ "$(id -u)" = "0" ] && AS="su postgres -c"
  BOOT="export PATH='$PATH'
        rm -rf '$PGDATA_DIR' && mkdir -p '$(dirname "$PGDATA_DIR")'
        initdb -D '$PGDATA_DIR' -U postgres --auth=trust >/dev/null 2>&1
        pg_ctl -D '$PGDATA_DIR' -o '-p $PORT -k $SOCK' -l '$(dirname "$PGDATA_DIR")/pg.log' start >/dev/null 2>&1"
  if [ -n "$AS" ]; then su postgres -c "$BOOT"; else bash -c "$BOOT"; fi
  sleep 2
  pg_isready -h $SOCK -p "$PORT" -q || { echo "could not start postgres"; exit 2; }
fi

# ---------------------------------------------------------------------------
# Rebuild from the real files every run. PostGIS is stubbed, so the two
# lines that need the extension itself are adjusted on the way in — the
# rest of the schema is loaded verbatim.
# ---------------------------------------------------------------------------
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

sed -e '/using gist (location)/d' \
    -e 's/^create extension if not exists postgis;/-- postgis stubbed by bootstrap.sql/' \
    -e 's/geography (point, 4326)/geography/' \
    "$DOCS/database-schema.sql" > "$TMP/schema.sql"

$PSQL -d postgres -q -c "drop database if exists wyn;" -c "create database wyn;" >/dev/null 2>&1

fail=0
load() {
  local label="$1" file="$2"
  local out
  out="$($PSQL -d wyn -v ON_ERROR_STOP=1 -q -f "$file" 2>&1 | grep -Ev 'NOTICE|WARNING|HINT|^$')"
  if [ -n "$out" ]; then
    echo "  FAIL  $label"
    echo "$out" | sed 's/^/          /'
    fail=1
  else
    echo "  ok    $label"
  fi
}

echo
echo "LOADING"
load "supabase stubs"       "$HERE/bootstrap.sql"
load "database-schema.sql"  "$TMP/schema.sql"
load "seed-bots.sql"        "$DOCS/seed-bots.sql"
load "seed-endings.sql"     "$DOCS/seed-endings.sql"
load "seed-endings.sql (again — must be re-runnable)" "$DOCS/seed-endings.sql"

[ "$fail" = 0 ] || { echo; echo "SQL did not load — gates not run."; exit 1; }

out="$($PSQL -d wyn -q -t -A -f "$HERE/gates.sql" 2>&1 |
       grep -Ev '^NOTICE|^WARNING|^HINT|^$|^DROP|^CREATE|^UPDATE|^INSERT')"
echo "$out"
echo
if echo "$out" | grep -q "FAIL"; then
  echo "$(echo "$out" | grep -c FAIL) failing check(s)."
  exit 1
fi
echo "All checks passed."
