-- AddOrganizationN8nConfig
ALTER TABLE "organization" ADD COLUMN IF NOT EXISTS "n8nWebhookUrl" TEXT;
ALTER TABLE "organization" ADD COLUMN IF NOT EXISTS "n8nApiKey" TEXT;
