-- CreateTable
CREATE TABLE "menu_items" (
  "id" SERIAL NOT NULL,
  "organization_id" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "price_cents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'BRL',
  "available" BOOLEAN NOT NULL DEFAULT true,
  "position" INTEGER NOT NULL DEFAULT 0,
  "allergens" TEXT,
  "photo_url" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "menu_items_organization_id_category_position_idx" ON "menu_items"("organization_id", "category", "position");

-- CreateIndex
CREATE INDEX "menu_items_organization_id_available_idx" ON "menu_items"("organization_id", "available");
