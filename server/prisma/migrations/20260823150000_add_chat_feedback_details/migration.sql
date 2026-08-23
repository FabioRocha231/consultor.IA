ALTER TABLE "workspace_chats" ADD COLUMN IF NOT EXISTS "feedbackCategory" TEXT;
ALTER TABLE "workspace_chats" ADD COLUMN IF NOT EXISTS "feedbackComment" TEXT;
ALTER TABLE "workspace_chats" ADD COLUMN IF NOT EXISTS "feedbackAt" TIMESTAMP(3);
