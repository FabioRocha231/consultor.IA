const MAX_SECTIONS = 10;
const MAX_ROWS_PER_SECTION = 10;
const ROW_TITLE_MAX = 24;
const ROW_DESCRIPTION_MAX = 72;
const SECTION_TITLE_MAX = 24;
const HEADER_TEXT_MAX = 60;
const BODY_TEXT_MAX = 1024;
const FOOTER_TEXT_MAX = 60;
const LIST_BUTTON_LABEL_MAX = 20;
const REPLY_BUTTON_TITLE_MAX = 20;
const MAX_BUTTONS = 3;
const INTERACTIVE_MARKER = "__INTERACTIVE__:";

function truncate(text, max) {
  if (typeof text !== "string") return text;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function requireString(value, field) {
  if (typeof value !== "string" || !value.trim())
    throw new Error(`${field} is required.`);
  return value;
}

function formatBRL(priceCents) {
  return `R$ ${(priceCents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function validateMenuItem(item) {
  if (!item || item.id === undefined || item.id === null)
    throw new Error("Every menu item must have an id.");
  if (typeof item.name !== "string" || !item.name.trim())
    throw new Error("Every menu item must have a name.");
  if (
    typeof item.priceCents !== "number" ||
    !Number.isInteger(item.priceCents) ||
    item.priceCents < 0
  )
    throw new Error(
      "Every menu item priceCents must be a non-negative integer."
    );
}

/**
 * Build the internal interactive descriptor consumed by sendWhatsAppList.
 */
function buildMenuListPayload(menuItems, options = {}) {
  if (!Array.isArray(menuItems) || menuItems.length === 0)
    throw new Error("menuItems must be a non-empty array.");

  const availableItems = menuItems.filter((item) => item.available !== false);
  if (availableItems.length === 0)
    throw new Error("menuItems must contain at least one available item.");

  const grouped = new Map();
  for (const item of availableItems) {
    validateMenuItem(item);
    const category = item.category || "Outros";
    if (!grouped.has(category)) grouped.set(category, []);
    grouped.get(category).push(item);
  }

  const sections = [...grouped.entries()]
    .slice(0, MAX_SECTIONS)
    .map(([category, items]) => ({
      title: truncate(category, SECTION_TITLE_MAX),
      rows: items.slice(0, MAX_ROWS_PER_SECTION).map((item) => ({
        id: String(item.id),
        title: truncate(item.name, ROW_TITLE_MAX),
        description: truncate(
          `${formatBRL(item.priceCents)} · ${item.description || ""}`,
          ROW_DESCRIPTION_MAX
        ),
      })),
    }));

  return {
    type: "list",
    headerText: truncate(
      requireString(options.headerText, "headerText"),
      HEADER_TEXT_MAX
    ),
    bodyText: truncate(
      requireString(options.bodyText, "bodyText"),
      BODY_TEXT_MAX
    ),
    footerText: truncate(
      options.footerText == null ? "" : String(options.footerText),
      FOOTER_TEXT_MAX
    ),
    buttonLabel: truncate(
      options.buttonLabel || "Ver cardápio",
      LIST_BUTTON_LABEL_MAX
    ),
    sections,
  };
}

/**
 * Build the internal interactive descriptor consumed by sendWhatsAppButtons.
 */
function buildOrderConfirmationPayload(order, options = {}) {
  if (!order || order.id === undefined || order.id === null)
    throw new Error("order must have an id.");
  const buttons = [
    {
      type: "reply",
      reply: { id: `confirm_${order.id}`, title: "Confirmar" },
    },
    {
      type: "reply",
      reply: { id: `cancel_${order.id}`, title: "Cancelar" },
    },
    {
      type: "reply",
      reply: { id: `edit_${order.id}`, title: "Editar" },
    },
  ];
  if (buttons.length > MAX_BUTTONS)
    throw new Error("Interactive buttons cannot exceed 3.");

  return {
    type: "button",
    bodyText: truncate(
      requireString(options.bodyText, "bodyText"),
      BODY_TEXT_MAX
    ),
    footerText: truncate(
      options.footerText == null ? "" : String(options.footerText),
      FOOTER_TEXT_MAX
    ),
    buttons: buttons.map((button) => ({
      ...button,
      reply: {
        ...button.reply,
        title: truncate(button.reply.title, REPLY_BUTTON_TITLE_MAX),
      },
    })),
  };
}

module.exports = {
  buildMenuListPayload,
  buildOrderConfirmationPayload,
  MAX_SECTIONS,
  MAX_ROWS_PER_SECTION,
  ROW_TITLE_MAX,
  ROW_DESCRIPTION_MAX,
  SECTION_TITLE_MAX,
  HEADER_TEXT_MAX,
  BODY_TEXT_MAX,
  FOOTER_TEXT_MAX,
  LIST_BUTTON_LABEL_MAX,
  REPLY_BUTTON_TITLE_MAX,
  MAX_BUTTONS,
  truncate,
  INTERACTIVE_MARKER,
};
