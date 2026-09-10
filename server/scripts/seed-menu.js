#!/usr/bin/env node
/**
 * Seed script for Empresa A (restaurant) menu.
 *
 * Cria itens típicos (pizzas, hambúrgueres, bebidas) idempotentemente
 * via MenuItem.create. Não duplica itens já existentes (compara por
 * organizationId + name).
 *
 * Uso:
 *   DB_URL=postgresql://... node server/scripts/seed-menu.js
 *
 * Ou via npm script (definido abaixo):
 *   yarn seed:menu
 */

const prisma = require("../utils/prisma");
const { DEFAULT_ORGANIZATION_ID } = require("../models/menuItems");

const SEED_ITEMS = [
  // Pizzas
  {
    category: "Pizzas",
    name: "Margherita",
    description:
      "Molho de tomate, mussarela de búfala, manjericão fresco e azeite.",
    priceCents: 4590,
    position: 1,
  },
  {
    category: "Pizzas",
    name: "Calabresa",
    description: "Molho de tomate, mussarela, calabresa fatiada e cebola.",
    priceCents: 4290,
    position: 2,
  },
  {
    category: "Pizzas",
    name: "Quatro Queijos",
    description: "Mussarela, provolone, parmesão e gorgonzola.",
    priceCents: 4990,
    position: 3,
  },
  // Hambúrgueres
  {
    category: "Hambúrgueres",
    name: "X-Burger Clássico",
    description:
      "Pão brioche, hambúrguer 150g, queijo cheddar, alface e tomate.",
    priceCents: 3290,
    position: 1,
  },
  {
    category: "Hambúrgueres",
    name: "X-Bacon",
    description:
      "Pão brioche, hambúrguer 180g, queijo prato, bacon crocante e cebola caramelizada.",
    priceCents: 3890,
    position: 2,
  },
  {
    category: "Hambúrgueres",
    name: "X-Salada Vegano",
    description:
      "Pão integral, hambúrguer de grão-de-bico, alface, tomate e maionese verde.",
    priceCents: 3490,
    position: 3,
  },
  // Bebidas
  {
    category: "Bebidas",
    name: "Coca-Cola 350ml",
    description: "Lata gelada.",
    priceCents: 790,
    position: 1,
  },
  {
    category: "Bebidas",
    name: "Guaraná Antarctica 350ml",
    description: "Lata gelada.",
    priceCents: 690,
    position: 2,
  },
  {
    category: "Bebidas",
    name: "Suco Natural de Laranja 500ml",
    description: "Espremido na hora, sem açúcar.",
    priceCents: 1290,
    position: 3,
  },
  // Sobremesas
  {
    category: "Sobremesas",
    name: "Petit Gateau",
    description: "Bolinho de chocolate com recheio cremoso e sorvete de creme.",
    priceCents: 2290,
    position: 1,
  },
  {
    category: "Sobremesas",
    name: "Açaí 500ml com Acompanhamentos",
    description: "Açaí cremoso com banana, granola e leite condensado.",
    priceCents: 1890,
    position: 2,
  },
];

function formatBRL(priceCents) {
  return `R$ ${(priceCents / 100).toFixed(2).replace(".", ",")}`;
}

async function seedMenu() {
  console.log(
    `[seed-menu] organization=${DEFAULT_ORGANIZATION_ID} items=${SEED_ITEMS.length}`
  );

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of SEED_ITEMS) {
    try {
      const existing = await prisma.menuItem.findFirst({
        where: {
          organizationId: DEFAULT_ORGANIZATION_ID,
          name: item.name,
        },
      });
      if (existing) {
        console.log(
          `  - skip (exists): ${item.name} — R$ ${formatBRL(item.priceCents)}`
        );
        skipped += 1;
        continue;
      }
      await prisma.menuItem.create({
        data: {
          organizationId: DEFAULT_ORGANIZATION_ID,
          currency: "BRL",
          available: true,
          ...item,
        },
      });
      console.log(
        `  + create: ${item.name} — R$ ${formatBRL(item.priceCents)}`
      );
      created += 1;
    } catch (err) {
      console.error(`  ! fail: ${item.name} — ${err.message}`);
      failed += 1;
    }
  }

  console.log(
    `[seed-menu] done created=${created} skipped=${skipped} failed=${failed}`
  );
  if (failed > 0) process.exit(1);
}

seedMenu()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[seed-menu] fatal:", err.message);
    process.exit(1);
  });
