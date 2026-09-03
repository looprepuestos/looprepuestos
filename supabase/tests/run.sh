#!/usr/bin/env bash
# Corre las migraciones + seed + tests contra un Postgres LOCAL (no Supabase).
# Usa un stub del esquema `auth` y de los roles anon/authenticated/service_role.
# Requiere: un Postgres accesible y las variables PGHOST/PGPORT/PGUSER.
#
#   Ejemplo:
#     export PGHOST=127.0.0.1 PGPORT=5433 PGUSER=loop
#     bash supabase/tests/run.sh
set -euo pipefail

DB=loopdb_test
DIR="$(cd "$(dirname "$0")/.." && pwd)"   # .../supabase

psql -d postgres -qc "drop database if exists ${DB} with (force);" -c "create database ${DB};"
psql -d "${DB}" -v ON_ERROR_STOP=1 -qf "${DIR}/tests/00_bootstrap.sql"
for f in 0001_init 0002_functions 0003_views 0004_rls; do
  psql -d "${DB}" -v ON_ERROR_STOP=1 -qf "${DIR}/migrations/${f}.sql"
  echo "migración ${f} OK"
done
psql -d "${DB}" -v ON_ERROR_STOP=1 -qf "${DIR}/tests/10_seed.sql"
echo "seed OK"
psql -d "${DB}" -v ON_ERROR_STOP=1 -f "${DIR}/tests/20_tests.sql"
