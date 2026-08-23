const { redact } = require("../../../utils/logger/redact");

describe("redact", () => {
  test("redacts secret keys recursively", () => {
    expect(
      redact({
        Authorization: "Bearer secret",
        nested: { api_key: "key", ok: 1 },
        cookies: ["session"],
        password: "pw",
        token: "jwt",
        safe: "value",
      })
    ).toEqual({
      Authorization: "[REDACTED]",
      nested: { api_key: "[REDACTED]", ok: 1 },
      cookies: "[REDACTED]",
      password: "[REDACTED]",
      token: "[REDACTED]",
      safe: "value",
    });
  });

  test("preserves non-sensitive values", () => {
    expect(redact({ request_id: "req-1", status: 200 })).toEqual({
      request_id: "req-1",
      status: 200,
    });
  });
});
