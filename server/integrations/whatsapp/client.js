const GRAPH_API_BASE = "https://graph.facebook.com";
const GRAPH_API_VERSION = "v23.0";
const DEFAULT_TIMEOUT_MS = 10000;

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

module.exports = { sendWhatsAppText };
