#!/bin/bash

# Defensive storage permissions fix for Dokploy / shared-host deployments.
# Dokploy creates host bind-mount dirs as root; container may run as root
# (compose default UID=0) or as anythingllm (UID=1000 from Dockerfile).
# This chmod makes them writable for both, ignoring failures because if
# the dir is fine (local dev) the chmod is a no-op. Errors suppressed so
# the script continues either way.
chmod -R 777 /app/server/storage 2>/dev/null || true
chmod -R 777 /var/backups/consultor-ia 2>/dev/null || true
chmod -R 777 /app/collector/hotdir 2>/dev/null || true
chmod -R 777 /app/collector/outputs 2>/dev/null || true

# Check if STORAGE_DIR is set
if [ -z "$STORAGE_DIR" ]; then
    echo "================================================================"
    echo "⚠️  ⚠️  ⚠️  WARNING: STORAGE_DIR environment variable is not set! ⚠️  ⚠️  ⚠️"
    echo ""
    echo "Not setting this will result in data loss on container restart since"
    echo "the application will not have a persistent storage location."
    echo "It can also result in weird errors in various parts of the application."
    echo ""
    echo "Please run the container following"
    echo "docs/architecture/31-admin-bootstrap-runbook.md"
    echo ""
    echo "⚠️  ⚠️  ⚠️  WARNING: STORAGE_DIR environment variable is not set! ⚠️  ⚠️  ⚠️"
    echo "================================================================"
fi

{
  cd /app/server/ &&
    # Disable Prisma CLI telemetry (https://www.prisma.io/docs/orm/tools/prisma-cli#how-to-opt-out-of-data-collection)
    export CHECKPOINT_DISABLE=1 &&
    npx prisma generate --schema=./prisma/schema.prisma &&
    npx prisma migrate deploy --schema=./prisma/schema.prisma &&
    { npx prisma db seed --schema=./prisma/schema.prisma ||
      echo "WARNING: prisma db seed failed; continuing without seed."; } &&
    node /app/server/index.js
} &
{ node /app/collector/index.js; } &
wait -n
exit $?
