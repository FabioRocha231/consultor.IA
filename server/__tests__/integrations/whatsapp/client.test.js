/* eslint-env jest, node */
const {
  sendWhatsAppText,
  sendWhatsAppList,
  sendWhatsAppButtons,
} = require("../../../integrations/whatsapp/client");

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

  test("sends an interactive list with the Cloud API v23.0 payload", async () => {
    const response = {
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue("ok"),
    };
    global.fetch.mockResolvedValue(response);

    const result = await sendWhatsAppList({
      phoneNumberId: "phone-1",
      accessToken: "access-token",
      to: "wa-1",
      headerText: "Cardápio",
      bodyText: "Escolha uma opção",
      footerText: "Toque em uma opção",
      buttonLabel: "Ver cardápio",
      sections: [
        {
          title: "Pizzas",
          rows: [
            {
              id: "1",
              title: "Margherita",
              description: "R$ 45,90 · Molho e mussarela",
            },
          ],
        },
      ],
    });

    expect(result).toEqual({ status: 200, body: "ok" });
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
          type: "interactive",
          interactive: {
            type: "list",
            header: { type: "text", text: "Cardápio" },
            body: { text: "Escolha uma opção" },
            footer: { text: "Toque em uma opção" },
            action: {
              button: "Ver cardápio",
              sections: [
                {
                  title: "Pizzas",
                  rows: [
                    {
                      id: "1",
                      title: "Margherita",
                      description: "R$ 45,90 · Molho e mussarela",
                    },
                  ],
                },
              ],
            },
          },
        }),
      })
    );
  });

  test("sends interactive reply buttons with the Cloud API payload", async () => {
    const response = {
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue("ok"),
    };
    global.fetch.mockResolvedValue(response);

    const result = await sendWhatsAppButtons({
      phoneNumberId: "phone-1",
      accessToken: "access-token",
      to: "wa-1",
      headerText: "Pedido #7",
      bodyText: "Confirme seu pedido",
      footerText: "Escolha uma ação",
      buttons: [
        { type: "reply", reply: { id: "confirm_7", title: "Confirmar" } },
        { type: "reply", reply: { id: "cancel_7", title: "Cancelar" } },
        { type: "reply", reply: { id: "edit_7", title: "Editar" } },
      ],
    });

    expect(result).toEqual({ status: 200, body: "ok" });
    expect(global.fetch).toHaveBeenCalledWith(
      "https://graph.facebook.com/v23.0/phone-1/messages",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer access-token",
          "Content-Type": "application/json",
        },
      })
    );
    const sentBody = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(sentBody).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "wa-1",
      type: "interactive",
      interactive: {
        type: "button",
        header: { type: "text", text: "Pedido #7" },
        body: { text: "Confirme seu pedido" },
        footer: { text: "Escolha uma ação" },
        action: {
          buttons: [
            {
              type: "reply",
              reply: { id: "confirm_7", title: "Confirmar" },
            },
            {
              type: "reply",
              reply: { id: "cancel_7", title: "Cancelar" },
            },
            {
              type: "reply",
              reply: { id: "edit_7", title: "Editar" },
            },
          ],
        },
      },
    });
  });
});
