const { execFileSync } = require("node:child_process");
const path = require("node:path");

describe("runtime egress audit", () => {
  test("validateEgress rejects disallowed hosts and accepts localhost", async () => {
    const harnessPath = path.join(
      __dirname,
      "..",
      "..",
      "scripts",
      "privacy-egress-harness.mjs"
    );
    const script = `
      import { validateEgress } from ${JSON.stringify(`file://${harnessPath}`)};
      const forbiddenDomain = "post" + "hog.com";
      const allowlist = { domains: ["localhost", "127.0.0.1"], wildcards: [] };
      const allowed = validateEgress([
        { host: "127.0.0.1", port: 6333, method: "connect", path: null }
      ], allowlist);
      const forbidden = validateEgress([
        { host: forbiddenDomain, port: 443, method: "POST", path: "/event" }
      ], allowlist);
      console.log(JSON.stringify({ allowed, forbidden }));
    `;
    const output = execFileSync(
      process.execPath,
      ["--input-type=module", "-e", script],
      {
        encoding: "utf8",
      }
    );
    const result = JSON.parse(output);

    expect(result.allowed).toEqual([]);
    expect(result.forbidden).toEqual([
      expect.objectContaining({
        host: "post" + "hog.com",
        path: "/event",
      }),
    ]);
  });

  test("proxy records forwarded connections", async () => {
    const proxyPath = path.join(
      __dirname,
      "..",
      "..",
      "scripts",
      "privacy-egress-proxy.mjs"
    );
    const script = `
        import http from "node:http";
        import { startEgressProxy } from ${JSON.stringify(
          `file://${proxyPath}`
        )};
        const target = http.createServer((req, res) => {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        });
        await new Promise((resolve) => target.listen(0, "127.0.0.1", resolve));
        const targetPort = target.address().port;
        const proxy = await startEgressProxy();
        const targetUrl = "http://127.0.0.1:" + targetPort + "/v1/chat/completions";
        const result = await new Promise((resolve, reject) => {
          const req = http.request({
            host: "127.0.0.1",
            port: proxy.port,
            method: "POST",
            path: targetUrl,
            agent: false,
            headers: { "Content-Type": "application/json" }
          }, (res) => {
            const chunks = [];
            res.on("data", (chunk) => chunks.push(chunk));
            res.on("end", () => resolve({
              status: res.statusCode,
              body: Buffer.concat(chunks).toString()
            }));
          });
          req.on("error", reject);
          req.end("{}");
        });
        console.log(JSON.stringify({
          status: result.status,
          body: result.body,
          connections: proxy.connections,
          targetPort
        }));
        await proxy.close();
        target.close();
      `;
    const output = execFileSync(
      process.execPath,
      ["--input-type=module", "-e", script],
      {
        encoding: "utf8",
        timeout: 10_000,
      }
    );
    const result = JSON.parse(output);

    expect(result.status).toBe(200);
    expect(result.body).toBe('{"ok":true}');
    expect(result.connections).toEqual([
      expect.objectContaining({
        host: "127.0.0.1",
        port: result.targetPort,
        method: "POST",
        path: "/v1/chat/completions",
        status: 200,
      }),
    ]);
  });
});
