import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import { pathToFileURL } from "node:url";

const PROXY_PATCH_FLAG = "__privacyEgressInsideProxy";
let connections = [];

function defaultPort(protocol, port) {
  if (port) return Number(port);
  return protocol === "https:" ? 443 : 80;
}

function normalizeHost(host) {
  return String(host || "")
    .replace(/^\[|\]$/g, "")
    .toLowerCase();
}

function recordConnection({
  host,
  port,
  method = null,
  path = null,
  status = null,
  bytes = 0,
  protocol = "http:",
}) {
  connections.push({
    workflow: null,
    host: normalizeHost(host),
    port: defaultPort(protocol, port),
    method,
    path,
    status,
    bytes,
    protocol,
  });
}

function proxyError(res, message) {
  if (res.headersSent) return res.destroy();
  res.writeHead(502, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: message }));
}

function handleProxyRequest(req, res) {
  if (req.method === "CONNECT") {
    const [host, port = "443"] = String(req.url || "").split(":");
    if (!host) return proxyError(res, "Invalid CONNECT target.");
    recordConnection({
      host,
      port,
      method: "CONNECT",
      path: null,
      status: 200,
      protocol: "https:",
    });
    const upstream = net.connect(Number(port), host, () => {
      res.writeHead(200, { Connection: "keep-alive" });
      req.pipe(upstream);
      upstream.pipe(req);
    });
    upstream.on("error", () => res.destroy());
    req.on("error", () => upstream.destroy());
    return;
  }

  if (req.url === "/__egress") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ connections }));
    return;
  }

  let target;
  try {
    target = new URL(req.url);
  } catch {
    return proxyError(res, "Only absolute proxy requests are supported.");
  }

  recordConnection({
    host: target.hostname,
    port: target.port,
    method: req.method,
    path: `${target.pathname}${target.search}`,
    status: null,
    protocol: target.protocol,
  });

  const upstream = http.request(
    target,
    { method: req.method, headers: req.headers },
    (upstreamRes) => {
      const chunks = [];
      upstreamRes.on("data", (chunk) => chunks.push(chunk));
      upstreamRes.on("end", () => {
        const body = Buffer.concat(chunks);
        const entry = connections.at(-1);
        if (entry) {
          entry.status = upstreamRes.statusCode || null;
          entry.bytes = body.length;
        }
        res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
        res.end(body);
      });
    }
  );
  upstream.on("error", () => proxyError(res, "Upstream request failed."));
  req.pipe(upstream);
}

export function startEgressProxy({ host = "127.0.0.1", port = 0 } = {}) {
  connections = [];
  const server = http.createServer(handleProxyRequest);
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const address = server.address();
      resolve({
        server,
        port: address.port,
        connections,
        close: () => new Promise((res) => server.close(() => res())),
      });
    });
  });
}

function appendEgress(entry) {
  const logPath = process.env.PRIVACY_EGRESS_LOG;
  if (!logPath) return;
  try {
    fs.appendFileSync(logPath, `${JSON.stringify(entry)}\n`);
  } catch {
    // The harness should not crash when telemetry recording fails.
  }
}

async function connectTunnel(proxy, host, port) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: proxy.hostname,
      port: proxy.port,
      method: "CONNECT",
      path: `${host}:${port}`,
    });
    req.on("connect", (res, socket) => {
      if (res.statusCode !== 200) {
        socket.destroy();
        reject(new Error(`CONNECT failed with ${res.statusCode}`));
        return;
      }
      const tlsSocket = tls.connect({
        socket,
        servername: host,
        rejectUnauthorized: false,
      });
      tlsSocket.on("secureConnect", () => resolve(tlsSocket));
      tlsSocket.on("error", reject);
    });
    req.on("error", reject);
    req.end();
  });
}

async function proxyFetch(request, proxyUrl) {
  const url = new URL(request.url);
  const body = await request.arrayBuffer();
  const headers = Object.fromEntries(request.headers.entries());
  delete headers.host;

  const options = {
    host: proxyUrl.hostname,
    port: proxyUrl.port,
    method: request.method,
    path: url.href,
    headers,
  };

  const requestFn = url.protocol === "https:" ? https.request : http.request;
  if (url.protocol === "https:") {
    const tunnel = await connectTunnel(
      proxyUrl,
      url.hostname,
      url.port || "443"
    );
    options.createConnection = () => tunnel;
    options.path = `${url.pathname}${url.search}`;
    options.servername = url.hostname;
    options.rejectUnauthorized = false;
  }

  const result = await new Promise((resolve, reject) => {
    const req = requestFn(options, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () =>
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks),
        })
      );
    });
    req.on("error", reject);
    if (body.byteLength > 0) req.write(Buffer.from(body));
    req.end();
  });

  return new Response(result.body, {
    status: result.status,
    headers: result.headers,
  });
}

function installFetchProxy(proxyUrl) {
  const originalFetch = globalThis.fetch;
  if (!originalFetch || globalThis[PROXY_PATCH_FLAG]) return;
  globalThis[PROXY_PATCH_FLAG] = true;

  globalThis.fetch = async (input, init = {}) => {
    const request =
      input instanceof Request
        ? new Request(input, init)
        : new Request(String(input), init);
    const url = new URL(request.url);
    if (["http:", "https:"].includes(url.protocol)) {
      return proxyFetch(request, proxyUrl);
    }
    return originalFetch(input, init);
  };
}

function installNetProxy() {
  const originalConnect = net.connect;
  if (!originalConnect || net[PROXY_PATCH_FLAG]) return;
  net[PROXY_PATCH_FLAG] = true;

  const wrapped = function privacyWrappedConnect(...args) {
    const options =
      typeof args[0] === "object" ? args[0] : { host: args[0], port: args[1] };
    appendEgress({
      host: options.host || "localhost",
      port: options.port || 5432,
      method: "connect",
      path: null,
      status: null,
      bytes: 0,
      protocol: "socket:",
    });
    return originalConnect.apply(this, args);
  };
  net.connect = wrapped;
  net.createConnection = wrapped;
}

export function installEgressInstrumentation({ proxyUrl, logPath = null }) {
  if (!proxyUrl) return;
  if (logPath) process.env.PRIVACY_EGRESS_LOG = logPath;
  const proxy = new URL(proxyUrl);
  installFetchProxy(proxy);
  installNetProxy();

  const wrapRequest = (mod, name, original, protocol) => {
    if (!original || mod[PROXY_PATCH_FLAG]) return;
    mod[PROXY_PATCH_FLAG] = true;
    mod[name] = function privacyWrappedRequest(input, options, callback) {
      const target = (() => {
        if (typeof input === "string" || input instanceof URL) {
          try {
            const url = new URL(input);
            return {
              host: url.hostname,
              port: defaultPort(protocol, url.port),
              method:
                typeof options === "object" ? options.method || "GET" : "GET",
              path: `${url.pathname}${url.search}`,
              protocol,
            };
          } catch {
            return null;
          }
        }
        const requestOptions =
          options && typeof options === "object"
            ? options
            : input && typeof input === "object"
              ? input
              : null;
        if (requestOptions) {
          return {
            host: requestOptions.hostname || requestOptions.host || "localhost",
            port: defaultPort(protocol, requestOptions.port),
            method: requestOptions.method || "GET",
            path: requestOptions.path || "/",
            protocol,
          };
        }
        return null;
      })();
      if (
        target &&
        !(target.host === proxy.hostname && target.port === Number(proxy.port))
      ) {
        appendEgress({ ...target, status: null, bytes: 0 });
      }
      if (typeof input === "string" || input instanceof URL) {
        if (typeof options === "function")
          return original.call(this, input, options);
        return original.call(this, input, options, callback);
      }
      return original.call(this, input, options, callback);
    };
  };

  wrapRequest(http, "request", http.request, "http:");
  wrapRequest(https, "request", https.request, "https:");
}

if (process.env.PRIVACY_EGRESS_PROXY) {
  installEgressInstrumentation({ proxyUrl: process.env.PRIVACY_EGRESS_PROXY });
}

const isDirectMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectMain) {
  startEgressProxy().then((proxy) => {
    console.log(JSON.stringify({ port: proxy.port }));
  });
}
