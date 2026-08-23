-- CreateTable
CREATE TABLE IF NOT EXISTS "eval_dataset" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "eval_dataset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "eval_question" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "expectedAnswer" TEXT,
    "expectedSource" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eval_question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "eval_run" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "organizationId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "configSnapshot" JSONB NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "totalQuestions" INTEGER NOT NULL DEFAULT 0,
    "metrics" JSONB,

    CONSTRAINT "eval_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "eval_result" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "answer" TEXT,
    "retrievedSources" JSONB,
    "retrievalAccuracy" BOOLEAN,
    "answerCorrectness" BOOLEAN,
    "citationCorrectness" BOOLEAN,
    "latencyMs" INTEGER,
    "costUsd" DOUBLE PRECISION,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eval_result_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'eval_dataset_organizationId_fkey'
  ) THEN
    ALTER TABLE "eval_dataset" ADD CONSTRAINT "eval_dataset_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'eval_question_datasetId_fkey'
  ) THEN
    ALTER TABLE "eval_question" ADD CONSTRAINT "eval_question_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "eval_dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'eval_run_datasetId_fkey'
  ) THEN
    ALTER TABLE "eval_run" ADD CONSTRAINT "eval_run_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "eval_dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'eval_run_organizationId_fkey'
  ) THEN
    ALTER TABLE "eval_run" ADD CONSTRAINT "eval_run_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'eval_result_runId_fkey'
  ) THEN
    ALTER TABLE "eval_result" ADD CONSTRAINT "eval_result_runId_fkey" FOREIGN KEY ("runId") REFERENCES "eval_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'eval_result_questionId_fkey'
  ) THEN
    ALTER TABLE "eval_result" ADD CONSTRAINT "eval_result_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "eval_question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
