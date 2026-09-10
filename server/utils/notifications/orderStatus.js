const {
  ExternalCommunicationConnector,
  WHATSAPP_SECRET_FIELDS,
} = require("../../models/externalCommunicationConnector");
const { sendWhatsAppText } = require("../../integrations/whatsapp/client");
const { decryptToken } = require("../telegramBot/utils");

function decryptWhatsAppConfig(config = {}) {
  const decrypted = { ...config };
  for (const field of WHATSAPP_SECRET_FIELDS) {
    if (typeof decrypted[field] === "string" && decrypted[field])
      decrypted[field] = decryptToken(decrypted[field]);
  }
  return decrypted;
}

function formatStatusNotification(order) {
  const messages = {
    pending: "Aguardando pagamento na entrega/retirada.",
    confirmed: "Confirmado! Em breve a cozinha começa a preparar.",
    preparing: "Seu pedido está sendo preparado! 🍳",
    ready: "Pronto para retirada/entrega! 🎉",
    delivered: "Entregue. Bom apetite!",
    cancelled: "Cancelado. Entre em contato se precisar.",
  };
  const msg =
    messages[order.status] || `Status atualizado para ${order.status}.`;
  return `Restaurante: Pedido #${order.id} — ${msg}`;
}

/**
 * Envia WhatsApp para o cliente sobre mudança de status.
 * Resolve o connector whatsapp, descriptografa secrets, e envia mensagem.
 * Falha é capturada e logada — nunca propaga erro para o caller.
 *
 * @param {object} order - pedido já com id, status, customerPhone
 * @returns {Promise<{sent: boolean, reason?: string}>}
 */
async function notifyOrderStatusChange(order) {
  try {
    const connector =
      await ExternalCommunicationConnector.getStrict("whatsapp");
    if (!connector?.active) {
      return { sent: false, reason: "whatsapp_connector_inactive" };
    }
    const config = decryptWhatsAppConfig(connector.config || {});
    const text = formatStatusNotification(order);
    await sendWhatsAppText({
      phoneNumberId: config.phoneNumberId,
      accessToken: config.accessToken,
      to: order.customerPhone,
      text,
    });
    return { sent: true };
  } catch (err) {
    console.error(
      "Failed to notify customer of order status change:",
      err.message
    );
    return { sent: false, reason: err.message };
  }
}

module.exports = {
  notifyOrderStatusChange,
  formatStatusNotification,
  decryptWhatsAppConfig,
};
