/* eslint-env jest, node */
const { sendWhatsAppText } = require("../../../integrations/whatsapp/client");

describe("whatsapp cloud api client", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    delete global.fetch;
  });

  test("sends a text message with the Cloud API payload", async () => {
    const response = {
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue("ok"),
    };
    global.fetch.mockResolvedValue(response);

    const result = await sendWhatsAppText({
      phoneNumberId: "phone-1",
      accessToken: "access-token",
      to: "wa-1",
      text: "Olá",
    });

    expect(result).toEqual({ status: 200, body: "ok" });
    expect(response.text).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://graph.facebook.com/v23.0/phone-1/messages",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer access-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: "wa-1",
          type: "text",
          text: { body: "Olá" },
        }),
      })
    );
  });

  test("throws a generic error on API failure without leaking the token", async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: jest.fn().mockResolvedValue("error body"),
    });

    await expect(
      sendWhatsAppText({
        phoneNumberId: "phone-1",
        accessToken: "access-token",
        to: "wa-1",
        text: "Olá",
      })
    ).rejects.toThrow("WhatsApp Cloud API returned HTTP 500");
  });

  test("aborts with a timeout error", async () => {
    global.fetch.mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener("abort", () =>
            reject(new Error("aborted"))
          );
        })
    );

    await expect(
      sendWhatsAppText({
        phoneNumberId: "phone-1",
        accessToken: "access-token",
        to: "wa-1",
        text: "Olá",
        timeoutMs: 5,
      })
    ).rejects.toThrow("WhatsApp Cloud API request timed out");
  });
});
