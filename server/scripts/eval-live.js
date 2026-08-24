const path = require("path");
require("dotenv").config({
  path: path.join(__dirname, "..", ".env.development"),
});
require("dotenv").config();

const { Organization } = require("../models/organization");
const { EvalDataset } = require("../models/evalDataset");
const { EvalRun } = require("../models/evalRun");
const { EventLogs } = require("../models/eventLogs");
const { runEval } = require("../utils/evalRunner");
const { resolveRagConfig, validateRagConfig } = require("../utils/ragConfig");

function parseArgs(argv = process.argv.slice(2)) {
  const options = { configs: [], help: false };
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg.startsWith("--company=")) {
      options.company = arg.split("=").slice(1).join("=");
    } else if (arg.startsWith("--config=")) {
      options.configs.push(arg.slice("--config=".length));
    }
  }
  return options;
}

function parseConfig(raw = "") {
  const value = {};
  for (const pair of raw.split(",")) {
    if (!pair.includes("=")) continue;
    const [key, rawValue] = pair.split("=");
    const normalizedKey = key === "threshold" ? "similarityThreshold" : key;
    value[normalizedKey] =
      rawValue === "true"
        ? true
        : rawValue === "false"
          ? false
          : Number.isNaN(Number(rawValue))
            ? rawValue
            : Number(rawValue);
  }
  return value;
}

async function currentOrganization() {
  return (
    (await Organization.getBySlug("default")) ||
    (await Organization.all())[0] ||
    null
  );
}

function printUsage() {
  console.log(
    [
      "Usage: yarn eval:live --company=<slug> [--config=topK=4,threshold=0.25]",
      "",
      "company: dataset.company and workspace slug used for retrieval.",
      "config: repeatable RAG override, for example --config=topK=2 --config=topK=4.",
    ].join("\n")
  );
}

async function runLiveRun({ organization, dataset, configRaw }) {
  const overrides = configRaw ? parseConfig(configRaw) : {};
  const { ok, value, error } = validateRagConfig(overrides);
  if (!ok) throw new Error(`Invalid --config: ${error}`);

  const config = {
    ...resolveRagConfig({ organization: { ragConfig: value }, workspace: {} }),
    mode: "live",
    company: dataset.company,
  };
  const { run, error: runError } = await EvalRun.create({
    datasetId: dataset.id,
    organizationId: organization.id,
    configSnapshot: config,
  });
  if (!run) throw new Error(runError || "Failed to create evaluation run.");

  const metadata = {
    user_id: null,
    company: dataset.company,
    dataset_id: dataset.id,
    run_id: run.id,
    timestamp: new Date().toISOString(),
    cost_estimate: null,
  };
  await EventLogs.logEvent("rag_eval.live_run", metadata, null);

  const result = await runEval({ runId: run.id, config, mode: "live" });
  await EventLogs.logEvent(
    "rag_eval.live_completed",
    {
      ...metadata,
      timestamp: new Date().toISOString(),
      cost_estimate: result?.metrics?.totalCostUsd ?? null,
    },
    null
  );
  return result;
}

async function main() {
  const options = parseArgs();
  if (options.help) {
    printUsage();
    return;
  }
  if (!options.company)
    throw new Error("--company is required. Use --help for usage.");

  const organization = await currentOrganization();
  if (!organization) throw new Error("No organization found.");
  const { datasets } = await EvalDataset.list({
    organizationId: organization.id,
    company: options.company,
    limit: 1,
  });
  if (datasets.length === 0)
    throw new Error(`No eval dataset found for company "${options.company}".`);
  const dataset = datasets[0];
  if ((dataset.questions || []).length === 0)
    throw new Error("The selected dataset has no questions.");

  process.env.EVAL_LIVE = "true";
  const configs = options.configs.length ? options.configs : [null];
  const results = [];
  for (const configRaw of configs) {
    const result = await runLiveRun({
      organization,
      dataset,
      configRaw,
    });
    results.push({
      company: dataset.company,
      datasetId: dataset.id,
      config: configRaw || "default",
      runId: result?.runId,
      metrics: result?.metrics || null,
      ok: result?.ok === true,
    });
  }
  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exitCode = 1;
});
