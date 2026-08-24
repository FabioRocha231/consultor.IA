#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log() { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
fail() { log "ERROR: $*"; exit 1; }

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

BACKUP_DIR="${BACKUP_DIR:-/tmp/consultor-ia-backup}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_DB="${POSTGRES_DB:-consultor}"
POSTGRES_USER="${POSTGRES_USER:-consultor}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"
QDRANT_URL="${QDRANT_URL:-http://localhost:6333}"
QDRANT_API_KEY="${QDRANT_API_KEY:-}"
STORAGE_DIR="${STORAGE_DIR:-/app/server/storage}"

for cmd in pg_dump curl tar sha256sum jq date; do
  command -v "$cmd" >/dev/null 2>&1 || fail "required command not found: $cmd"
done

TS="$(date -u +%Y%m%dT%H%M%SZ)"
MANIFEST_TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
BACKUP_SNAPSHOT_DIR="${BACKUP_DIR}/${TS}"

mkdir -p "$BACKUP_SNAPSHOT_DIR"
log "Backup root: ${BACKUP_DIR}"
log "Backing up Postgres ${POSTGRES_DB} at ${POSTGRES_HOST}:${POSTGRES_PORT}"
log "Backing up Qdrant at ${QDRANT_URL}"
log "Backing up storage at ${STORAGE_DIR}"

qdrant_curl() {
  if [ -n "$QDRANT_API_KEY" ]; then
    curl -fsS -H "api-key: ${QDRANT_API_KEY}" "$@"
  else
    curl -fsS "$@"
  fi
}

log "Step 1: dumping Postgres"
PGPASSWORD="$POSTGRES_PASSWORD" pg_dump \
  --host "$POSTGRES_HOST" \
  --port "$POSTGRES_PORT" \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file "${BACKUP_SNAPSHOT_DIR}/postgres.dump"

POSTGRES_VERSION="$(pg_dump --version)"

log "Step 2: creating Qdrant full snapshot"
QDRANT_SNAPSHOT_JSON="$(qdrant_curl -X POST "${QDRANT_URL}/snapshots")"
QDRANT_SNAPSHOT_NAME="$(printf '%s' "$QDRANT_SNAPSHOT_JSON" | jq -r '.result.name')"
if [ -z "$QDRANT_SNAPSHOT_NAME" ]; then
  fail "Qdrant did not return a snapshot name"
fi

log "Step 3: downloading Qdrant snapshot"
qdrant_curl "${QDRANT_URL}/snapshots/${QDRANT_SNAPSHOT_NAME}" \
  --output "${BACKUP_SNAPSHOT_DIR}/qdrant.snapshot"
QDRANT_VERSION="$(qdrant_curl "${QDRANT_URL}" | jq -r '.version // "unknown"')"

log "Step 4: archiving storage"
if [ ! -d "$STORAGE_DIR" ]; then
  fail "STORAGE_DIR does not exist: ${STORAGE_DIR}"
fi
tar -czf "${BACKUP_SNAPSHOT_DIR}/storage.tar.gz" \
  -C "$STORAGE_DIR" \
  --exclude='*.tmp' \
  --exclude='node_modules' \
  .

log "Step 5: writing manifest"
artifact_size() { wc -c < "$1" | tr -d '[:space:]'; }
artifact_sha() { sha256sum "$1" | awk '{print $1}'; }

POSTGRES_SIZE="$(artifact_size "${BACKUP_SNAPSHOT_DIR}/postgres.dump")"
POSTGRES_SHA="$(artifact_sha "${BACKUP_SNAPSHOT_DIR}/postgres.dump")"
QDRANT_SIZE="$(artifact_size "${BACKUP_SNAPSHOT_DIR}/qdrant.snapshot")"
QDRANT_SHA="$(artifact_sha "${BACKUP_SNAPSHOT_DIR}/qdrant.snapshot")"
STORAGE_SIZE="$(artifact_size "${BACKUP_SNAPSHOT_DIR}/storage.tar.gz")"
STORAGE_SHA="$(artifact_sha "${BACKUP_SNAPSHOT_DIR}/storage.tar.gz")"

jq -n \
  --arg timestamp "$MANIFEST_TIMESTAMP" \
  --arg postgres_version "$POSTGRES_VERSION" \
  --arg qdrant_version "$QDRANT_VERSION" \
  --argjson postgres_size "$POSTGRES_SIZE" \
  --argjson qdrant_size "$QDRANT_SIZE" \
  --argjson storage_size "$STORAGE_SIZE" \
  --arg postgres_sha "$POSTGRES_SHA" \
  --arg qdrant_sha "$QDRANT_SHA" \
  --arg storage_sha "$STORAGE_SHA" \
  '{
    "tool": "consultor-ia backup",
    "timestamp": $timestamp,
    "versions": {
      "postgres": $postgres_version,
      "qdrant": $qdrant_version
    },
    "artifacts": {
      "postgres.dump": { "size": $postgres_size, "sha256": $postgres_sha },
      "qdrant.snapshot": { "size": $qdrant_size, "sha256": $qdrant_sha },
      "storage.tar.gz": { "size": $storage_size, "sha256": $storage_sha }
    }
  }' > "${BACKUP_SNAPSHOT_DIR}/MANIFEST.json"

log "Step 6: creating archive"
ARCHIVE_PATH="${BACKUP_DIR}/consultor-ia-${TS}.tar.gz"
tar -czf "$ARCHIVE_PATH" -C "$BACKUP_DIR" "$TS"

log "Step 7: pruning backups older than ${BACKUP_RETENTION_DAYS} days"
find "$BACKUP_DIR" -maxdepth 1 \
  \( -name 'consultor-ia-*' -o -name '20[0-9][0-9]*' \) \
  -mtime +"$BACKUP_RETENTION_DAYS" -exec rm -rf {} \;

log "Backup complete: ${ARCHIVE_PATH}"
