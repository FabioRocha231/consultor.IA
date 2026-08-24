/* eslint-env jest, node */
jest.mock("../../models/organization", () => ({
  Organization: {
    getBySlug: jest.fn(),
    all: jest.fn(),
  },
}));
jest.mock("../../models/evalDataset", () => ({
  EvalDataset: {
    create: jest.fn(),
    get: jest.fn(),
    list: jest.fn(),
    delete: jest.fn(),
  },
  EvalQuestion: {
    create: jest.fn(),
    delete: jest.fn(),
  },
}));
jest.mock("../../models/evalRun", () => ({
  EvalRun: {
    create: jest.fn(),
    get: jest.fn(),
    list: jest.fn(),
    fail: jest.fn(),
  },
  EvalResult: {},
}));
jest.mock("../../models/eventLogs", () => ({
  EventLogs: { logEvent: jest.fn() },
}));
jest.mock("../../utils/evalRunner", () => ({
  runEval: jest.fn(),
}));

const { Organization } = require("../../models/organization");
const { EvalDataset, EvalQuestion } = require("../../models/evalDataset");
const { EvalRun } = require("../../models/evalRun");
const { EventLogs } = require("../../models/eventLogs");
const { runEval } = require("../../utils/evalRunner");
const {
  evalEndpoints,
  evalRoleGuard,
  liveEvalAdminGuard,
} = require("../../endpoints/eval");

const organization = { id: "org-1", slug: "default", ragConfig: null };
const dataset = {
  id: "dataset-1",
  organizationId: "org-1",
  name: "Cardápio Q&A",
  questions: [{ id: "question-1", question: "Qual o horário?" }],
};
const run = {
  id: "run-1",
  datasetId: "dataset-1",
  organizationId: "org-1",
  status: "pending",
};

function registerEndpoints() {
  const handlers = {};
  const app = {
    get: (path, _middleware, handler) => {
      handlers[`GET ${path}`] = handler;
    },
    post: (path, _middleware, handler) => {
      handlers[`POST ${path}`] = handler;
    },
    delete: (path, _middleware, handler) => {
      handlers[`DELETE ${path}`] = handler;
    },
  };
  evalEndpoints(app);
  return handlers;
}

function mockResponse() {
  const response = {};
  response.status = jest.fn(() => response);
  response.json = jest.fn((body) => {
    response.body = body;
    return response;
  });
  response.sendStatus = jest.fn(() => response);
  response.end = jest.fn(() => response);
  return response;
}

describe("eval endpoints", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.EVAL_LIVE = "false";
  });

  afterAll(() => {
    delete process.env.EVAL_LIVE;
  });

  test("lists datasets paginated", async () => {
    Organization.getBySlug.mockResolvedValue(organization);
    EvalDataset.list.mockResolvedValue({ datasets: [dataset], total: 1 });
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["GET /eval/datasets"]({ query: {} }, response);

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.body.total).toBe(1);
    expect(response.body.datasets[0].id).toBe("dataset-1");
  });

  test("creates a dataset with questions", async () => {
    Organization.getBySlug.mockResolvedValue(organization);
    EvalDataset.create.mockResolvedValue({ dataset, error: null });
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["POST /eval/datasets"](
      { body: { name: "Cardápio Q&A", questions: [] } },
      response
    );

    expect(response.status).toHaveBeenCalledWith(201);
    expect(EvalDataset.create).toHaveBeenCalledWith({
      name: "Cardápio Q&A",
      description: undefined,
      company: undefined,
      organizationId: "org-1",
      questions: [],
    });
  });

  test("gets and deletes a dataset", async () => {
    EvalDataset.get.mockResolvedValue(dataset);
    EvalDataset.delete.mockResolvedValue(true);
    const handlers = registerEndpoints();
    const getResponse = mockResponse();

    await handlers["GET /eval/datasets/:id"](
      { params: { id: "dataset-1" } },
      getResponse
    );
    expect(getResponse.status).toHaveBeenCalledWith(200);
    expect(getResponse.body.dataset.id).toBe("dataset-1");

    const deleteResponse = mockResponse();
    await handlers["DELETE /eval/datasets/:id"](
      { params: { id: "dataset-1" } },
      deleteResponse
    );
    expect(deleteResponse.status).toHaveBeenCalledWith(200);
    expect(deleteResponse.body.success).toBe(true);
  });

  test("creates and deletes a question", async () => {
    EvalDataset.get.mockResolvedValue(dataset);
    EvalQuestion.create.mockResolvedValue({
      question: { id: "question-2" },
      error: null,
    });
    EvalQuestion.delete.mockResolvedValue(true);
    const handlers = registerEndpoints();
    const createResponse = mockResponse();

    await handlers["POST /eval/datasets/:id/questions"](
      {
        params: { id: "dataset-1" },
        body: { question: "Qual o telefone?" },
      },
      createResponse
    );
    expect(createResponse.status).toHaveBeenCalledWith(201);

    const deleteResponse = mockResponse();
    await handlers["DELETE /eval/questions/:id"](
      { params: { id: "question-2" } },
      deleteResponse
    );
    expect(deleteResponse.status).toHaveBeenCalledWith(200);
  });

  test("starts a run with the default rag config", async () => {
    Organization.getBySlug.mockResolvedValue(organization);
    EvalDataset.get.mockResolvedValue(dataset);
    EvalRun.create.mockResolvedValue({ run, error: null });
    runEval.mockResolvedValue({ ok: true });
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["POST /eval/datasets/:id/runs"](
      { params: { id: "dataset-1" }, body: {} },
      response
    );

    expect(response.status).toHaveBeenCalledWith(202);
    expect(response.body.run.id).toBe("run-1");
    expect(runEval).toHaveBeenCalledWith({
      runId: "run-1",
      config: expect.objectContaining({ topK: 4 }),
    });
  });

  test("live endpoint rejects when EVAL_LIVE is disabled", async () => {
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["POST /eval/live"](
      { body: { datasetId: "dataset-1" } },
      response
    );

    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.body.error).toContain("EVAL_LIVE=true");
    expect(EvalRun.create).not.toHaveBeenCalled();
  });

  test("live endpoint starts a run and writes an audit log when enabled", async () => {
    process.env.EVAL_LIVE = "true";
    Organization.getBySlug.mockResolvedValue(organization);
    EvalDataset.get.mockResolvedValue({
      ...dataset,
      company: "restaurante-a",
    });
    EvalRun.create.mockResolvedValue({ run, error: null });
    runEval.mockResolvedValue({ ok: true });
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["POST /eval/live"](
      {
        body: { datasetId: "dataset-1", configOverrides: { topK: 2 } },
      },
      response
    );

    expect(response.status).toHaveBeenCalledWith(202);
    expect(EvalRun.create).toHaveBeenCalledWith({
      datasetId: "dataset-1",
      organizationId: "org-1",
      configSnapshot: expect.objectContaining({
        mode: "live",
        company: "restaurante-a",
      }),
    });
    expect(runEval).toHaveBeenCalledWith({
      runId: "run-1",
      config: expect.objectContaining({ topK: 2, mode: "live" }),
      mode: "live",
    });
    expect(EventLogs.logEvent).toHaveBeenCalledWith(
      "rag_eval.live_run",
      expect.objectContaining({
        dataset_id: "dataset-1",
        run_id: "run-1",
        company: "restaurante-a",
      }),
      null
    );
  });

  test("live endpoint rejects invalid config overrides", async () => {
    process.env.EVAL_LIVE = "true";
    Organization.getBySlug.mockResolvedValue(organization);
    EvalDataset.get.mockResolvedValue(dataset);
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["POST /eval/live"](
      {
        body: {
          datasetId: "dataset-1",
          configOverrides: { topK: -1 },
        },
      },
      response
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(EvalRun.create).not.toHaveBeenCalled();
  });

  test("live run results are admin-only", async () => {
    EvalRun.get.mockResolvedValue({
      ...run,
      configSnapshot: { mode: "live" },
      results: [],
    });
    const handlers = registerEndpoints();
    const response = mockResponse();
    response.locals = {
      multiUserMode: true,
      user: { role: "manager" },
    };

    await handlers["GET /eval/runs/:id"]({ params: { id: "run-1" } }, response);

    expect(response.status).toHaveBeenCalledWith(403);
  });

  test("lists runs for a dataset", async () => {
    Organization.getBySlug.mockResolvedValue(organization);
    EvalRun.list.mockResolvedValue({ runs: [run], total: 1 });
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["GET /eval/runs"](
      { query: { datasetId: "dataset-1" } },
      response
    );

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.body.runs[0].id).toBe("run-1");
  });

  test("gets a run with results", async () => {
    EvalRun.get.mockResolvedValue({
      ...run,
      status: "completed",
      results: [{ id: "result-1" }],
    });
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["GET /eval/runs/:id"]({ params: { id: "run-1" } }, response);

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.body.run.results[0].id).toBe("result-1");
  });

  test("role guard allows admin/manager and blocks default in multi-user mode", async () => {
    const next = jest.fn();
    const denied = mockResponse();
    denied.locals = { multiUserMode: true, user: { role: "default" } };
    await evalRoleGuard({}, denied, next);
    expect(denied.status).toHaveBeenCalledWith(403);

    const deniedAgain = mockResponse();
    deniedAgain.locals = { multiUserMode: true, user: { role: "default" } };
    await evalRoleGuard({}, deniedAgain, next);
    expect(next).toHaveBeenCalledTimes(0);

    const allowed = mockResponse();
    allowed.locals = { multiUserMode: true, user: { role: "manager" } };
    await evalRoleGuard({}, allowed, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  test("live eval guard allows admin and blocks manager in multi-user mode", async () => {
    const next = jest.fn();
    const denied = mockResponse();
    denied.locals = { multiUserMode: true, user: { role: "manager" } };
    await liveEvalAdminGuard({}, denied, next);
    expect(denied.status).toHaveBeenCalledWith(403);

    const allowed = mockResponse();
    allowed.locals = { multiUserMode: true, user: { role: "admin" } };
    await liveEvalAdminGuard({}, allowed, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
