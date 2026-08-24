import { createRequire } from "node:module";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { startEgressProxy } from "./privacy-egress-proxy.mjs";
import { startLlmStub } from "./privacy-llm-stub.mjs";
import { startN8nStub } from "./privacy-n8n-stub.mjs";

const require = createRequire(import.meta.url);
const { Client } = require("pg");

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.resolve(SCRIPT_DIR, "..");
const ALLOWLIST_PATH = path.join(SCRIPT_DIR, "privacy-runtime-allowlist.json");
const PROXY_PATH = path.join(SCRIPT_DIR, "privacy-egress-proxy.mjs");

const USERNAME = "architect";
const PASSWORD = "PrivacyTest123!";
const WORKSPACE_NAME = "Privacy Runtime Smoke";
const DOC_PATH = "custom-documents/privacy-smoke.txt-hash.json";

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizeHost(host) {
  return String(host || "")
    .replace(/^\[|\]$/g, "")
    .toLowerCase();
}

export function isAllowedHost(host, allowlist) {
  const normalized = normalizeHost(host);
  if ((allowlist.domains ?? []).includes(normalized)) return true;
  return (allowlist.wildcards ?? []).some((wildcard) => {
    const suffix = wildcard.replace(/^\*\./, "").toLowerCase();
    return normalized === suffix || normalized.endsWith(`.${suffix}`);
  });
}

export function validateEgress(
  connections = [],
  allowlist = loadJson(ALLOWLIST_PATH)
) {
  const findings = [];
  for (const entry of connections) {
    if (!entry?.host) continue;
    if (!isAllowedHost(entry.host, allowlist)) {
      findings.push({
        workflow: entry.workflow || null,
        host: entry.host,
        port: entry.port,
        method: entry.method,
        path: entry.path,
        status: entry.status,
      });
    }
  }
  return findings;
}

function waitForPort(port, host = "127.0.0.1", timeoutMs = 20_000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const attempt = () => {
      const socket = net.connect(Number(port), host);
      socket.once("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`Timed out waiting for ${host}:${port}`));
        } else {
          setTimeout(attempt, 250);
        }
      });
    };
    attempt();
  });
}

async function waitForHttp(url, timeoutMs = 30_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status === 200) return true;
    } catch {
      // Server is still booting.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function log(message) {
  process.stderr.write(`${message}\n`);
}

async function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

async function createDatabase(baseUrl, dbName) {
  const adminUrl = new URL(baseUrl);
  if (!adminUrl.pathname || adminUrl.pathname === "/")
    adminUrl.pathname = "/postgres";
  const client = new Client({ connectionString: adminUrl.toString() });
  await client.connect();
  await client.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await client.query(`CREATE DATABASE ${dbName}`);
  await client.end();
}

async function dropDatabase(baseUrl, dbName) {
  const adminUrl = new URL(baseUrl);
  if (!adminUrl.pathname || adminUrl.pathname === "/")
    adminUrl.pathname = "/postgres";
  const client = new Client({ connectionString: adminUrl.toString() });
  await client.connect();
  await client.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await client.end();
}

function dbUrlWithDatabase(baseUrl, dbName) {
  const url = new URL(baseUrl);
  url.pathname = `/${dbName}`;
  return url.toString();
}

function seedModelCache(storageDir) {
  const pricingDir = path.join(storageDir, "models", "pricing");
  const contextWindowDir = path.join(storageDir, "models", "context-windows");
  fs.mkdirSync(pricingDir, { recursive: true });
  fs.mkdirSync(contextWindowDir, { recursive: true });
  fs.writeFileSync(
    path.join(pricingDir, "model-pricing.json"),
    JSON.stringify({
      openai: { models: { "gpt-4o": { cost: { input: 1, output: 1 } } } },
    })
  );
  fs.writeFileSync(path.join(pricingDir, ".cached_at"), String(Date.now()));
  fs.writeFileSync(path.join(contextWindowDir, "context-windows.json"), "{}");
  fs.writeFileSync(
    path.join(contextWindowDir, ".cached_at"),
    String(Date.now())
  );
}

function runPrismaMigrate(dbUrl) {
  const prismaEntry = path.join(
    SERVER_DIR,
    "node_modules",
    "prisma",
    "build",
    "index.js"
  );
  const result = spawnSync(
    process.execPath,
    [prismaEntry, "migrate", "deploy"],
    {
      cwd: SERVER_DIR,
      env: { ...process.env, DB_URL: dbUrl, DATABASE_URL: dbUrl },
      encoding: "utf8",
      timeout: 120_000,
    }
  );
  if (result.status !== 0) {
    throw new Error(
      `prisma migrate deploy failed: ${result.stderr || result.stdout}`
    );
  }
}

function collectChildOutput(child) {
  let output = "";
  const capture = (chunk) => {
    output = `${output}${chunk}`.slice(-20_000);
  };
  child.stdout.on("data", capture);
  child.stderr.on("data", capture);
  return () => output;
}

function stopChild(child) {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null) return resolve();
    child.once("exit", () => resolve());
    child.kill("SIGTERM");
    setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
    }, 5_000).unref();
  });
}

async function startServer({
  serverPort,
  storageDir,
  dbUrl,
  llmBasePath,
  qdrantUrl,
  proxyPort,
  egressLogPath,
}) {
  const env = {
    ...process.env,
    NODE_ENV: "production",
    STORAGE_DIR: storageDir,
    DB_URL: dbUrl,
    DATABASE_URL: dbUrl,
    SERVER_PORT: String(serverPort),
    AUTH_TOKEN: "",
    JWT_SECRET: "privacy-runtime-secret",
    SIG_KEY: "privacy-runtime-signature-key-0000000000000000",
    SIG_SALT: "privacy-runtime-signature-salt-0000000000",
    LLM_PROVIDER: "generic-openai",
    GENERIC_OPEN_AI_BASE_PATH: `${llmBasePath}/v1`,
    GENERIC_OPEN_AI_MODEL_PREF: "privacy-stub",
    GENERIC_OPEN_AI_MODEL_TOKEN_LIMIT: "4096",
    GENERIC_OPEN_AI_API_KEY: "privacy-stub-key",
    GENERIC_OPENAI_STREAMING_DISABLED: "true",
    EMBEDDING_ENGINE: "generic-openai",
    EMBEDDING_BASE_PATH: `${llmBasePath}/v1`,
    EMBEDDING_MODEL_PREF: "privacy-stub",
    GENERIC_OPEN_AI_EMBEDDING_API_KEY: "privacy-stub-key",
    GENERIC_OPEN_AI_EMBEDDING_MAX_CONCURRENT_CHUNKS: "1",
    VECTOR_DB: "qdrant",
    QDRANT_ENDPOINT: qdrantUrl,
    OTEL_SDK_DISABLED: "true",
    ANYTHINGLLM_FETCH_TIMEOUT: "15000",
    PRIVACY_EGRESS_PROXY: `http://127.0.0.1:${proxyPort}`,
    PRIVACY_EGRESS_LOG: egressLogPath,
    NODE_OPTIONS: `--import=${pathToFileURL(PROXY_PATH).href}`,
    DEPLOYMENT_EGRESS_DOMAINS: process.env.DEPLOYMENT_EGRESS_DOMAINS || "",
  };

  const child = spawn(process.execPath, [path.join(SERVER_DIR, "index.js")], {
    cwd: storageDir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const getOutput = collectChildOutput(child);
  const baseUrl = `http://127.0.0.1:${serverPort}`;

  try {
    await waitForHttp(`${baseUrl}/api/ping`);
  } catch (error) {
    throw new Error(`${error.message}\nServer output:\n${getOutput()}`);
  }

  return {
    child,
    baseUrl,
    env,
    getOutput,
    stop: () => stopChild(child),
  };
}

async function requestJson(
  baseUrl,
  pathname,
  {
    method = "GET",
    token = null,
    apiKey = null,
    body = null,
    headers = {},
  } = {}
) {
  const requestHeaders = { ...headers };
  if (token) requestHeaders.Authorization = `Bearer ${token}`;
  if (apiKey) requestHeaders.Authorization = `Bearer ${apiKey}`;
  if (body !== null) requestHeaders["Content-Type"] = "application/json";
  const res = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: requestHeaders,
    body: body === null ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, ok: res.ok, data, text };
}

async function requestRaw(
  baseUrl,
  pathname,
  {
    method = "GET",
    token = null,
    apiKey = null,
    body = null,
    headers = {},
  } = {}
) {
  const requestHeaders = { ...headers };
  if (token) requestHeaders.Authorization = `Bearer ${token}`;
  if (apiKey) requestHeaders.Authorization = `Bearer ${apiKey}`;
  const res = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: requestHeaders,
    body: body === null ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, ok: res.ok, text };
}

function writeSmokeDocument(storageDir) {
  const docDir = path.join(storageDir, "documents", "custom-documents");
  fs.mkdirSync(docDir, { recursive: true });
  fs.writeFileSync(
    path.join(docDir, path.basename(DOC_PATH)),
    JSON.stringify({
      id: "privacy-smoke-doc",
      url: "file://privacy-smoke.txt",
      title: "Privacy Smoke Document",
      docAuthor: "privacy-harness",
      description: "Deterministic runtime egress smoke document.",
      docSource: "privacy harness",
      chunkSource: "link://https://example.com/privacy-smoke",
      published: new Date().toISOString(),
      wordCount: 10,
      pageContent:
        "consultor.IA privacy runtime smoke document with a deterministic answer for RAG validation.",
      token_count_estimate: 12,
    })
  );
}

function egressKey(entry) {
  return [entry.host, entry.port, entry.method, entry.path].join(":");
}

function loadEgressLog(logPath) {
  if (!fs.existsSync(logPath)) return [];
  return fs
    .readFileSync(logPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function runN8nTool({ basePath, apiKey, serverEnv }) {
  const script = `
    const { postN8nWebhook } = require("./integrations/n8n/client");
    postN8nWebhook(
      "createLead",
      { name: "Privacy Smoke", email: "privacy@example.com", source: "runtime-harness" },
      {
        organization: {
          id: "org-privacy-smoke",
          n8nWebhookUrl: process.env.N8N_WEBHOOK_URL,
          n8nApiKey: process.env.N8N_API_KEY,
        },
      }
    ).then((result) => {
      if (!result.ok) {
        console.error(JSON.stringify(result));
        process.exit(2);
      }
      console.log(JSON.stringify(result));
      process.exit(0);
    }).catch((error) => {
      console.error(error.message);
      process.exit(3);
    });
  `;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["-e", script], {
      cwd: SERVER_DIR,
      env: {
        ...serverEnv,
        N8N_WEBHOOK_URL: `${basePath}/webhook/consultoria/create-lead`,
        N8N_API_KEY: apiKey,
        N8N_HTTP_TIMEOUT_MS: "3000",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`n8n tool timed out: ${stderr || stdout}`));
    }, 15_000);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      if (code !== 0)
        reject(new Error(stderr || stdout || `n8n tool exited ${code}`));
      else resolve(stdout);
    });
  });
}

function runNegativeEgress(host, proxyPort) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port: proxyPort,
        method: "POST",
        path: `http://${host}/event`,
        agent: false,
        headers: { "Content-Type": "application/json" },
      },
      (res) => {
        res.resume();
        res.on("end", resolve);
      }
    );
    req.on("error", (error) => {
      if (error.code === "ECONNREFUSED") reject(error);
      else resolve();
    });
    req.end("{}");
  });
}

async function runRuntimeEgressScan({ json = false } = {}) {
  const allowlist = loadJson(ALLOWLIST_PATH);
  const dbBaseUrl =
    process.env.DB_URL ||
    process.env.PRIVACY_DB_URL ||
    "postgresql://consultor:consultor@localhost:5432/consultor";
  const qdrantUrl = process.env.PRIVACY_QDRANT_URL || "http://127.0.0.1:6333";
  const dbName = `privacy_runtime_${process.pid}_${Date.now()}`.replace(
    /-/g,
    "_"
  );
  const dbUrl = dbUrlWithDatabase(dbBaseUrl, dbName);

  const llmStub = await startLlmStub();
  const n8nStub = await startN8nStub();
  const proxy = await startEgressProxy();
  // Layout under one temp root so that the server's relative hotdir
  // resolution (STORAGE_DIR/../../collector/hotdir) lands inside our tree
  // instead of /collector/hotdir at filesystem root (which is not writable
  // in CI).
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "privacy-runtime-"));
  const serverRoot = path.join(tempRoot, "server");
  const storageDir = path.join(serverRoot, "storage");
  const collectorHotdir = path.join(tempRoot, "collector", "hotdir");
  fs.mkdirSync(storageDir, { recursive: true });
  fs.mkdirSync(collectorHotdir, { recursive: true });
  const egressLogPath = path.join(storageDir, "egress.jsonl");
  const reportPath = path.join(os.tmpdir(), "privacy-runtime-report.json");
  const workflows = [];
  const egress = [];
  const seenProxy = new Set();
  const seenLog = new Set();

  let server = null;
  let serverPort = null;

  const captureEgress = (workflowName) => {
    for (const entry of proxy.connections) {
      if (seenProxy.has(entry)) continue;
      seenProxy.add(entry);
      egress.push({ ...entry, workflow: workflowName });
    }
    for (const entry of loadEgressLog(egressLogPath)) {
      const key = egressKey(entry);
      if (seenLog.has(key)) continue;
      seenLog.add(key);
      egress.push({ ...entry, workflow: workflowName });
    }
  };

  const runWorkflow = async (name, fn) => {
    const started = Date.now();
    try {
      const details = await fn();
      workflows.push({
        workflow: name,
        status: "ok",
        duration_ms: Date.now() - started,
        details,
      });
    } catch (error) {
      const serverExit = server?.child?.exitCode;
      workflows.push({
        workflow: name,
        status: "error",
        duration_ms: Date.now() - started,
        error:
          serverExit === null || serverExit === undefined
            ? error.message || String(error)
            : `${error.message || String(error)}\nServer exited: ${serverExit}\n${server
                .getOutput()
                .slice(-3_000)}`,
      });
    } finally {
      captureEgress(name);
    }
  };

  try {
    log("Creating isolated Postgres database and applying migrations...");
    await waitForPort(
      new URL(dbBaseUrl).port || 5432,
      new URL(dbBaseUrl).hostname
    );
    await createDatabase(dbBaseUrl, dbName);
    runPrismaMigrate(dbUrl);
    seedModelCache(storageDir);

    const qdrantPort = new URL(qdrantUrl).port || 6333;
    const qdrantHost = new URL(qdrantUrl).hostname;
    await waitForPort(qdrantPort, qdrantHost);

    serverPort = await findFreePort();
    log(`Starting server on port ${serverPort}...`);
    server = await startServer({
      serverPort,
      storageDir,
      dbUrl,
      llmBasePath: llmStub.basePath,
      qdrantUrl,
      proxyPort: proxy.port,
      egressLogPath,
    });

    let token = null;
    let apiKey = null;
    let workspaceSlug = null;

    await runWorkflow("boot", async () => {
      const result = await requestJson(server.baseUrl, "/api/ping");
      return { status: result.status, body: result.data };
    });

    await runWorkflow("api key create", async () => {
      const result = await requestJson(
        server.baseUrl,
        "/api/system/generate-api-key",
        {
          method: "POST",
          body: { name: "privacy-runtime" },
        }
      );
      if (!result.ok || !result.data?.apiKey?.secret)
        throw new Error(`api key failed: ${JSON.stringify(result.data)}`);
      apiKey = result.data.apiKey.secret;
      return { status: result.status };
    });

    await runWorkflow("auth signup", async () => {
      const result = await requestJson(
        server.baseUrl,
        "/api/system/enable-multi-user",
        {
          method: "POST",
          body: { username: USERNAME, password: PASSWORD },
        }
      );
      if (!result.ok)
        throw new Error(
          `enable-multi-user failed: ${JSON.stringify(result.data)}`
        );
      return { status: result.status, body: result.data };
    });

    await runWorkflow("auth login", async () => {
      const result = await requestJson(server.baseUrl, "/api/request-token", {
        method: "POST",
        body: { username: USERNAME, password: PASSWORD },
      });
      if (!result.ok || result.data?.valid !== true)
        throw new Error(`login failed: ${JSON.stringify(result.data)}`);
      token = result.data.token;
      return { status: result.status, user: result.data.user?.username };
    });

    await runWorkflow("organization create", async () => {
      const result = await requestJson(server.baseUrl, "/api/organization", {
        token,
      });
      if (!result.ok)
        throw new Error(`organization failed: ${JSON.stringify(result.data)}`);
      return {
        status: result.status,
        organizationId: result.data?.id,
        name: result.data?.name,
      };
    });

    await runWorkflow("workspace create", async () => {
      const result = await requestJson(
        server.baseUrl,
        "/api/v1/workspace/new",
        {
          method: "POST",
          apiKey,
          body: { name: WORKSPACE_NAME, chatMode: "chat" },
        }
      );
      if (!result.ok || !result.data?.workspace?.slug)
        throw new Error(`workspace failed: ${JSON.stringify(result.data)}`);
      workspaceSlug = result.data.workspace.slug;
      return { status: result.status, slug: workspaceSlug };
    });

    await runWorkflow("PDF upload + parsing", async () => {
      const pdf = Buffer.from(
        "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\nxref\n0 4\n0000000000 65535 f \ntrailer<</Size 4/Root 1 0 R>>\n%%EOF\n"
      );
      const form = new FormData();
      form.append(
        "file",
        new Blob([pdf], { type: "application/pdf" }),
        "privacy-smoke.pdf"
      );
      const res = await fetch(
        `${server.baseUrl}/api/workspace/${workspaceSlug}/upload`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        }
      );
      const text = await res.text();
      if (res.status >= 500 && /not online|processing API/.test(text)) {
        throw new Error(
          "Collector API is not online; PDF parsing is intentionally skipped without a collector service."
        );
      }
      if (!res.ok) throw new Error(`upload failed: ${text}`);
      return { status: res.status };
    });

    writeSmokeDocument(storageDir);
    await runWorkflow("embedding + Qdrant indexing", async () => {
      const result = await requestJson(
        server.baseUrl,
        `/api/workspace/${workspaceSlug}/update-embeddings`,
        {
          method: "POST",
          token,
          body: { adds: [DOC_PATH] },
        }
      );
      if (!result.ok)
        throw new Error(`embedding failed: ${JSON.stringify(result.data)}`);
      return { status: result.status, message: result.data?.message };
    });

    await new Promise((resolve) => setTimeout(resolve, 2_000));

    await runWorkflow("RAG query", async () => {
      const result = await requestJson(
        server.baseUrl,
        `/api/v1/workspace/${workspaceSlug}/chat`,
        {
          method: "POST",
          apiKey,
          body: {
            message: "What does the privacy smoke document contain?",
            mode: "query",
            sessionId: "privacy-rag",
          },
        }
      );
      if (!result.ok)
        throw new Error(`rag query failed: ${JSON.stringify(result.data)}`);
      return {
        status: result.status,
        data: result.data,
      };
    });

    await runWorkflow("LLM chat streaming", async () => {
      const result = await requestRaw(
        server.baseUrl,
        `/api/workspace/${workspaceSlug}/stream-chat`,
        {
          method: "POST",
          token,
          body: { message: "Tell me about consultor.IA." },
          headers: { Accept: "text/event-stream" },
        }
      );
      if (!result.ok) throw new Error(`stream chat failed: ${result.text}`);
      return {
        status: result.status,
        bytes: result.text.length,
        preview: result.text.slice(0, 240),
      };
    });

    await runWorkflow("agent execution", async () => {
      const result = await requestJson(
        server.baseUrl,
        `/api/v1/workspace/${workspaceSlug}/chat`,
        {
          method: "POST",
          apiKey,
          body: {
            message: "@agent Summarize the privacy smoke document.",
            mode: "automatic",
            sessionId: "privacy-agent",
          },
        }
      );
      if (!result.ok)
        throw new Error(`agent failed: ${JSON.stringify(result.data)}`);
      return {
        status: result.status,
        data: result.data,
      };
    });

    await runWorkflow("n8n tool execution", async () => {
      const output = await runN8nTool({
        basePath: n8nStub.basePath,
        apiKey: "privacy-n8n-secret",
        serverEnv: server.env,
      });
      return { output };
    });

    await runWorkflow("feedback positivo", async () => {
      const chats = await requestJson(
        server.baseUrl,
        `/api/workspace/${workspaceSlug}/chats`,
        { token }
      );
      const history = Array.isArray(chats.data?.history)
        ? chats.data.history
        : [];
      const chat = [...history].reverse().find((entry) => entry.chatId);
      if (!chat) throw new Error("No chat found for feedback.");
      const result = await requestJson(
        server.baseUrl,
        `/api/workspace/${workspaceSlug}/chat-feedback/${chat.chatId}`,
        {
          method: "POST",
          token,
          body: {
            score: true,
            category: "outro",
            comment: "runtime harness positive feedback",
          },
        }
      );
      if (!result.ok)
        throw new Error(`feedback failed: ${JSON.stringify(result.data)}`);
      return { status: result.status, chatId: chat.chatId };
    });

    await runWorkflow("RAG evaluation (mock)", async () => {
      const dataset = await requestJson(server.baseUrl, "/api/eval/datasets", {
        method: "POST",
        token,
        body: {
          name: "Privacy Runtime Smoke",
          description: "Runtime egress harness eval.",
          questions: [
            {
              question: "What does the privacy smoke document contain?",
              expectedAnswer: "A deterministic answer for RAG validation.",
              tags: ["runtime"],
            },
          ],
        },
      });
      if (!dataset.ok || !dataset.data?.dataset?.id)
        throw new Error(`eval dataset failed: ${JSON.stringify(dataset.data)}`);
      const run = await requestJson(
        server.baseUrl,
        `/api/eval/datasets/${dataset.data.dataset.id}/runs`,
        {
          method: "POST",
          token,
          body: {},
        }
      );
      if (!run.ok)
        throw new Error(`eval run failed: ${JSON.stringify(run.data)}`);
      return { status: run.status, runId: run.data?.run?.id };
    });

    await new Promise((resolve) => setTimeout(resolve, 1_000));
    captureEgress("RAG evaluation (mock)");

    const negativeHost = process.env.PRIVACY_EGRESS_NEGATIVE_HOST;
    if (negativeHost) {
      await runWorkflow("negative egress override", async () => {
        await runNegativeEgress(negativeHost, proxy.port);
        return { forcedHost: negativeHost };
      });
    }
  } finally {
    if (server) await server.stop();
    await llmStub.close();
    await n8nStub.close();
    await proxy.close();

    try {
      await dropDatabase(dbBaseUrl, dbName);
    } catch (error) {
      log(`Could not drop database ${dbName}: ${error.message}`);
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  const findings = validateEgress(egress, allowlist);
  const report = {
    ok: findings.length === 0,
    mode: "runtime",
    allowlist: allowlist.domains,
    workflows,
    egress,
    findings,
    serverPort,
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  if (json) log(`Report written to ${reportPath}`);
  return report;
}

export { runRuntimeEgressScan };
