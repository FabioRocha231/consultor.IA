/* eslint-env jest, node */
jest.mock("../../utils/prisma", () => ({
  external_communication_connectors: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
  },
}));
jest.mock("../../utils/telegramBot/utils", () => ({
  encryptToken: jest.fn((value) => `enc:${value}`),
}));

const prisma = require("../../utils/prisma");
const {
  ExternalCommunicationConnector,
  WHATSAPP_SECRET_FIELDS,
} = require("../../models/externalCommunicationConnector");

describe("ExternalCommunicationConnector", () => {
  beforeEach(() => jest.clearAllMocks());

  test("validates required whatsapp config fields", () => {
    expect(
      ExternalCommunicationConnector.validateConfig("whatsapp", {
        appSecret: "secret",
      })
    ).toEqual({
      valid: false,
      error: expect.stringContaining("phoneNumberId"),
    });
  });

  test("encrypts whatsapp secrets before persisting", async () => {
    prisma.external_communication_connectors.upsert.mockResolvedValue({
      id: 1,
      type: "whatsapp",
      config: JSON.stringify({
        appSecret: "enc:app-secret",
        phoneNumberId: "phone-1",
        accessToken: "enc:access-token",
        verifyToken: "enc:verify-token",
        workspaceSlug: "workspace",
      }),
      active: true,
    });

    const result = await ExternalCommunicationConnector.upsert("whatsapp", {
      appSecret: "app-secret",
      phoneNumberId: "phone-1",
      accessToken: "access-token",
      verifyToken: "verify-token",
      workspaceSlug: "workspace",
      active: true,
    });

    const { config } = prisma.external_communication_connectors.upsert.mock
      .calls[0][0].create;
    expect(config).toContain('"appSecret":"enc:app-secret"');
    expect(config).toContain('"accessToken":"enc:access-token"');
    expect(config).toContain('"verifyToken":"enc:verify-token"');
    expect(config).not.toContain('"appSecret":"app-secret"');
    expect(config).not.toContain('"accessToken":"access-token"');
    expect(result.connector.config.accessToken).toBe("enc:access-token");
  });

  test("getStrict returns null when the connector is absent", async () => {
    prisma.external_communication_connectors.findUnique.mockResolvedValue(null);

    expect(await ExternalCommunicationConnector.getStrict("whatsapp")).toBeNull();
  });

  test("getStrict rethrows database failures", async () => {
    prisma.external_communication_connectors.findUnique.mockRejectedValue(
      new Error("db down")
    );

    await expect(
      ExternalCommunicationConnector.getStrict("whatsapp")
    ).rejects.toThrow("db down");
  });

  test("exports whatsapp secret field names for reuse", () => {
    expect(WHATSAPP_SECRET_FIELDS).toEqual([
      "appSecret",
      "accessToken",
      "verifyToken",
    ]);
  });
});
