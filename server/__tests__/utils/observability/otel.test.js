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
});
