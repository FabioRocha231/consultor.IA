import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { isMobile } from "react-device-detect";
import Sidebar, { SidebarMobileHeader } from "@/components/Sidebar";
import Organization from "@/models/organization";
import { API_BASE } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";

const PERIODS = ["7d", "30d", "all"];

export default function Dashboard() {
  const { t } = useTranslation();
  const [organization, setOrganization] = useState(null);
  const [data, setData] = useState(null);
  const [realtime, setRealtime] = useState(null);
  const [period, setPeriod] = useState("7d");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Organization.get().then(({ organization }) => {
      if (!cancelled) setOrganization(organization);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const headers = baseHeaders();
    const companyUrl = `${API_BASE}/dashboard/company?period=${encodeURIComponent(
      period
    )}`;
    Promise.all([
      fetch(companyUrl, { headers }).then(async (res) => {
        if (!res.ok) throw new Error("Dashboard request failed.");
        return res.json();
      }),
      fetch(`${API_BASE}/dashboard/metrics/realtime`, { headers }).then(
        async (res) => {
          if (!res.ok) throw new Error("Realtime metrics request failed.");
          return res.json();
        }
      ),
    ])
      .then(([companyData, realtimeData]) => {
        if (cancelled) return;
        setData(companyData);
        setRealtime(realtimeData);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [period]);

  if (loading && !data)
    return (
      <DashboardShell>
        <div className="flex h-64 items-center justify-center text-theme-text-secondary">
          {t("dashboard.loading")}
        </div>
      </DashboardShell>
    );

  if (error && !data)
    return (
      <DashboardShell>
        <div className="flex h-64 items-center justify-center text-red-400">
          {t("dashboard.error")}
        </div>
      </DashboardShell>
    );

  const latency =
    realtime?.llmLatencyP95Ms ?? data?.performance?.llmLatencyP95Ms;
  const totalCost = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(data?.costs?.totalUsd || 0);
  const positiveRate = data?.feedback?.positiveRate ?? 0;

  return (
    <DashboardShell>
      <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-semibold text-theme-text-primary break-words">
            {organization?.name || t("dashboard.title")}
          </h1>
          <p className="mt-1 text-sm text-theme-text-secondary">
            {t("dashboard.generatedAt")}:{" "}
            {data?.generatedAt
              ? new Date(data.generatedAt).toLocaleString()
              : "-"}
          </p>
        </div>
        <div
          className="flex w-fit rounded-lg border border-theme-sidebar-border bg-theme-bg-secondary p-1"
          role="group"
          aria-label={t("dashboard.periodLabel")}
        >
          {PERIODS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setPeriod(option)}
              aria-pressed={period === option}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                period === option
                  ? "bg-theme-loader text-black light:text-white"
                  : "text-theme-text-secondary hover:text-theme-text-primary"
              }`}
            >
              {t(`dashboard.period.${option}`)}
            </button>
          ))}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard
          label={t("dashboard.kpi.conversations")}
          value={data?.usage?.conversations ?? "-"}
          sub={`${data?.usage?.activeUsers ?? 0} ${t("dashboard.activeUsers")}`}
        />
        <KpiCard
          label={t("dashboard.kpi.messages")}
          value={data?.usage?.messages ?? "-"}
        />
        <KpiCard
          label={t("dashboard.kpi.positiveRate")}
          value={`${Math.round(positiveRate * 100)}%`}
        />
        <KpiCard label={t("dashboard.kpi.cost")} value={totalCost} />
        <KpiCard
          label={t("dashboard.kpi.latency")}
          value={
            latency == null ? t("dashboard.notCollected") : `${latency} ms`
          }
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Section title={t("dashboard.sections.usage")}>
          <UsageChart data={data?.usage?.byDay || []} />
        </Section>
        <Section title={t("dashboard.sections.feedback")}>
          <FeedbackSection feedback={data?.feedback} />
        </Section>
        <Section title={t("dashboard.sections.costs")}>
          <CostTable byModel={data?.costs?.byModel || []} />
        </Section>
        <Section title={t("dashboard.sections.performance")}>
          <PerformanceGrid realtime={realtime} />
        </Section>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <Section title={t("dashboard.sections.topDocuments")}>
          <EmptyState text={t("dashboard.empty.topDocuments")} />
        </Section>
        <Section title={t("dashboard.sections.tools")}>
          <EmptyState text={t("dashboard.empty.tools")} />
        </Section>
        <Section title={t("dashboard.sections.errors")}>
          <EmptyState text={t("dashboard.empty.errors")} />
        </Section>
      </div>

      <div className="mt-4">
        <Section title={t("dashboard.sections.config")}>
          <ConfigSection config={data?.config} />
        </Section>
      </div>
    </DashboardShell>
  );
}

function DashboardShell({ children }) {
  return (
    <div className="w-screen h-screen overflow-hidden bg-zinc-950 light:bg-slate-50 flex">
      {!isMobile ? <Sidebar /> : <SidebarMobileHeader />}
      <main className="flex-1 min-w-0 h-full overflow-y-auto">
        <div className="max-w-6xl mx-auto p-4 md:p-6">{children}</div>
      </main>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="rounded-lg border border-theme-sidebar-border bg-theme-bg-secondary p-4 md:p-5 min-w-0">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-theme-text-secondary">
        {title}
      </h2>
      {children}
    </section>
  );
}

function KpiCard({ label, value, sub = null }) {
  return (
    <div className="rounded-lg border border-theme-sidebar-border bg-theme-bg-secondary p-4 min-w-0">
      <p className="text-xs font-medium uppercase tracking-wide text-theme-text-secondary break-words">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-theme-text-primary break-words">
        {value}
      </p>
      {sub && (
        <p className="mt-1 text-xs text-theme-text-secondary break-words">
          {sub}
        </p>
      )}
    </div>
  );
}

function UsageChart({ data }) {
  const { t } = useTranslation();
  if (!data.length) return <EmptyState text={t("dashboard.empty.usage")} />;
  const max = Math.max(1, ...data.map((day) => day.messages));
  return (
    <div>
      <div className="flex h-40 items-end gap-1">
        {data.map((day) => (
          <div
            key={day.date}
            title={`${day.date}: ${day.messages}`}
            className="flex-1 min-w-0 rounded-t bg-theme-loader"
            style={{ height: `${Math.max(4, (day.messages / max) * 100)}%` }}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-xs text-theme-text-secondary">
        <span>{data[0].date}</span>
        <span>{data[data.length - 1].date}</span>
      </div>
    </div>
  );
}

function FeedbackSection({ feedback }) {
  const { t } = useTranslation();
  const categories = Object.entries(feedback?.byCategory || {});
  const max = Math.max(1, ...categories.map(([, count]) => count));
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-theme-sidebar-item-default p-3">
          <p className="text-xs text-theme-text-secondary">
            {t("dashboard.feedback.positive")}
          </p>
          <p className="text-xl font-semibold text-theme-text-primary">
            {feedback?.positive ?? 0}
          </p>
        </div>
        <div className="rounded-lg bg-theme-sidebar-item-default p-3">
          <p className="text-xs text-theme-text-secondary">
            {t("dashboard.feedback.negative")}
          </p>
          <p className="text-xl font-semibold text-theme-text-primary">
            {feedback?.negative ?? 0}
          </p>
        </div>
      </div>
      <p className="text-xs font-medium uppercase tracking-wide text-theme-text-secondary">
        {t("dashboard.feedback.byCategory")}
      </p>
      <div className="flex flex-col gap-2">
        {categories.map(([category, count]) => (
          <div
            key={category}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2"
          >
            <span className="truncate text-sm text-theme-text-primary">
              {t(`feedback.categories.${category}`, category)}
            </span>
            <span className="text-sm text-theme-text-secondary">{count}</span>
            <div className="col-span-2 h-1.5 rounded-full bg-theme-sidebar-item-default">
              <div
                className="h-full rounded-full bg-theme-loader"
                style={{ width: `${(count / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CostTable({ byModel }) {
  const { t } = useTranslation();
  if (!byModel.length) return <EmptyState text={t("dashboard.empty.costs")} />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-theme-text-secondary">
            <th className="pb-2 pr-3">{t("dashboard.costs.model")}</th>
            <th className="pb-2 pr-3">{t("dashboard.costs.calls")}</th>
            <th className="pb-2 pr-3">{t("dashboard.costs.inputTokens")}</th>
            <th className="pb-2 pr-3">{t("dashboard.costs.outputTokens")}</th>
            <th className="pb-2">{t("dashboard.costs.costUsd")}</th>
          </tr>
        </thead>
        <tbody>
          {byModel.map((item) => (
            <tr
              key={item.model}
              className="border-t border-theme-sidebar-border"
            >
              <td className="py-2 pr-3 text-theme-text-primary break-all">
                {item.model}
              </td>
              <td className="py-2 pr-3 text-theme-text-primary">
                {item.calls}
              </td>
              <td className="py-2 pr-3 text-theme-text-primary">
                {item.inputTokens}
              </td>
              <td className="py-2 pr-3 text-theme-text-primary">
                {item.outputTokens}
              </td>
              <td className="py-2 text-theme-text-primary">
                {new Intl.NumberFormat(undefined, {
                  style: "currency",
                  currency: "USD",
                }).format(item.costUsd)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PerformanceGrid({ realtime }) {
  const { t } = useTranslation();
  const metrics = [
    ["llmLatencyP50Ms", t("dashboard.performance.llmP50")],
    ["llmLatencyP95Ms", t("dashboard.kpi.latency")],
    ["ttftP50Ms", t("dashboard.performance.ttftP50")],
    ["ragRetrievalP50Ms", t("dashboard.performance.ragP50")],
    ["ragRetrievalP95Ms", t("dashboard.performance.ragP95")],
    ["toolCallLatencyP95Ms", t("dashboard.performance.toolP95")],
  ];
  return (
    <div className="grid grid-cols-2 gap-3">
      {metrics.map(([key, label]) => (
        <div
          key={key}
          className="rounded-lg bg-theme-sidebar-item-default p-3 min-w-0"
        >
          <p className="text-xs text-theme-text-secondary break-words">
            {label}
          </p>
          <p className="mt-1 text-lg font-semibold text-theme-text-primary break-words">
            {realtime?.[key] == null
              ? t("dashboard.notCollected")
              : `${realtime[key]} ms`}
          </p>
        </div>
      ))}
    </div>
  );
}

function ConfigSection({ config }) {
  const { t } = useTranslation();
  const ragConfig = config?.ragConfig;
  if (!ragConfig) return <EmptyState text={t("dashboard.empty.config")} />;
  const rows = [
    [t("dashboard.config.topK"), ragConfig.topK],
    [t("dashboard.config.similarityThreshold"), ragConfig.similarityThreshold],
    [t("dashboard.config.fallbackBehavior"), ragConfig.fallbackBehavior],
    [t("dashboard.config.modelPricingVersion"), config?.modelPricingVersion],
  ];
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="rounded-lg bg-theme-sidebar-item-default p-3 min-w-0"
        >
          <dt className="text-xs text-theme-text-secondary break-words">
            {label}
          </dt>
          <dd className="mt-1 text-sm font-medium text-theme-text-primary break-all">
            {value == null ? "-" : String(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function EmptyState({ text }) {
  return (
    <p className="py-6 text-center text-sm text-theme-text-secondary">{text}</p>
  );
}
