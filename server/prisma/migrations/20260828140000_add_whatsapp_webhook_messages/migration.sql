-- CreateTable
CREATE TABLE "whatsapp_webhook_messages" (
    "id" SERIAL NOT NULL,
    "messageId" TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "waId" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "claimedAt" TIMESTAMP(3),
    "availableAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "whatsapp_webhook_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_webhook_messages_messageId_key" ON "whatsapp_webhook_messages"("messageId");

-- CreateIndex
CREATE INDEX "whatsapp_webhook_messages_status_createdAt_idx" ON "whatsapp_webhook_messages"("status", "createdAt");

