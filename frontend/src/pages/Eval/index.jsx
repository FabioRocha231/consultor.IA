import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { isMobile } from "react-device-detect";
import { Plus, Trash, Play, X } from "@phosphor-icons/react";
import Sidebar, { SidebarMobileHeader } from "@/components/Sidebar";
import Modal, {
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalInput,
  ModalPrimaryButton,
  ModalSecondaryButton,
} from "@/components/lib/Modal";
import { API_BASE } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...baseHeaders(),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Request failed.");
  return body;
}

function emptyQuestion() {
  return { question: "", expectedAnswer: "", expectedSource: "", tags: "" };
}

function parseTags(value = "") {
  return String(value)
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export default function Eval() {
  const { t } = useTranslation();
  const [datasets, setDatasets] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedDataset, setSelectedDataset] = useState(null);
  const [runs, setRuns] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showQuestion, setShowQuestion] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    name: "",
    description: "",
    questions: [emptyQuestion()],
  });
  const [questionDraft, setQuestionDraft] = useState(emptyQuestion());

  const loadDatasets = async () => {
    const data = await api("/eval/datasets?limit=50&offset=0");
    setDatasets(data.datasets || []);
    setLoading(false);
  };

  const loadDetail = async (datasetId) => {
    const [datasetData, runsData] = await Promise.all([
      api(`/eval/datasets/${datasetId}`),
      api(`/eval/runs?datasetId=${datasetId}&limit=50&offset=0`),
    ]);
    setSelectedDataset(datasetData.dataset);
    setRuns(runsData.runs || []);
  };

  useEffect(() => {
    loadDatasets().catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setSelectedRun(null);
    loadDetail(selectedId).catch((err) => setError(err.message));
  }, [selectedId]);

  const hasActiveRun = runs.some((run) =>
    ["pending", "running"].includes(run.status)
  );
  useEffect(() => {
    if (!selectedId || !hasActiveRun) return;
    const timer = setTimeout(() => {
      loadDetail(selectedId).catch(() => {});
    }, 2000);
    return () => clearTimeout(timer);
  }, [selectedId, runs, hasActiveRun]);

  const updateDraftQuestion = (index, key, value) => {
    setDraft((current) => ({
      ...current,
      questions: current.questions.map((question, questionIndex) =>
        questionIndex === index ? { ...question, [key]: value } : question
      ),
    }));
  };

  const createDataset = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const data = await api("/eval/datasets", {
        method: "POST",
        body: JSON.stringify({
          name: draft.name,
          description: draft.description,
          questions: draft.questions.map((question) => ({
            question: question.question,
            expectedAnswer: question.expectedAnswer || null,
            expectedSource: question.expectedSource || null,
            tags: parseTags(question.tags),
          })),
        }),
      });
      setShowCreate(false);
      setDraft({ name: "", description: "", questions: [emptyQuestion()] });
      setSelectedId(data.dataset.id);
      await loadDatasets();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteDataset = async (dataset) => {
    if (!window.confirm(t("eval.datasets.deleteConfirm"))) return;
    await api(`/eval/datasets/${dataset.id}`, { method: "DELETE" });
    if (selectedId === dataset.id) setSelectedId(null);
    setSelectedDataset(null);
    setSelectedRun(null);
    await loadDatasets();
  };

  const createQuestion = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api(`/eval/datasets/${selectedId}/questions`, {
        method: "POST",
        body: JSON.stringify({
          question: questionDraft.question,
          expectedAnswer: questionDraft.expectedAnswer || null,
          expectedSource: questionDraft.expectedSource || null,
          tags: parseTags(questionDraft.tags),
        }),
      });
      setShowQuestion(false);
      setQuestionDraft(emptyQuestion());
      await loadDetail(selectedId);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteQuestion = async (questionId) => {
    if (!window.confirm(t("eval.questions.deleteConfirm"))) return;
    await api(`/eval/questions/${questionId}`, { method: "DELETE" });
    await loadDetail(selectedId);
  };

  const startRun = async () => {
    setError(null);
    try {
      await api(`/eval/datasets/${selectedId}/runs`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      await loadDetail(selectedId);
    } catch (err) {
      setError(err.message);
    }
  };

  const openRun = async (runId) => {
    const data = await api(`/eval/runs/${runId}`);
    setSelectedRun(data.run);
  };

  if (loading)
    return (
      <EvalShell>
        <p className="text-theme-text-secondary">{t("eval.loading")}</p>
      </EvalShell>
    );

  return (
    <EvalShell>
      <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-semibold text-theme-text-primary break-words">
            {t("eval.title")}
          </h1>
          <p className="mt-1 text-sm text-theme-text-secondary break-words">
            {selectedDataset ? selectedDataset.name : t("eval.datasets.list")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="flex h-9 items-center gap-2 rounded-lg bg-theme-loader px-4 text-sm font-medium text-black light:text-white"
        >
          <Plus size={16} weight="bold" />
          {t("eval.datasets.new")}
        </button>
      </header>

      {error && (
        <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {error}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <section className="rounded-lg border border-theme-sidebar-border bg-theme-bg-secondary p-4 min-w-0">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-theme-text-secondary">
            {t("eval.datasets.list")}
          </h2>
          {datasets.length === 0 && (
            <p className="py-8 text-center text-sm text-theme-text-secondary">
              {t("eval.datasets.empty")}
            </p>
          )}
          <div className="flex flex-col gap-2">
            {datasets.map((dataset) => (
              <button
                key={dataset.id}
                type="button"
                onClick={() => setSelectedId(dataset.id)}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  selectedId === dataset.id
                    ? "border-theme-loader bg-theme-sidebar-item-default"
                    : "border-theme-sidebar-border bg-theme-sidebar-item-default"
                }`}
              >
                <span className="block text-sm font-medium text-theme-text-primary break-words">
                  {dataset.name}
                </span>
                <span className="mt-1 block text-xs text-theme-text-secondary">
                  {dataset.questions?.length || 0}{" "}
                  {t("eval.datasets.questions")}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-theme-sidebar-border bg-theme-bg-secondary p-4 min-w-0">
          {!selectedDataset ? (
            <p className="py-8 text-center text-sm text-theme-text-secondary">
              {t("eval.datasets.emptySelect")}
            </p>
          ) : (
            <DatasetDetail
              dataset={selectedDataset}
              runs={runs}
              selectedRun={selectedRun}
              onAddQuestion={() => setShowQuestion(true)}
              onDeleteQuestion={deleteQuestion}
              onDeleteDataset={() => deleteDataset(selectedDataset)}
              onStartRun={startRun}
              onOpenRun={openRun}
            />
          )}
        </section>
      </div>

      {showCreate && (
        <Modal isOpen={true} onClose={() => setShowCreate(false)} size="xl">
          <form onSubmit={createDataset} className="flex flex-col gap-5">
            <ModalHeader
              title={t("eval.datasets.create")}
              onClose={() => setShowCreate(false)}
            />
            <ModalBody>
              <ModalInput
                label={t("eval.datasets.name")}
                value={draft.name}
                onChange={(event) =>
                  setDraft({ ...draft, name: event.target.value })
                }
                required
                autoFocus
              />
              <ModalInput
                label={t("eval.datasets.description")}
                value={draft.description}
                onChange={(event) =>
                  setDraft({ ...draft, description: event.target.value })
                }
              />
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-theme-text-primary">
                  {t("eval.datasets.questions")}
                </h4>
                <button
                  type="button"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      questions: [...draft.questions, emptyQuestion()],
                    })
                  }
                  className="flex items-center gap-1 text-sm text-sky-400"
                >
                  <Plus size={14} />
                  {t("eval.questions.add")}
                </button>
              </div>
              {draft.questions.map((question, index) => (
                <div
                  key={index}
                  className="rounded-lg border border-theme-sidebar-border bg-theme-sidebar-item-default p-3"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs text-theme-text-secondary">
                      #{index + 1}
                    </span>
                    {draft.questions.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setDraft({
                            ...draft,
                            questions: draft.questions.filter(
                              (_, questionIndex) => questionIndex !== index
                            ),
                          })
                        }
                        className="text-red-400"
                        aria-label={t("eval.questions.remove")}
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                  <QuestionFields
                    question={question}
                    onChange={(key, value) =>
                      updateDraftQuestion(index, key, value)
                    }
                  />
                </div>
              ))}
            </ModalBody>
            <ModalFooter>
              <ModalSecondaryButton
                type="button"
                onClick={() => setShowCreate(false)}
              >
                {t("common.no")}
              </ModalSecondaryButton>
              <ModalPrimaryButton type="submit" disabled={saving}>
                {t("eval.datasets.create")}
              </ModalPrimaryButton>
            </ModalFooter>
          </form>
        </Modal>
      )}

      {showQuestion && selectedId && (
        <Modal isOpen={true} onClose={() => setShowQuestion(false)} size="lg">
          <form onSubmit={createQuestion} className="flex flex-col gap-5">
            <ModalHeader
              title={t("eval.questions.add")}
              onClose={() => setShowQuestion(false)}
            />
            <ModalBody>
              <QuestionFields
                question={questionDraft}
                onChange={(key, value) =>
                  setQuestionDraft({ ...questionDraft, [key]: value })
                }
              />
            </ModalBody>
            <ModalFooter>
              <ModalSecondaryButton
                type="button"
                onClick={() => setShowQuestion(false)}
              >
                {t("common.no")}
              </ModalSecondaryButton>
              <ModalPrimaryButton type="submit" disabled={saving}>
                {t("eval.questions.add")}
              </ModalPrimaryButton>
            </ModalFooter>
          </form>
        </Modal>
      )}
    </EvalShell>
  );
}

function EvalShell({ children }) {
  return (
    <div className="w-screen h-screen overflow-hidden bg-zinc-950 light:bg-slate-50 flex">
      {!isMobile ? <Sidebar /> : <SidebarMobileHeader />}
      <main className="flex-1 min-w-0 h-full overflow-y-auto">
        <div className="max-w-6xl mx-auto p-4 md:p-6">{children}</div>
      </main>
    </div>
  );
}

function DatasetDetail({
  dataset,
  runs,
  selectedRun,
  onAddQuestion,
  onDeleteQuestion,
  onDeleteDataset,
  onStartRun,
  onOpenRun,
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-4 min-w-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-theme-text-primary break-words">
            {dataset.name}
          </h2>
          {dataset.description && (
            <p className="mt-1 text-sm text-theme-text-secondary break-words">
              {dataset.description}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onAddQuestion}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-theme-sidebar-border px-3 text-sm text-theme-text-primary"
          >
            <Plus size={15} />
            {t("eval.questions.add")}
          </button>
          <button
            type="button"
            onClick={onStartRun}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-theme-loader px-3 text-sm font-medium text-black light:text-white"
          >
            <Play size={15} weight="fill" />
            {t("eval.runs.start")}
          </button>
          <button
            type="button"
            onClick={onDeleteDataset}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-red-500/30 px-3 text-sm text-red-400"
          >
            <Trash size={15} />
            {t("eval.datasets.delete")}
          </button>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-theme-text-secondary">
            {t("eval.datasets.questions")}
          </h3>
          <span className="text-xs text-theme-text-secondary">
            {dataset.questions?.length || 0}
          </span>
        </div>
        <div className="flex flex-col gap-2">
          {(dataset.questions || []).map((question) => (
            <div
              key={question.id}
              className="rounded-lg border border-theme-sidebar-border bg-theme-sidebar-item-default p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-theme-text-primary break-words">
                    {question.question}
                  </p>
                  {question.expectedAnswer && (
                    <p className="mt-1 text-xs text-theme-text-secondary break-words">
                      {question.expectedAnswer}
                    </p>
                  )}
                  {question.expectedSource && (
                    <p className="mt-1 text-xs text-sky-400 break-all">
                      {question.expectedSource}
                    </p>
                  )}
                  {question.tags?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {question.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded bg-theme-bg-secondary px-2 py-0.5 text-xs text-theme-text-secondary"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onDeleteQuestion(question.id)}
                  className="text-red-400"
                  aria-label={t("eval.questions.delete")}
                >
                  <Trash size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-theme-text-secondary">
          {t("eval.runs.results")}
        </h3>
        {runs.length === 0 ? (
          <p className="py-4 text-sm text-theme-text-secondary">
            {t("eval.runs.empty")}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {runs.map((run) => (
              <button
                key={run.id}
                type="button"
                onClick={() => onOpenRun(run.id)}
                className="rounded-lg border border-theme-sidebar-border bg-theme-sidebar-item-default p-3 text-left"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span
                    className={`text-sm font-medium ${
                      run.status === "completed"
                        ? "text-green-400"
                        : run.status === "failed"
                          ? "text-red-400"
                          : "text-theme-text-primary"
                    }`}
                  >
                    {t(`eval.runs.status.${run.status}`)}
                  </span>
                  <span className="text-xs text-theme-text-secondary">
                    {new Date(run.startedAt).toLocaleString()}
                  </span>
                </div>
                {run.metrics && <RunMetrics metrics={run.metrics} compact />}
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedRun && <RunDetail run={selectedRun} />}
    </div>
  );
}

function QuestionFields({ question, onChange }) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-3">
      <ModalInput
        label={t("eval.questions.question")}
        value={question.question}
        onChange={(event) => onChange("question", event.target.value)}
        required
      />
      <ModalInput
        label={t("eval.questions.expectedAnswer")}
        value={question.expectedAnswer || ""}
        onChange={(event) => onChange("expectedAnswer", event.target.value)}
      />
      <ModalInput
        label={t("eval.questions.expectedSource")}
        value={question.expectedSource || ""}
        onChange={(event) => onChange("expectedSource", event.target.value)}
      />
      <ModalInput
        label={t("eval.questions.tags")}
        value={question.tags || ""}
        onChange={(event) => onChange("tags", event.target.value)}
        placeholder="atendimento, horario"
      />
    </div>
  );
}

function RunDetail({ run }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-theme-sidebar-border bg-theme-sidebar-item-default p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-theme-text-primary">
          {t("eval.runs.results")}
        </h4>
        {run.metrics && <RunMetrics metrics={run.metrics} />}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-theme-text-secondary">
              <th className="pb-2 pr-3">{t("eval.questions.question")}</th>
              <th className="pb-2 pr-3">
                {t("eval.metrics.retrievalAccuracy")}
              </th>
              <th className="pb-2 pr-3">
                {t("eval.metrics.answerCorrectness")}
              </th>
              <th className="pb-2">{t("eval.metrics.citationCorrectness")}</th>
            </tr>
          </thead>
          <tbody>
            {(run.results || []).map((result) => (
              <tr
                key={result.id}
                className="border-t border-theme-sidebar-border align-top"
              >
                <td className="py-2 pr-3 min-w-[220px]">
                  <p className="font-medium text-theme-text-primary break-words">
                    {result.question?.question}
                  </p>
                  {result.answer && (
                    <p className="mt-1 text-xs text-theme-text-secondary break-words">
                      {result.answer}
                    </p>
                  )}
                  {result.retrievedSources?.length > 0 && (
                    <p className="mt-1 text-xs text-sky-400 break-all">
                      {result.retrievedSources
                        .map((source) => source.filename)
                        .join(", ")}
                    </p>
                  )}
                  {result.error && (
                    <p className="mt-1 text-xs text-red-400 break-words">
                      {result.error}
                    </p>
                  )}
                </td>
                <BooleanCell value={result.retrievalAccuracy} />
                <BooleanCell value={result.answerCorrectness} />
                <BooleanCell value={result.citationCorrectness} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BooleanCell({ value }) {
  if (value === null || value === undefined)
    return <td className="py-2 pr-3">-</td>;
  return (
    <td
      className={`py-2 pr-3 font-medium ${
        value ? "text-green-400" : "text-red-400"
      }`}
    >
      {value ? "✓" : "✕"}
    </td>
  );
}

function RunMetrics({ metrics, compact = false }) {
  const { t } = useTranslation();
  const rows = [
    [t("eval.metrics.retrievalAccuracy"), metrics.retrievalAccuracy],
    [t("eval.metrics.answerCorrectness"), metrics.answerCorrectness],
    [t("eval.metrics.citationCorrectness"), metrics.citationCorrectness],
    [t("eval.metrics.avgLatencyMs"), metrics.avgLatencyMs],
    [t("eval.metrics.totalCostUsd"), metrics.totalCostUsd],
  ];
  return (
    <div
      className={`grid ${
        compact ? "mt-2 grid-cols-2 gap-x-3 gap-y-1" : "gap-2"
      }`}
    >
      {rows.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <span className="text-xs text-theme-text-secondary break-words">
            {label}:{" "}
          </span>
          <span className="text-xs font-medium text-theme-text-primary break-words">
            {value === null || value === undefined
              ? "-"
              : typeof value === "number"
                ? value.toLocaleString(undefined, {
                    maximumFractionDigits: 4,
                  })
                : String(value)}
          </span>
        </div>
      ))}
    </div>
  );
}
