const { healthEndpoints } = require("../../endpoints/health");

describe("health endpoints", () => {
  test("registers liveness and readiness routes", () => {
    const app = { get: jest.fn() };
    healthEndpoints(app);

    expect(app.get).toHaveBeenCalledWith("/health", expect.any(Function));
    expect(app.get).toHaveBeenCalledWith("/ready", expect.any(Function));
  });
});
