const { OTLPLogExporter } = require("@opentelemetry/exporter-logs-otlp-http");
const {
  getNodeAutoInstrumentations,
} = require("@opentelemetry/auto-instrumentations-node");
const {
  defaultResource,
  resourceFromAttributes,
} = require("@opentelemetry/resources");
const { logs: sdkLogs, NodeSDK } = require("@opentelemetry/sdk-node");
const { ATTR_SERVICE_NAME } = require("@opentelemetry/semantic-conventions");
const { createTraceExporter } = require("./tracing");
const { createMetricReader } = require("./metrics");

let sdk = null;

function parseResourceAttributes(value = "") {
  return value
    .split(",")
    .filter(Boolean)
    .reduce((attributes, pair) => {
      const [key, ...rest] = pair.split("=");
      if (key) attributes[key.trim()] = rest.join("=").trim();
      return attributes;
    }, {});
}

function start(options = {}) {
  if (process.env.OTEL_SDK_DISABLED === "true") return { disabled: true, sdk };
  if (sdk) return { sdk };

  if (options.endpoint)
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = options.endpoint;

  const serviceName =
    options.service || process.env.OTEL_SERVICE_NAME || "consultor-ia";
  const resource = defaultResource().merge(
    resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
      ...parseResourceAttributes(process.env.OTEL_RESOURCE_ATTRIBUTES),
    })
  );

  sdk = new NodeSDK({
    resource,
    traceExporter: createTraceExporter(),
    metricReaders: [createMetricReader()],
    logRecordProcessors: [
      new sdkLogs.BatchLogRecordProcessor(new OTLPLogExporter()),
    ],
    instrumentations: [
      getNodeAutoInstrumentations({
        "@opentelemetry/instrumentation-openai": { enabled: false },
      }),
    ],
  });
  sdk.start();

  const shutdown = () => {
    if (!sdk) return;
    sdk.shutdown().catch(() => {});
    sdk = null;
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);

  return { sdk };
}

module.exports = {
  start,
};
