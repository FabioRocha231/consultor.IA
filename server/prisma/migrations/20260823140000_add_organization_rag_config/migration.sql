-- AddOrganizationRagConfig
ALTER TABLE "organization" ADD COLUMN IF NOT EXISTS "ragConfig" JSONB;
