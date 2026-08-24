-- AlterTable
ALTER TABLE "workspace_chats" ADD COLUMN IF NOT EXISTS "traceId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "workspace_chats_workspace_id_created_at_idx" ON "workspace_chats"("workspaceId", "createdAt");
CREATE INDEX IF NOT EXISTS "workspace_chats_trace_id_idx" ON "workspace_chats"("traceId");
