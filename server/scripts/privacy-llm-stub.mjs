import http from "node:http";
import { pathToFileURL } from "node:url";

const embedding = Array(1536).fill(0.01);

function jsonResponse(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function chatCompletions(req, res) {
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });
  req.on("end", () => {
    let stream = false;
    try {
      stream = Boolean(JSON.parse(body || "{}").stream);
    } catch {
      stream = false;
    }

    if (stream) {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      const now = Math.floor(Date.now() / 1000);
      res.write(
        `data: ${JSON.stringify({
          id: "chatcmpl-privacy-stream",
          object: "chat.completion.chunk",
          created: now,
          model: "privacy-stub",
          choices: [
            {
              index: 0,
              delta: { role: "assistant", content: "ok" },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        })}\n\n`
      );
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }

    jsonResponse(res, 200, {
      choices: [{ message: { role: "assistant", content: "ok" } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    });
  });
}

function embeddings(req, res) {
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });
  req.on("end", () => {
    let input = [];
    try {
      input = JSON.parse(body || "{}").input ?? [];
    } catch {
      input = [];
    }
    const items = (Array.isArray(input) ? input : [input]).map(() => ({
      object: "embedding",
      index: 0,
      embedding,
    }));
    jsonResponse(res, 200, {
      data: items,
      usage: { prompt_tokens: items.length, completion_tokens: 0 },
    });
  });
}

export function startLlmStub({ host = "127.0.0.1", port = 0 } = {}) {
  const server = http.createServer((req, res) => {
    if (req.method !== "POST")
      return jsonResponse(res, 405, { error: "Method not allowed" });
    if (req.url === "/v1/chat/completions") return chatCompletions(req, res);
    if (req.url === "/v1/embeddings") return embeddings(req, res);
    return jsonResponse(res, 404, { error: "Not found" });
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
  startLlmStub().then((stub) => {
    console.log(JSON.stringify({ port: stub.port }));
  });
}
