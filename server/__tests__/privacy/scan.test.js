const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SCAN_PATH = path.join(__dirname, "..", "..", "scripts", "privacy-scan.mjs");

function makeTempDir(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "privacy-scan-"));
  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = path.join(dir, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }
  return dir;
}

function runScan(args = []) {
  try {
    const stdout = execFileSync(process.execPath, [SCAN_PATH, "--json", ...args], {
      encoding: "utf8",
      env: { ...process.env, NODE_ENV: "test" },
    });
    return { status: 0, output: JSON.parse(stdout) };
  } catch (error) {
    return { status: error.status ?? 1, output: JSON.parse(error.stdout) };
  }
}

describe("privacy scan", () => {
  test("passes on clean files", () => {
    const dir = makeTempDir({ "app.js": "module.exports = { ok: true };\n" });
    try {
      const result = runScan(["--root", dir]);
      expect(result.status).toBe(0);
      expect(result.output.ok).toBe(true);
      expect(result.output.findings).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("flags a forbidden npm package import", () => {
    const pkg = "post" + "hog" + "-node";
    const dir = makeTempDir({
      "app.js": `module.exports = require(${JSON.stringify(pkg)});\n`,
    });
    try {
      const result = runScan(["--root", dir]);
      expect(result.status).toBe(1);
      expect(result.output.ok).toBe(false);
      expect(result.output.findings).toContainEqual(
        expect.objectContaining({
          file: "app.js",
          line: 1,
          pattern: `npm_package:${pkg}`,
        })
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("flags a forbidden hardcoded domain", () => {
    const domain = "post" + "hog" + ".com";
    const dir = makeTempDir({
      "app.js": `module.exports = () => fetch(${JSON.stringify(
        `https://${domain}/event`
      )});\n`,
    });
    try {
      const result = runScan(["--root", dir]);
      expect(result.status).toBe(1);
      expect(result.output.findings).toContainEqual(
        expect.objectContaining({
          file: "app.js",
          pattern: `domain:${domain}`,
        })
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("flags a forbidden process.env variable", () => {
    const envVar = "POST" + "HOG_" + "API_KEY";
    const dir = makeTempDir({
      "app.js": `module.exports = process.env.${envVar};\n`,
    });
    try {
      const result = runScan(["--root", dir]);
      expect(result.status).toBe(1);
      expect(result.output.findings).toContainEqual(
        expect.objectContaining({
          file: "app.js",
          pattern: "env_var:POST" + "HOG_",
        })
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("network smoke flags a forbidden fetch", () => {
    const domain = "post" + "hog" + ".com";
    const endpointPath = path.join(
      __dirname,
      "..",
      "..",
      "endpoints",
      "_privacy_gate_network_test.js"
    );
    fs.writeFileSync(
      endpointPath,
      `fetch(${JSON.stringify(`https://${domain}/event`)});\nmodule.exports = {};\n`
    );
    try {
      const result = runScan(["--network"]);
      expect(result.status).toBe(1);
      expect(result.output.mode).toBe("network");
      expect(result.output.findings).toContainEqual(
        expect.objectContaining({ pattern: `network:${domain}` })
      );
    } finally {
      fs.rmSync(endpointPath, { force: true });
    }
  });
});
