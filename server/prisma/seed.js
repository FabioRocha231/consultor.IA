/**
 * consultor.IA Prisma seed.
 *
 * Run from the server directory:
 *   node prisma/seed.js
 *   npx prisma db seed
 *
 * The seed is idempotent and performs two tasks:
 *  1. Seeds default system settings when a database is configured.
 *  2. Bootstraps the first admin from ADMIN_EMAIL and ADMIN_PASSWORD.
 *
 * The admin bootstrap only runs when BOTH ADMIN_EMAIL and ADMIN_PASSWORD are
 * set. It requires a password with at least 12 characters and creates a single
 * user with role "admin". If an admin or manager already exists, the seed skips
 * creation. Set these variables before the first boot of a new deployment;
 * changing them later has no effect because the seed never updates users.
 *
 * Exit codes:
 *  0 - seed completed or skipped
 *  1 - invalid input or database failure
 */

if (process.env.NODE_ENV !== "test") {
  process.env.NODE_ENV === "development"
    ? require("dotenv").config({ path: `.env.${process.env.NODE_ENV}` })
    : require("dotenv").config();
}

const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

const DEFAULT_SETTINGS = [
  { label: "multi_user_mode", value: "false" },
  { label: "logo_filename", value: "anything-llm.png" },
];

const prisma = new PrismaClient();

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value));
}

async function seedSystemSettings() {
  for (const setting of DEFAULT_SETTINGS) {
    const existing = await prisma.system_settings.findUnique({
      where: { label: setting.label },
    });

    if (!existing) {
      await prisma.system_settings.create({ data: setting });
    }
  }
}

async function bootstrapAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.log("skipping admin bootstrap");
    return { created: false };
  }

  if (!isValidEmail(email)) {
    throw new Error("ADMIN_EMAIL must be a valid email address");
  }

  if (String(password).length < 12) {
    throw new Error("password must be at least 12 characters");
  }

  const existingAdmin = await prisma.users.findFirst({
    where: { role: { in: ["admin", "manager"] } },
  });
  if (existingAdmin) {
    console.log("admin already exists, skipping");
    return { created: false };
  }

  const username = String(email).trim().toLowerCase();
  const hashedPassword = await bcrypt.hash(String(password), 10);
  await prisma.users.create({
    data: {
      username,
      password: hashedPassword,
      role: "admin",
      suspended: 0,
    },
  });

  console.log(`created initial admin user: ${username}`);
  return { created: true };
}

async function main() {
  if (process.env.DATABASE_URL || process.env.DB_URL) {
    await seedSystemSettings();
  }

  return bootstrapAdmin();
}

main()
  .catch((error) => {
    console.error(`seed failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

module.exports = {
  bootstrapAdmin,
  seedSystemSettings,
};
