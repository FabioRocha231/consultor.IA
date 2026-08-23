-- AlterTable
ALTER TABLE "organization" ADD COLUMN IF NOT EXISTS "wizardState" JSONB;
ALTER TABLE "organization" ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMP(3);
