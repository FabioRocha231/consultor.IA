process.env.OTEL_SDK_DISABLED = "true";

const { getMeter } = require("../../../utils/observability/metrics");
const { getTracer } = require("../../../utils/observability/tracing");
const { start } = require("../../../utils/observability");

describe("OpenTelemetry bootstrap", () => {
  test("imports tracer and meter helpers without error", () => {
    expect(typeof getTracer).toBe("function");
    expect(typeof getMeter).toBe("function");
  });

  test("honors OTEL_SDK_DISABLED without touching exporters", () => {
    expect(start({ service: "test" }).disabled).toBe(true);
  });

  test("skips the SDK when no OTLP endpoint is configured", () => {
    const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    process.env.OTEL_SDK_DISABLED = "false";
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    try {
      const result = start({ service: "test" });
      expect(result.disabled).toBe(true);
      expect(result.sdk).toBeNull();
    } finally {
      process.env.OTEL_SDK_DISABLED = "true";
      if (endpoint !== undefined)
        process.env.OTEL_EXPORTER_OTLP_ENDPOINT = endpoint;
    }
  });
});
