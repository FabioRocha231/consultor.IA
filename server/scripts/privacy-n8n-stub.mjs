import crypto from "node:crypto";
import http from "node:http";
import { pathToFileURL } from "node:url";

function jsonResponse(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function isValidSignature(body, header, apiKey) {
  const expected = `sha256=${crypto.createHmac("sha256", apiKey).update(body).digest("hex")}`;
  return header === expected;
}

export function startN8nStub({
  host = "127.0.0.1",
  port = 0,
  apiKey = "privacy-n8n-secret",
} = {}) {
  const server = http.createServer((req, res) => {
    if (req.method !== "POST")
      return jsonResponse(res, 405, { error: "Method not allowed" });
    if (
      ![
        "/webhook/consultoria/create-lead",
        "/webhook/consultoria/request-human-support",
      ].includes(req.url)
    ) {
      return jsonResponse(res, 404, { error: "Webhook not found" });
    }

    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      if (!isValidSignature(body, req.headers["x-n8n-signature"], apiKey)) {
        return jsonResponse(res, 401, { error: "Invalid HMAC signature" });
      }

      let tool = "createLead";
      try {
        tool = JSON.parse(body || "{}").tool ?? tool;
      } catch {
        tool = "createLead";
      }
      const output =
        tool === "requestHumanSupport"
          ? {
              ticket_id: `ticket-${Date.now()}`,
              eta_iso: new Date().toISOString(),
            }
          : { lead_id: `lead-${Date.now()}`, status: "created" };

      jsonResponse(res, 200, {
        ok: true,
        tool,
        output,
        error: null,
        timestamp: new Date().toISOString(),
      });
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const address = server.address();
      resolve({
        server,
        port: address.port,
        basePath: `http://${host}:${address.port}`,
        close: () => new Promise((res) => server.close(() => res())),
      });
    });
  });
}

const isDirectMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectMain) {
  startN8nStub().then((stub) => {
    console.log(JSON.stringify({ port: stub.port }));
  });
}
