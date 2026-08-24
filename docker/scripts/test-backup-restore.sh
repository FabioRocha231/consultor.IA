#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEST_DIR="$(mktemp -d /tmp/consultor-ia-backup-test.XXXXXX)"
PG_CONTAINER="consultor-backup-test-pg-$$"
QDRANT_CONTAINER="consultor-backup-test-qdrant-$$"
NETWORK="consultor-backup-test-$$"
PG_PORT="${BACKUP_TEST_PG_PORT:-55432}"
QDRANT_PORT="${BACKUP_TEST_QDRANT_PORT:-56333}"
POSTGRES_IMAGE="${POSTGRES_IMAGE:-postgres:16-alpine}"
QDRANT_IMAGE="${QDRANT_IMAGE:-qdrant/qdrant:v1.7.4}"

log() { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
fail() { log "ERROR: $*"; exit 1; }

cleanup() {
  docker stop "$PG_CONTAINER" "$QDRANT_CONTAINER" >/dev/null 2>&1 || true
  docker rm "$PG_CONTAINER" "$QDRANT_CONTAINER" >/dev/null 2>&1 || true
  docker network rm "$NETWORK" >/dev/null 2>&1 || true
  rm -rf "$TEST_DIR"
}
trap cleanup EXIT

for cmd in docker curl jq; do
  command -v "$cmd" >/dev/null 2>&1 || fail "required command not found: $cmd"
done

wait_for_postgres() {
  for _ in $(seq 1 60); do
    if docker exec "$PG_CONTAINER" psql -U consultor -d consultor -c 'SELECT 1' >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  fail "Postgres did not become ready"
}

wait_for_qdrant() {
  for _ in $(seq 1 60); do
    if curl -fsS "http://127.0.0.1:${QDRANT_PORT}/" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  fail "Qdrant did not become ready"
}

start_containers() {
  local data_suffix="${1:-initial}"
  docker network inspect "$NETWORK" >/dev/null 2>&1 || docker network create "$NETWORK" >/dev/null
  docker run -d --name "$PG_CONTAINER" --network "$NETWORK" \
    -e POSTGRES_USER=consultor \
    -e POSTGRES_PASSWORD=consultor \
    -e POSTGRES_DB=consultor \
    -p "127.0.0.1:${PG_PORT}:5432" \
    -v "${TEST_DIR}/pg-${data_suffix}:/var/lib/postgresql/data" \
    "$POSTGRES_IMAGE" >/dev/null
  docker run -d --name "$QDRANT_CONTAINER" --network "$NETWORK" \
    -p "127.0.0.1:${QDRANT_PORT}:6333" \
    -v "${TEST_DIR}/qdrant-${data_suffix}:/qdrant/storage" \
    "$QDRANT_IMAGE" >/dev/null
  wait_for_postgres
  wait_for_qdrant
}

run_migrations() {
  if [ ! -x "${REPO_ROOT}/server/node_modules/.bin/prisma" ]; then
    fail "server dependencies not installed; run 'yarn install' in server before this test"
  fi
  (
    cd "${REPO_ROOT}/server"
    DB_URL="postgresql://consultor:consultor@127.0.0.1:${PG_PORT}/consultor" \
      ./node_modules/.bin/prisma migrate deploy
  )
}

seed_data() {
  mkdir -p "${TEST_DIR}/storage/documents"
  printf 'smoke document\n' > "${TEST_DIR}/storage/documents/smoke.txt"

  docker exec -i "$PG_CONTAINER" psql -U consultor -d consultor -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
INSERT INTO organization (id, name, slug, status, "updatedAt")
VALUES ('smoke-org', 'Smoke Org', 'smoke-org', 'active', now());

INSERT INTO workspaces (id, name, slug, "organizationId")
VALUES (1, 'Smoke Workspace', 'smoke-workspace', 'smoke-org');

INSERT INTO workspace_chats (id, "workspaceId", prompt, response, include)
VALUES (1, 1, 'ping', 'pong', true);

INSERT INTO workspace_documents (id, "docId", filename, docpath, "workspaceId")
VALUES (1, 'doc-smoke', 'smoke.txt', 'documents/smoke.txt', 1);

UPDATE workspace_chats
SET "feedbackScore" = true,
    "feedbackCategory" = 'positive',
    "feedbackComment" = 'restore drill',
    "feedbackAt" = now()
WHERE id = 1;
SQL

  curl -fsS -X PUT \
    "http://127.0.0.1:${QDRANT_PORT}/collections/smoke_collection" \
    -H 'Content-Type: application/json' \
    -d '{"vectors":{"size":4,"distance":"Dot"}}' >/dev/null
  curl -fsS -X PUT \
    "http://127.0.0.1:${QDRANT_PORT}/collections/smoke_collection/points?wait=true" \
    -H 'Content-Type: application/json' \
    -d '{"points":[{"id":1,"vector":[0.1,0.2,0.3,0.4],"payload":{"source":"smoke"}}]}' >/dev/null
}

log "Starting ephemeral Postgres and Qdrant"
start_containers initial
run_migrations
seed_data

log "Running backup.sh"
docker run --rm --network "$NETWORK" \
  -v "${REPO_ROOT}:/repo:ro" \
  -v "${TEST_DIR}:/backup" \
  -e BACKUP_DIR=/backup \
  -e POSTGRES_HOST="$PG_CONTAINER" \
  -e POSTGRES_PORT=5432 \
  -e POSTGRES_DB=consultor \
  -e POSTGRES_USER=consultor \
  -e POSTGRES_PASSWORD=consultor \
  -e QDRANT_URL="http://${QDRANT_CONTAINER}:6333" \
  -e STORAGE_DIR=/backup/storage \
  "$POSTGRES_IMAGE" \
  sh -c 'apk add --no-cache curl jq bash >/dev/null 2>&1 && bash /repo/docker/scripts/backup.sh'

BACKUP_ARCHIVE="$(find "$TEST_DIR" -maxdepth 1 -name 'consultor-ia-*.tar.gz' | head -n 1)"
if [ -z "$BACKUP_ARCHIVE" ]; then
  fail "backup.sh did not create an archive"
fi
BACKUP_ARCHIVE_NAME="$(basename "$BACKUP_ARCHIVE")"
log "Backup archive created: ${BACKUP_ARCHIVE}"

set +e
docker run --rm --network "$NETWORK" \
  -v "${REPO_ROOT}:/repo:ro" \
  -v "${TEST_DIR}:/backup" \
  -e POSTGRES_HOST="$PG_CONTAINER" \
  -e POSTGRES_PORT=5432 \
  -e POSTGRES_DB=consultor \
  -e POSTGRES_USER=consultor \
  -e POSTGRES_PASSWORD=consultor \
  -e QDRANT_URL="http://${QDRANT_CONTAINER}:6333" \
  -e STORAGE_DIR=/backup/restored-storage \
  "$POSTGRES_IMAGE" \
  sh -c "apk add --no-cache curl jq bash >/dev/null 2>&1 && bash /repo/docker/scripts/restore.sh /backup/${BACKUP_ARCHIVE_NAME}"
REJECTED_EXIT=$?
set -e
if [ "$REJECTED_EXIT" -eq 0 ]; then
  fail "restore.sh should reject execution without confirmation"
fi
log "Restore correctly rejected missing confirmation"

log "Simulating outage and starting fresh containers"
docker stop "$PG_CONTAINER" "$QDRANT_CONTAINER" >/dev/null
docker rm "$PG_CONTAINER" "$QDRANT_CONTAINER" >/dev/null
start_containers restored

log "Running restore.sh with confirmation"
docker run --rm --network "$NETWORK" \
  -v "${REPO_ROOT}:/repo:ro" \
  -v "${TEST_DIR}:/backup" \
  -e POSTGRES_HOST="$PG_CONTAINER" \
  -e POSTGRES_PORT=5432 \
  -e POSTGRES_DB=consultor \
  -e POSTGRES_USER=consultor \
  -e POSTGRES_PASSWORD=consultor \
  -e QDRANT_URL="http://${QDRANT_CONTAINER}:6333" \
  -e STORAGE_DIR=/backup/restored-storage \
  "$POSTGRES_IMAGE" \
  sh -c "apk add --no-cache curl jq bash >/dev/null 2>&1 && bash /repo/docker/scripts/restore.sh --yes /backup/${BACKUP_ARCHIVE_NAME}"

log "Validating restored data"
POSTGRES_COUNTS="$(docker exec "$PG_CONTAINER" psql -U consultor -d consultor -At -F, \
  -c 'SELECT (SELECT count(*) FROM workspaces), (SELECT count(*) FROM workspace_chats), (SELECT count(*) FROM workspace_documents), (SELECT count(*) FROM workspace_chats WHERE "feedbackScore" = true);')"
if [ "$POSTGRES_COUNTS" != "1,1,1,1" ]; then
  fail "unexpected Postgres counts after restore: ${POSTGRES_COUNTS}"
fi

POINTS_COUNT="$(curl -fsS "http://127.0.0.1:${QDRANT_PORT}/collections/smoke_collection" | jq -r '.result.points_count')"
if [ "$POINTS_COUNT" != "1" ]; then
  fail "unexpected Qdrant point count after restore: ${POINTS_COUNT}"
fi

if [ ! -f "${TEST_DIR}/restored-storage/documents/smoke.txt" ]; then
  fail "storage file was not restored"
fi

log "PASS: backup -> outage -> restore reproduced Postgres, Qdrant and storage"
printf 'Postgres counts: %s\n' "$POSTGRES_COUNTS"
printf 'Qdrant points: %s\n' "$POINTS_COUNT"
printf 'Storage file: %s\n' "${TEST_DIR}/restored-storage/documents/smoke.txt"
