const { createLead } = require("./createLead");
const { requestHumanSupport } = require("./requestHumanSupport");

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
  plugin: [toAibitatPlugin(createLead), toAibitatPlugin(requestHumanSupport)],
};

module.exports = { n8nTools, createLead, requestHumanSupport };
