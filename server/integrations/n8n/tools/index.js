const { createLead } = require("./createLead");
const { requestHumanSupport } = require("./requestHumanSupport");
const { getMenu } = require("./getMenu");
const { createOrder } = require("./createOrder");
const { getOrderStatus } = require("./getOrderStatus");
const { listMyOrders } = require("./listMyOrders");
const { updateOrderStatus } = require("./updateOrderStatus");

function toAibitatPlugin(tool) {
  return {
    name: tool.name,
    plugin() {
      return {
        name: tool.name,
        setup(aibitat) {
          aibitat.function({
            super: aibitat,
            name: tool.name,
            description: tool.description,
            parameters: tool.args,
            required: tool.args.required,
            handler: tool.handler,
          });
        },
      };
    },
  };
}

const n8nTools = {
  name: "n8n-tools",
  startupConfig: {
    params: {},
  },
  plugin: [
    toAibitatPlugin(createLead),
    toAibitatPlugin(requestHumanSupport),
    toAibitatPlugin(getMenu),
    toAibitatPlugin(createOrder),
    toAibitatPlugin(getOrderStatus),
    toAibitatPlugin(listMyOrders),
    toAibitatPlugin(updateOrderStatus),
  ],
};

module.exports = {
  n8nTools,
  createLead,
  requestHumanSupport,
  getMenu,
  createOrder,
  getOrderStatus,
  listMyOrders,
  updateOrderStatus,
};
