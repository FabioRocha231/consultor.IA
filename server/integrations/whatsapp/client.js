const { metrics } = require("@opentelemetry/api");

const GRAPH_API_BASE = "https://graph.facebook.com";
const GRAPH_API_VERSION = "v23.0";
const DEFAULT_TIMEOUT_MS = 10000;

const WHATSAPP_SCOPE = "consultor-ia.whatsapp";

const whatsappInteractiveSentTotal = metrics
  .getMeter(WHATSAPP_SCOPE)
  .createCounter("whatsapp_interactive_sent_total", {
    description: "WhatsApp interactive messages successfully sent",
  });

/**
 * Send a text message through the WhatsApp Cloud API.
 * @param {{phoneNumberId: string, accessToken: string, to: string, text: string, timeoutMs?: number}} options
 * @returns {Promise<{status: number}>}
 */
async function sendWhatsAppText({
  phoneNumberId,
  accessToken,
  to,
  text,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(
      `${GRAPH_API_BASE}/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "text",
          text: { body: String(text) },
        }),
        signal: controller.signal,
      }
    );
    const responseText = await response.text();
    if (!response.ok)
      throw new Error(`WhatsApp Cloud API returned HTTP ${response.status}`);
    return { status: response.status, body: responseText };
  } catch (error) {
    if (controller.signal.aborted)
      throw new Error("WhatsApp Cloud API request timed out");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function sendInteractive({
  phoneNumberId,
  accessToken,
  to,
  interactive,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(
      `${GRAPH_API_BASE}/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "interactive",
          interactive,
        }),
        signal: controller.signal,
      }
    );
    const responseText = await response.text();
    if (!response.ok)
      throw new Error(`WhatsApp Cloud API returned HTTP ${response.status}`);
    return { status: response.status, body: responseText };
  } catch (error) {
    if (controller.signal.aborted)
      throw new Error("WhatsApp Cloud API request timed out");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Send a WhatsApp interactive list message.
 * @param {{phoneNumberId: string, accessToken: string, to: string, headerText: string, bodyText: string, footerText: string, buttonLabel: string, sections: object[], timeoutMs?: number}} options
 * @returns {Promise<{status: number, body: string}>}
 */
async function sendWhatsAppList({
  phoneNumberId,
  accessToken,
  to,
  headerText,
  bodyText,
  footerText,
  buttonLabel,
  sections,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const { status, body } = await sendInteractive({
    phoneNumberId,
    accessToken,
    to,
    timeoutMs,
    interactive: {
      type: "list",
      header: { type: "text", text: headerText },
      body: { text: bodyText },
      footer: { text: footerText },
      action: { button: buttonLabel, sections },
    },
  });
  whatsappInteractiveSentTotal.add(1, { type: "list" });
  return { status, body };
}

/**
 * Send a WhatsApp interactive buttons message.
 * @param {{phoneNumberId: string, accessToken: string, to: string, headerText?: string, bodyText: string, footerText?: string, buttons: object[], timeoutMs?: number}} options
 * @returns {Promise<{status: number, body: string}>}
 */
async function sendWhatsAppButtons({
  phoneNumberId,
  accessToken,
  to,
  headerText,
  bodyText,
  footerText,
  buttons,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const interactive = {
    type: "button",
    body: { text: bodyText },
    action: { buttons },
  };
  if (headerText) interactive.header = { type: "text", text: headerText };
  if (footerText) interactive.footer = { text: footerText };

  const { status, body } = await sendInteractive({
    phoneNumberId,
    accessToken,
    to,
    timeoutMs,
    interactive,
  });
  whatsappInteractiveSentTotal.add(1, { type: "button" });
  return { status, body };
}

module.exports = { sendWhatsAppText, sendWhatsAppList, sendWhatsAppButtons };
