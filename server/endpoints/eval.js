const { Organization } = require("../models/organization");
const { EvalDataset, EvalQuestion } = require("../models/evalDataset");
const { EvalRun } = require("../models/evalRun");
const { reqBody } = require("../utils/http");
const { validatedRequest } = require("../utils/middleware/validatedRequest");
const { resolveRagConfig, validateRagConfig } = require("../utils/ragConfig");
const { runEval } = require("../utils/evalRunner");

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

async function currentOrganization() {
  return (
    (await Organization.getBySlug("default")) ||
    (await Organization.all())[0] ||
    null
  );
}

function parseLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

function parseOffset(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

async function evalRoleGuard(request, response, next) {
  if (!response.locals?.multiUserMode) return next();
  const user = response.locals?.user;
  if (user && ["admin", "manager"].includes(user.role)) return next();
  return response.status(403).json({ error: "Forbidden" });
}

function evalEndpoints(app) {
  if (!app) return;

  app.get(
    "/eval/datasets",
    [validatedRequest, evalRoleGuard],
    async (request, response) => {
      try {
        const organization = await currentOrganization();
        if (!organization)
          return response.status(404).json({ error: "No organization found." });
        const limit = parseLimit(request.query?.limit);
        const offset = parseOffset(request.query?.offset);
        const { datasets, total } = await EvalDataset.list({
          organizationId: organization.id,
          limit,
          offset,
        });
        response.status(200).json({ datasets, total, limit, offset });
      } catch (error) {
        console.error("Error listing eval datasets:", error);
        response.sendStatus(500).end();
      }
    }
  );

  app.post(
    "/eval/datasets",
    [validatedRequest, evalRoleGuard],
    async (request, response) => {
      try {
        const organization = await currentOrganization();
        if (!organization)
          return response.status(404).json({ error: "No organization found." });
        const body = reqBody(request) || {};
        const { dataset, error } = await EvalDataset.create({
          name: body.name,
          description: body.description,
          organizationId: organization.id,
          questions: body.questions,
        });
        if (!dataset)
          return response.status(400).json({ success: false, error });
        response.status(201).json({ dataset, error: null });
      } catch (error) {
        console.error("Error creating eval dataset:", error);
        response.sendStatus(500).end();
      }
    }
  );

  app.get(
    "/eval/datasets/:id",
    [validatedRequest, evalRoleGuard],
    async (request, response) => {
      try {
        const dataset = await EvalDataset.get(request.params.id);
        if (!dataset)
          return response.status(404).json({ error: "Dataset not found." });
        response.status(200).json({ dataset, error: null });
      } catch (error) {
        console.error("Error getting eval dataset:", error);
        response.sendStatus(500).end();
      }
    }
  );

  app.delete(
    "/eval/datasets/:id",
    [validatedRequest, evalRoleGuard],
    async (request, response) => {
      try {
        const deleted = await EvalDataset.delete(request.params.id);
        if (!deleted)
          return response
            .status(404)
            .json({ error: "Dataset not found or could not be deleted." });
        response.status(200).json({ success: true });
      } catch (error) {
        console.error("Error deleting eval dataset:", error);
        response.sendStatus(500).end();
      }
    }
  );

  app.post(
    "/eval/datasets/:id/questions",
    [validatedRequest, evalRoleGuard],
    async (request, response) => {
      try {
        const dataset = await EvalDataset.get(request.params.id);
        if (!dataset)
          return response.status(404).json({ error: "Dataset not found." });
        const body = reqBody(request) || {};
        const { question, error } = await EvalQuestion.create({
          datasetId: dataset.id,
          question: body.question,
          expectedAnswer: body.expectedAnswer,
          expectedSource: body.expectedSource,
          tags: body.tags,
        });
        if (!question)
          return response.status(400).json({ success: false, error });
        response.status(201).json({ question, error: null });
      } catch (error) {
        console.error("Error creating eval question:", error);
        response.sendStatus(500).end();
      }
    }
  );

  app.delete(
    "/eval/questions/:id",
    [validatedRequest, evalRoleGuard],
    async (request, response) => {
      try {
        const deleted = await EvalQuestion.delete(request.params.id);
        if (!deleted)
          return response
            .status(404)
            .json({ error: "Question not found or could not be deleted." });
        response.status(200).json({ success: true });
      } catch (error) {
        console.error("Error deleting eval question:", error);
        response.sendStatus(500).end();
      }
    }
  );

  app.post(
    "/eval/datasets/:id/runs",
    [validatedRequest, evalRoleGuard],
    async (request, response) => {
      try {
        const organization = await currentOrganization();
        if (!organization)
          return response.status(404).json({ error: "No organization found." });
        const dataset = await EvalDataset.get(request.params.id);
        if (!dataset)
          return response.status(404).json({ error: "Dataset not found." });
        if ((dataset.questions || []).length === 0)
          return response
            .status(400)
            .json({ error: "Dataset has no questions." });

        const body = reqBody(request) || {};
        let config;
        if (body.config) {
          const { ok, value, error } = validateRagConfig(body.config);
          if (!ok) return response.status(400).json({ error });
          config = resolveRagConfig({
            organization: { ragConfig: value },
            workspace: {},
          });
        } else {
          config = resolveRagConfig({ organization, workspace: {} });
        }

        const { run, error } = await EvalRun.create({
          datasetId: dataset.id,
          organizationId: organization.id,
          configSnapshot: config,
        });
        if (!run) return response.status(400).json({ success: false, error });
        runEval({ runId: run.id, config }).catch((error) =>
          EvalRun.fail(run.id, error)
        );
        response.status(202).json({ run, error: null });
      } catch (error) {
        console.error("Error starting eval run:", error);
        response.sendStatus(500).end();
      }
    }
  );

  app.get(
    "/eval/runs",
    [validatedRequest, evalRoleGuard],
    async (request, response) => {
      try {
        const organization = await currentOrganization();
        if (!organization)
          return response.status(404).json({ error: "No organization found." });
        const limit = parseLimit(request.query?.limit);
        const offset = parseOffset(request.query?.offset);
        const { runs, total } = await EvalRun.list({
          organizationId: organization.id,
          datasetId: request.query?.datasetId,
          limit,
          offset,
        });
        response.status(200).json({ runs, total, limit, offset });
      } catch (error) {
        console.error("Error listing eval runs:", error);
        response.sendStatus(500).end();
      }
    }
  );

  app.get(
    "/eval/runs/:id",
    [validatedRequest, evalRoleGuard],
    async (request, response) => {
      try {
        const run = await EvalRun.get(request.params.id);
        if (!run) return response.status(404).json({ error: "Run not found." });
        response.status(200).json({ run, error: null });
      } catch (error) {
        console.error("Error getting eval run:", error);
        response.sendStatus(500).end();
      }
    }
  );
}

module.exports = { evalEndpoints, evalRoleGuard };
