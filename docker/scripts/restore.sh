#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log() { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
fail() { log "ERROR: $*"; exit 1; }

CONFIRMED=0
if [ "${1:-}" = "--yes" ]; then
  CONFIRMED=1
  shift
fi

BACKUP_ARCHIVE="${1:-}"
if [ -z "$BACKUP_ARCHIVE" ]; then
  echo "Usage: $0 [--yes] <backup.tar.gz>" >&2
  exit 1
fi
if [ ! -f "$BACKUP_ARCHIVE" ]; then
  fail "Backup archive not found: ${BACKUP_ARCHIVE}"
fi

ENV_FILE="${CONSULTOR_IA_ENV_FILE:-}"
if [ -z "$ENV_FILE" ]; then
  for candidate in "$PWD/.env" "$PWD/docker/.env" "$SCRIPT_DIR/../.env"; do
    if [ -f "$candidate" ]; then
      ENV_FILE="$candidate"
      break
    fi
  done
fi
if [ -n "$ENV_FILE" ] && [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_DB="${POSTGRES_DB:-consultor}"
POSTGRES_USER="${POSTGRES_USER:-consultor}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"
QDRANT_URL="${QDRANT_URL:-http://localhost:6333}"
QDRANT_API_KEY="${QDRANT_API_KEY:-}"
STORAGE_DIR="${STORAGE_DIR:-/app/server/storage}"

for cmd in psql pg_restore curl tar sha256sum jq date; do
  command -v "$cmd" >/dev/null 2>&1 || fail "required command not found: $cmd"
done

if [ "$CONFIRMED" -ne 1 ] && \
   [ "${RESTORE_CONFIRM:-}" != "I_UNDERSTAND_THIS_WILL_OVERWRITE" ]; then
  echo "Restore aborted. Set RESTORE_CONFIRM=I_UNDERSTAND_THIS_WILL_OVERWRITE or pass --yes." >&2
  exit 1
fi

log "Validating backup archive: ${BACKUP_ARCHIVE}"
tar -tzf "$BACKUP_ARCHIVE" >/dev/null
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
tar -xzf "$BACKUP_ARCHIVE" -C "$TMP_DIR"

MANIFEST_FILE="$(find "$TMP_DIR" -mindepth 2 -maxdepth 2 -name MANIFEST.json -print -quit)"
if [ -z "$MANIFEST_FILE" ]; then
  fail "MANIFEST.json not found in backup"
fi
BACKUP_CONTENT_DIR="$(dirname "$MANIFEST_FILE")"

for artifact in postgres.dump qdrant.snapshot storage.tar.gz; do
  [ -f "${BACKUP_CONTENT_DIR}/${artifact}" ] || fail "missing artifact: ${artifact}"
  expected="$(jq -r --arg name "$artifact" '.artifacts[$name].sha256' "$MANIFEST_FILE")"
  actual="$(sha256sum "${BACKUP_CONTENT_DIR}/${artifact}" | awk '{print $1}')"
  if [ -z "$expected" ] || [ "$expected" != "$actual" ]; then
    fail "checksum mismatch for ${artifact}"
  fi
  log "Checksum OK: ${artifact}"
done

qdrant_curl() {
  if [ -n "$QDRANT_API_KEY" ]; then
    curl -fsS -H "api-key: ${QDRANT_API_KEY}" "$@"
  else
    curl -fsS "$@"
  fi
}

log "Restoring Postgres"
PGPASSWORD="$POSTGRES_PASSWORD" psql \
  --host "$POSTGRES_HOST" \
  --port "$POSTGRES_PORT" \
  --username "$POSTGRES_USER" \
  --dbname postgres \
  --set=ON_ERROR_STOP=1 \
  --set=dbname="$POSTGRES_DB" <<'SQL'
SELECT format('DROP DATABASE IF EXISTS %I WITH (FORCE)', :'dbname'::text) \gexec
SELECT format('CREATE DATABASE %I', :'dbname'::text) \gexec
SQL

PGPASSWORD="$POSTGRES_PASSWORD" pg_restore \
  --host "$POSTGRES_HOST" \
  --port "$POSTGRES_PORT" \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --clean \
  --if-exists \
  --exit-on-error \
  --no-owner \
  --no-privileges \
  "${BACKUP_CONTENT_DIR}/postgres.dump"

log "Restoring Qdrant"
QDRANT_RESTORE_DIR="${TMP_DIR}/qdrant-restore"
mkdir -p "$QDRANT_RESTORE_DIR"
tar -xf "${BACKUP_CONTENT_DIR}/qdrant.snapshot" -C "$QDRANT_RESTORE_DIR"
if [ ! -f "${QDRANT_RESTORE_DIR}/config.json" ]; then
  fail "Qdrant snapshot does not contain config.json"
fi

MAPPING="$(jq -r '.collections_mapping | to_entries[] | @base64' "${QDRANT_RESTORE_DIR}/config.json")"
if [ -z "$MAPPING" ]; then
  log "No Qdrant collections to restore"
else
  while read -r entry; do
    collection="$(printf '%s' "$entry" | base64 -d | jq -r '.key')"
    snapshot_file="$(printf '%s' "$entry" | base64 -d | jq -r '.value')"
    encoded_collection="$(jq -rn --arg value "$collection" '$value | @uri')"
    log "Restoring Qdrant collection: ${collection}"
    qdrant_curl \
      -X POST \
      "${QDRANT_URL}/collections/${encoded_collection}/snapshots/upload?wait=true" \
      -F "snapshot=@${QDRANT_RESTORE_DIR}/${snapshot_file}" \
      | jq -e '.status == "ok"' >/dev/null
  done <<EOF
${MAPPING}
EOF
fi

log "Restoring storage"
if [ -d "$STORAGE_DIR" ]; then
  STORAGE_BACKUP="${STORAGE_DIR}.bak.$(date -u +%Y%m%dT%H%M%SZ)"
  mv "$STORAGE_DIR" "$STORAGE_BACKUP"
  log "Moved current storage to ${STORAGE_BACKUP}"
fi
mkdir -p "$STORAGE_DIR"
tar -xzf "${BACKUP_CONTENT_DIR}/storage.tar.gz" -C "$STORAGE_DIR"

log "Restore complete"
