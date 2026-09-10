/* eslint-env jest, node */
const {
  sendWhatsAppList,
  sendWhatsAppButtons,
} = require("../../../integrations/whatsapp/client");
const {
  buildMenuListPayload,
  buildOrderConfirmationPayload,
  MAX_SECTIONS,
  MAX_ROWS_PER_SECTION,
  ROW_TITLE_MAX,
  ROW_DESCRIPTION_MAX,
  SECTION_TITLE_MAX,
} = require("../../../integrations/whatsapp/interactive");

function menuItem(overrides = {}) {
  return {
    id: 1,
    name: "Margherita",
    description: "Molho, mozzarella e manjericão.",
    priceCents: 4590,
    category: "Pizzas",
    available: true,
    ...overrides,
  };
}

describe("whatsapp interactive payload builders", () => {
  afterEach(() => {
    delete global.fetch;
  });

  test("groups menu items by category, skips unavailable items and caps limits", () => {
    const items = [];
    for (let section = 0; section < MAX_SECTIONS + 1; section += 1) {
      for (let row = 0; row < MAX_ROWS_PER_SECTION + 1; row += 1) {
        items.push(
          menuItem({
            id: section * 100 + row,
            category: `Categoria ${section} com nome enorme para truncar`,
            name: `Item muito longo ${section}-${row} com detalhes adicionais`,
            description: "d".repeat(90),
            available: row !== MAX_ROWS_PER_SECTION,
          })
        );
      }
    }

    const payload = buildMenuListPayload(items, {
      headerText: "Cardápio",
      bodyText: "Escolha uma opção",
      footerText: "Toque em uma opção",
      buttonLabel: "Ver cardápio",
    });

    expect(payload.sections).toHaveLength(MAX_SECTIONS);
    expect(payload.sections[0].title).toHaveLength(SECTION_TITLE_MAX);
    expect(payload.sections[0].rows).toHaveLength(MAX_ROWS_PER_SECTION);
    expect(payload.sections[0].rows[0].title).toHaveLength(ROW_TITLE_MAX);
    expect(payload.sections[0].rows[0].description).toHaveLength(ROW_DESCRIPTION_MAX);
    expect(payload.sections[0].rows.map((row) => row.id)).not.toContain("110");
  });

  test("keeps special characters valid through JSON encoding", () => {
    const payload = buildMenuListPayload(
      [
        menuItem({
          id: 13,
          name: 'Pizza "Especial"',
          description: "Linha 1\nLinha 2",
        }),
      ],
      {
        headerText: "Cardápio",
        bodyText: "Escolha uma opção",
        footerText: "Toque em uma opção",
      }
    );

    const encoded = JSON.stringify(payload);
    expect(encoded).toContain('Pizza \\"Especial\\"');
    expect(encoded).toContain("Linha 1\\nLinha 2");
  });

  test("rejects invalid or empty menu item input", () => {
    expect(() => buildMenuListPayload([], {})).toThrow(
      "menuItems must be a non-empty array"
    );
    expect(() =>
      buildMenuListPayload(
        [menuItem({ available: false })],
        { headerText: "Cardápio", bodyText: "Escolha" }
      )
    ).toThrow("at least one available item");
    expect(() =>
      buildMenuListPayload(
        [menuItem({ name: "" })],
        { headerText: "Cardápio", bodyText: "Escolha" }
      )
    ).toThrow("must have a name");
  });

  test("builds order confirmation buttons with the three expected actions", () => {
    const payload = buildOrderConfirmationPayload(
      { id: 7, totalCents: 4590, items: [] },
      { bodyText: "Confirme seu pedido", footerText: "Escolha uma ação" }
    );

    expect(payload.type).toBe("button");
    expect(payload.buttons.map((button) => button.reply.id)).toEqual([
      "confirm_7",
      "cancel_7",
      "edit_7",
    ]);
    expect(payload.buttons).toHaveLength(3);
  });

  test("does not exceed the interactive list literal Cloud API shape", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue("ok"),
    });
    const payload = buildMenuListPayload([menuItem()], {
      headerText: "Cardápio",
      bodyText: "Escolha uma opção",
      footerText: "Toque em uma opção",
      buttonLabel: "Ver cardápio",
    });

    await sendWhatsAppList({
      phoneNumberId: "phone-1",
      accessToken: "access-token",
      to: "wa-1",
      ...payload,
    });

    const sentBody = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(sentBody).toEqual({
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
                  description: "R$ 45,90 · Molho, mozzarella e manjericão.",
                },
              ],
            },
          ],
        },
      },
    });
  });

  test("does not exceed the interactive buttons literal Cloud API shape", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue("ok"),
    });
    const payload = buildOrderConfirmationPayload(
      { id: 7, totalCents: 4590, items: [] },
      { bodyText: "Confirme seu pedido", footerText: "Escolha uma ação" }
    );

    await sendWhatsAppButtons({
      phoneNumberId: "phone-1",
      accessToken: "access-token",
      to: "wa-1",
      ...payload,
    });

    const sentBody = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(sentBody.interactive.type).toBe("button");
    expect(sentBody.interactive.body.text).toBe("Confirme seu pedido");
    expect(sentBody.interactive.action.buttons).toHaveLength(3);
    expect(sentBody.interactive.header).toBeUndefined();
    delete global.fetch;
  });
});
