import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ArrowLeft, Play } from "@phosphor-icons/react";
import { EvalShell } from "@/pages/Eval";
import paths from "@/utils/paths";
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

export default function LiveRunner() {
  const { t } = useTranslation();
  const [datasets, setDatasets] = useState([]);
  const [companyFilter, setCompanyFilter] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [config, setConfig] = useState({
    topK: 4,
    similarityThreshold: 0.25,
  });
  const [running, setRunning] = useState(false);
  const [selectedRun, setSelectedRun] = useState(null);
  const [error, setError] = useState(null);

  const loadDatasets = async () => {
    const data = await api("/eval/datasets?limit=200&offset=0");
    setDatasets(data.datasets || []);
  };

  useEffect(() => {
    loadDatasets().catch((err) => setError(err.message));
  }, []);

  const visibleDatasets = useMemo(
    () =>
      datasets.filter(
        (dataset) =>
          !companyFilter ||
          String(dataset.company || "").toLowerCase() ===
            companyFilter.trim().toLowerCase()
      ),
    [datasets, companyFilter]
  );

  const selectedDataset = datasets.find((dataset) => dataset.id === selectedId);

  const loadRun = async (runId) => {
    try {
      const data = await api(`/eval/runs/${runId}`);
      setSelectedRun(data.run);
      if (["pending", "running"].includes(data.run.status)) {
        setTimeout(() => loadRun(runId).catch(() => {}), 2000);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const startLive = async () => {
    if (!selectedId) return;
    if (!window.confirm(t("eval.live.confirm"))) return;
    setRunning(true);
    setError(null);
    try {
      const data = await api("/eval/live", {
        method: "POST",
        body: JSON.stringify({
          datasetId: selectedId,
          configOverrides: {
            topK: Number(config.topK),
            similarityThreshold: Number(config.similarityThreshold),
          },
        }),
      });
      setSelectedRun(data.run);
      await loadRun(data.run.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <EvalShell>
      <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <Link
            to={paths.eval()}
            className="mb-2 flex items-center gap-1 text-sm text-theme-text-secondary"
          >
            <ArrowLeft size={15} />
            {t("eval.live.back")}
          </Link>
          <h1 className="text-2xl md:text-3xl font-semibold text-theme-text-primary break-words">
            {t("eval.live.title")}
          </h1>
          <p className="mt-1 text-sm text-theme-text-secondary break-words">
            {t("eval.live.description")}
          </p>
        </div>
      </header>

      {error && (
        <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {error}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <section className="rounded-lg border border-theme-sidebar-border bg-theme-bg-secondary p-4 min-w-0">
          <label className="mb-2 block text-sm font-medium text-theme-text-primary">
            {t("eval.live.companyFilter")}
          </label>
          <input
            value={companyFilter}
            onChange={(event) => setCompanyFilter(event.target.value)}
            placeholder={t("eval.live.companyPlaceholder")}
            className="mb-4 w-full rounded-lg border border-theme-sidebar-border bg-theme-sidebar-item-default px-3 py-2 text-sm text-theme-text-primary"
          />
          {visibleDatasets.length === 0 ? (
            <p className="py-8 text-center text-sm text-theme-text-secondary">
              {t("eval.live.empty")}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {visibleDatasets.map((dataset) => (
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
                  <span className="mt-1 block text-xs text-theme-text-secondary break-words">
                    {dataset.company || "-"} · {dataset.questions?.length || 0}{" "}
                    {t("eval.datasets.questions")}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-lg border border-theme-sidebar-border bg-theme-bg-secondary p-4 min-w-0">
          {!selectedDataset ? (
            <p className="py-8 text-center text-sm text-theme-text-secondary">
              {t("eval.live.selectDataset")}
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="text-lg font-semibold text-theme-text-primary break-words">
                  {selectedDataset.name}
                </h2>
                <p className="mt-1 text-sm text-theme-text-secondary break-words">
                  {selectedDataset.company || "-"}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm text-theme-text-secondary">
                  {t("eval.live.topK")}
                  <input
                    type="number"
                    min="1"
                    value={config.topK}
                    onChange={(event) =>
                      setConfig({ ...config, topK: event.target.value })
                    }
                    className="mt-1 w-full rounded-lg border border-theme-sidebar-border bg-theme-sidebar-item-default px-3 py-2 text-sm text-theme-text-primary"
                  />
                </label>
                <label className="text-sm text-theme-text-secondary">
                  {t("eval.live.threshold")}
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.05"
                    value={config.similarityThreshold}
                    onChange={(event) =>
                      setConfig({
                        ...config,
                        similarityThreshold: event.target.value,
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-theme-sidebar-border bg-theme-sidebar-item-default px-3 py-2 text-sm text-theme-text-primary"
                  />
                </label>
              </div>

              <button
                type="button"
                onClick={startLive}
                disabled={running}
                className="flex h-9 items-center justify-center gap-2 rounded-lg bg-theme-loader px-4 text-sm font-medium text-black light:text-white disabled:opacity-50"
              >
                <Play size={15} weight="fill" />
                {running ? t("eval.live.running") : t("eval.live.run")}
              </button>

              {selectedRun && <LiveRunResult run={selectedRun} />}
            </div>
          )}
        </section>
      </div>
    </EvalShell>
  );
}

function LiveRunResult({ run }) {
  const { t } = useTranslation();
  const metrics = run.metrics || {};
  const rows = [
    [t("eval.metrics.retrievalAccuracy"), metrics.retrievalAccuracy],
    [t("eval.metrics.answerCorrectness"), metrics.answerCorrectness],
    [t("eval.live.latencyP50"), metrics.latencyP50Ms],
    [t("eval.live.latencyP95"), metrics.latencyP95Ms],
    [t("eval.live.totalCost"), metrics.totalCostUsd],
    [t("eval.live.totalTokens"), metrics.totalTokens],
  ];
  return (
    <div className="rounded-lg border border-theme-sidebar-border bg-theme-sidebar-item-default p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-theme-text-primary">
          {t("eval.live.results")}
        </h3>
        <span className="text-xs text-theme-text-secondary">
          {t(`eval.live.status.${run.status}`)}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {rows.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <p className="text-xs text-theme-text-secondary break-words">
              {label}
            </p>
            <p className="text-sm font-medium text-theme-text-primary break-words">
              {value === null || value === undefined
                ? "-"
                : typeof value === "number"
                  ? value.toLocaleString(undefined, {
                      maximumFractionDigits: 4,
                    })
                  : String(value)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
