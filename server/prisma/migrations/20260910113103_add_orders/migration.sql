-- CreateTable
CREATE TABLE "orders" (
  "id" SERIAL NOT NULL,
  "organization_id" TEXT NOT NULL,
  "customer_phone" TEXT NOT NULL,
  "customer_name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "total_cents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'BRL',
  "notes" TEXT,
  "idempotency_key" TEXT NOT NULL,
  "external_ref" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
  "id" SERIAL NOT NULL,
  "order_id" INTEGER NOT NULL,
  "menu_item_id" INTEGER NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unit_price_cents" INTEGER NOT NULL,
  "notes" TEXT,
  CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "orders_idempotency_key_key" ON "orders"("idempotency_key");
CREATE INDEX "orders_organization_id_status_created_at_idx" ON "orders"("organization_id", "status", "created_at");
CREATE INDEX "orders_organization_id_customer_phone_created_at_idx" ON "orders"("organization_id", "customer_phone", "created_at");

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
