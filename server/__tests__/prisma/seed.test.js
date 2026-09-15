process.env.NODE_ENV = "test";

const bcrypt = require("bcryptjs");

const users = [];
const settings = [];

jest.mock("@prisma/client", () => {
  const prisma = {
    $disconnect: jest.fn(async () => {}),
    system_settings: {
      findUnique: jest.fn(async ({ where }) => {
        return (
          settings.find((setting) => setting.label === where.label) || null
        );
      }),
      create: jest.fn(async ({ data }) => {
        const setting = { id: settings.length + 1, ...data };
        settings.push(setting);
        return setting;
      }),
      upsert: jest.fn(async ({ where, update, create }) => {
        const existing = settings.find((s) => s.label === where.label);
        if (existing) return Object.assign(existing, update);
        const setting = { id: settings.length + 1, ...create };
        settings.push(setting);
        return setting;
      }),
    },
    users: {
      findFirst: jest.fn(async ({ where }) => {
        return (
          users.find((user) => where.role?.in?.includes(user.role)) || null
        );
      }),
      create: jest.fn(async ({ data }) => {
        const user = { id: users.length + 1, ...data };
        users.push(user);
        return user;
      }),
    },
  };
  return { PrismaClient: jest.fn(() => prisma) };
});

const { bootstrapAdmin } = require("../../prisma/seed");

describe("prisma admin seed", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    users.length = 0;
    settings.length = 0;
    delete process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_PASSWORD;
    delete process.env.JWT_SECRET;
  });

  test("enables multi-user mode when it creates the admin and JWT_SECRET is set", async () => {
    settings.push({ id: 1, label: "multi_user_mode", value: "false" });
    process.env.ADMIN_EMAIL = "admin@test.com";
    process.env.ADMIN_PASSWORD = "SomeLongPassword123!";
    process.env.JWT_SECRET = "a".repeat(32);

    await bootstrapAdmin();

    expect(settings).toEqual([
      { id: 1, label: "multi_user_mode", value: "true" },
    ]);
  });

  test("fails closed: login stays enabled if creating the admin fails", async () => {
    const { PrismaClient } = require("@prisma/client");
    const prisma = new PrismaClient();
    prisma.users.create.mockRejectedValueOnce(new Error("db down"));
    process.env.ADMIN_EMAIL = "admin@test.com";
    process.env.ADMIN_PASSWORD = "SomeLongPassword123!";
    process.env.JWT_SECRET = "a".repeat(32);

    await expect(bootstrapAdmin()).rejects.toThrow("db down");

    expect(users).toHaveLength(0);
    expect(settings).toEqual([
      { id: 1, label: "multi_user_mode", value: "true" },
    ]);
  });

  test("leaves multi-user mode untouched without JWT_SECRET or when admin exists", async () => {
    process.env.ADMIN_EMAIL = "admin@test.com";
    process.env.ADMIN_PASSWORD = "SomeLongPassword123!";
    await bootstrapAdmin();
    expect(settings).toHaveLength(0);

    process.env.JWT_SECRET = "a".repeat(32);
    await bootstrapAdmin();
    expect(settings).toHaveLength(0);
  });

  test("skips silently when admin env vars are not set", async () => {
    const result = await bootstrapAdmin();

    expect(result).toEqual({ created: false });
    expect(users).toHaveLength(0);
  });

  test("rejects an invalid ADMIN_EMAIL", async () => {
    process.env.ADMIN_EMAIL = "not-an-email";
    process.env.ADMIN_PASSWORD = "SomeLongPassword123!";

    await expect(bootstrapAdmin()).rejects.toThrow(
      "ADMIN_EMAIL must be a valid email address"
    );
    expect(users).toHaveLength(0);
  });

  test("rejects a password shorter than 12 characters", async () => {
    process.env.ADMIN_EMAIL = "admin@test.com";
    process.env.ADMIN_PASSWORD = "short";

    await expect(bootstrapAdmin()).rejects.toThrow(
      "password must be at least 12 characters"
    );
    expect(users).toHaveLength(0);
  });

  test("skips when an admin already exists", async () => {
    users.push({ id: 1, username: "boss@test.com", role: "admin" });
    process.env.ADMIN_EMAIL = "newadmin@test.com";
    process.env.ADMIN_PASSWORD = "SomeLongPassword123!";

    const result = await bootstrapAdmin();

    expect(result).toEqual({ created: false });
    expect(users).toHaveLength(1);
  });

  test("creates the first admin with a valid bcrypt hash", async () => {
    process.env.ADMIN_EMAIL = "Admin@Test.com";
    process.env.ADMIN_PASSWORD = "SomeLongPassword123!";

    const result = await bootstrapAdmin();
    const createdUser = users[0];

    expect(result).toEqual({ created: true });
    expect(createdUser).toMatchObject({
      username: "admin@test.com",
      role: "admin",
      suspended: 0,
    });
    expect(createdUser.password).toMatch(/^\$2[aby]\$10\$/);
    await expect(
      bcrypt.compare("SomeLongPassword123!", createdUser.password)
    ).resolves.toBe(true);
  });
});
