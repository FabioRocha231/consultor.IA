import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../..");
const SERVER_DIR = path.join(REPO_ROOT, "server");
const SCRIPTS_DIR = path.join(SERVER_DIR, "scripts");
const ALLOWLIST_PATH = path.join(SCRIPTS_DIR, "privacy-allowlist.json");
const FORBIDDEN_PATH = path.join(SCRIPTS_DIR, "privacy-forbidden.json");
const require = createRequire(import.meta.url);

const EXCLUDED_DIRS = new Set([
  ".git",
  "node_modules",
  "docs",
  "dist",
  "build",
  "coverage",
  ".github",
  "alloy",
  "extras/support",
]);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toPosixPath(value) {
  return value.split(path.sep).join("/");
}

function isExcludedFile(relativePath, name) {
  const posixPath = toPosixPath(relativePath);
  if (/^(README|LICENSE|CHANGELOG)/.test(name)) return true;
  if (/^server\/scripts\/privacy-.*\.json$/.test(posixPath)) return true;
  return false;
}

function walkFiles(root, onFile) {
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const fullPath = path.join(current, entry.name);
      const relativePath = path.relative(root, fullPath);
      if (entry.isDirectory()) {
        const parts = toPosixPath(relativePath).split("/");
        let prefix = "";
        const isExcluded = parts.some((part) => {
          prefix = prefix ? `${prefix}/${part}` : part;
          return EXCLUDED_DIRS.has(part) || EXCLUDED_DIRS.has(prefix);
        });
        if (isExcluded) continue;
        stack.push(fullPath);
      } else if (entry.isFile()) {
        if (isExcludedFile(relativePath, entry.name)) continue;
        onFile(fullPath, relativePath);
      }
    }
  }
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function addFinding(findings, file, line, pattern, match) {
  findings.push({
    file,
    line,
    pattern,
    match: String(match).trim(),
  });
}

function compileDomainMatchers(domains) {
  const matchers = [];
  const seen = new Set();
  for (const domain of domains) {
    const core = domain.replace(/^\*\./, "");
    if (seen.has(core)) continue;
    seen.add(core);
    matchers.push({
      name: `domain:${domain}`,
      regex: new RegExp(`\\b(?:${escapeRegExp(core)})\\b`, "gi"),
    });
  }
  return matchers;
}

function compilePackageMatchers(packages) {
  const matchers = [];
  for (const packageName of packages) {
    const source = packageName
      .split("*")
      .map(escapeRegExp)
      .join("[^'\"`/\\\\]*");
    matchers.push(
      {
        name: `npm_package:${packageName}`,
        regex: new RegExp(
          `(?:require\\(\\s*|from\\s+|import\\(\\s*)(['"])(?:${source})(\\1)`,
          "g"
        ),
      },
      {
        name: `package_dependency:${packageName}`,
        regex: new RegExp(`["'](?:${source})["']\\s*:\\s*["'][^"']*["']`, "g"),
      }
    );
  }
  return matchers;
}

function compileEnvVarMatchers(patterns) {
  return patterns.map((pattern) => {
    const prefix = pattern.replace(/^\^/, "").replace(/\$$/, "");
    const source = escapeRegExp(prefix) + "[A-Za-z0-9_]*";
    return {
      name: `env_var:${prefix}`,
      regex: new RegExp(
        `process\\.env\\.(?:${source})|process\\.env\\[(?:['"])(?:${source})(?:['"])`,
        "g"
      ),
    };
  });
}

function compileHeaderMatchers(headers) {
  if (headers.length === 0) return [];
  const source = headers.map(escapeRegExp).join("|");
  return [
    {
      name: "header_in_log",
      regex: new RegExp(
        `(?:console\\.(?:log|info|warn|error)|logger\\.(?:info|warn|error|debug|fatal))\\s*\\([^\\n]*\\b(?:${source})\\b`,
        "gi"
      ),
    },
  ];
}

function scanStatic(root, forbidden) {
  const findings = [];
  let scanned = 0;
  const matchers = [
    ...compileDomainMatchers(forbidden.domains ?? []),
    ...compilePackageMatchers(forbidden.npm_packages ?? []),
    ...compileEnvVarMatchers(forbidden.env_var_patterns ?? []),
    ...compileHeaderMatchers(forbidden.headers ?? []),
  ];

  walkFiles(root, (fullPath, relativePath) => {
    let content;
    try {
      content = fs.readFileSync(fullPath, "utf8");
    } catch {
      return;
    }
    if (content.includes("\0")) return;
    scanned += 1;

    const lines = content.split(/\r?\n/);
    const isMinified = /\.min\.[a-z]+$/i.test(relativePath);
    lines.forEach((line, index) => {
      for (const matcher of matchers) {
        if (isMinified && matcher.name === "header_in_log") continue;
        matcher.regex.lastIndex = 0;
        const match = matcher.regex.exec(line);
        if (match)
          addFinding(findings, relativePath, index + 1, matcher.name, match[0]);
      }
    });
  });

  return { findings, scanned };
}

function urlHost(value) {
  try {
    return new URL(String(value)).hostname;
  } catch {
    return null;
  }
}

function callerSource() {
  const stack = new Error().stack?.split("\n").slice(1) ?? [];
  const frame = stack.find((line) => line.includes("server/endpoints"));
  return frame ? frame.trim() : "";
}

function isAllowedHost(host, allowlist) {
  if ((allowlist.domains ?? []).includes(host)) return true;
  return (allowlist.wildcards ?? []).some((wildcard) => {
    const suffix = wildcard.replace(/^\*\./, "");
    return host === suffix || host.endsWith(`.${suffix}`);
  });
}

function scanNetwork(allowlist) {
  const findings = [];
  const attempts = [];
  const tempStorage = fs.mkdtempSync(path.join(os.tmpdir(), "privacy-gate-"));
  const pricingDir = path.join(tempStorage, "models", "pricing");
  fs.mkdirSync(pricingDir, { recursive: true });
  fs.writeFileSync(
    path.join(pricingDir, "model-pricing.json"),
    JSON.stringify({
      openai: {
        models: {
          "gpt-4o": {
            cost: { input: 1 },
          },
        },
      },
    })
  );
  fs.writeFileSync(path.join(pricingDir, ".cached_at"), String(Date.now()));
  const contextWindowDir = path.join(tempStorage, "models", "context-windows");
  fs.mkdirSync(contextWindowDir, { recursive: true });
  fs.writeFileSync(path.join(contextWindowDir, "context-windows.json"), "{}");
  fs.writeFileSync(
    path.join(contextWindowDir, ".cached_at"),
    String(Date.now())
  );

  process.env.NODE_ENV = "test";
  process.env.STORAGE_DIR = tempStorage;
  process.env.DATABASE_URL = "file:./storage/anythingllm.db";

  const originalFetch = globalThis.fetch;
  const originalConsole = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
  };

  globalThis.fetch = (url) => {
    attempts.push({
      url: String(url),
      host: urlHost(url),
      source: callerSource(),
    });
    return Promise.resolve({
      ok: false,
      status: 503,
      headers: { get: () => null },
      json: async () => ({}),
    });
  };
  console.log = console.info = console.warn = console.error = () => {};

  let imported = 0;
  try {
    walkFiles(path.join(SERVER_DIR, "endpoints"), (fullPath, relativePath) => {
      if (!relativePath.endsWith(".js")) return;
      try {
        require(fullPath);
        imported += 1;
      } catch (error) {
        addFinding(
          findings,
          relativePath,
          0,
          "network:import_failed",
          error.message
        );
      }
    });
  } finally {
    Object.assign(console, originalConsole);
    if (originalFetch) globalThis.fetch = originalFetch;
    else delete globalThis.fetch;
    fs.rmSync(tempStorage, { recursive: true, force: true });
  }

  for (const attempt of attempts) {
    if (!attempt.host) {
      addFinding(
        findings,
        "network",
        0,
        "network:unparseable_url",
        attempt.url
      );
    } else if (!isAllowedHost(attempt.host, allowlist)) {
      addFinding(
        findings,
        attempt.source || "network",
        0,
        `network:${attempt.host}`,
        attempt.url
      );
    }
  }

  return { findings, scanned: imported, attempts };
}

function parseArgs(argv) {
  const args = {
    json: false,
    network: false,
    root: REPO_ROOT,
  };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--json") args.json = true;
    else if (argv[index] === "--network") args.network = true;
    else if (argv[index] === "--root")
      args.root = path.resolve(argv[index + 1]);
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const allowlist = loadJson(ALLOWLIST_PATH);
  const forbidden = loadJson(FORBIDDEN_PATH);
  const result = args.network
    ? scanNetwork(allowlist)
    : scanStatic(args.root, forbidden);
  result.findings.sort(
    (a, b) => a.file.localeCompare(b.file) || Number(a.line) - Number(b.line)
  );

  const output = {
    ok: result.findings.length === 0,
    mode: args.network ? "network" : "static",
    findings: result.findings,
    scanned: result.scanned,
  };
  if (args.network) output.attempts = result.attempts;

  if (args.json) {
    console.log(JSON.stringify(output, null, 2));
  } else {
    for (const finding of result.findings)
      console.log(`${finding.file}:${finding.line} ${finding.pattern}`);
    console.log(
      `${result.findings.length} privacy finding(s) in ${result.scanned} file(s).`
    );
  }
  process.exitCode = result.findings.length === 0 ? 0 : 1;
}

main();
