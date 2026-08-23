import React from "react";
import { useTranslation } from "react-i18next";

const REQUIRED_STEPS = [1, 2, 3, 4];

export default function Publish({
  formData,
  completedSteps,
  publishedAt,
  publishing,
  onPublish,
}) {
  const { t } = useTranslation();
  const canPublish = REQUIRED_STEPS.every((step) =>
    completedSteps.includes(step)
  );
  const companyName = formData.companyName || formData.identity || "";

  if (publishedAt) {
    return (
      <div className="w-full max-w-xl mx-auto rounded-lg border border-emerald-400/50 bg-emerald-400/10 p-8 text-center">
        <p className="text-lg font-semibold text-emerald-400">
          {t("onboarding.published")}
        </p>
        {companyName && (
          <p className="mt-2 text-sm text-theme-text-secondary">
            {companyName}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="w-full max-w-xl mx-auto rounded-lg border border-theme-sidebar-border bg-theme-settings-input-bg p-8 text-center">
      <h2 className="text-xl font-semibold text-theme-text-primary">
        {t("onboarding.publishTitle")}
      </h2>
      <p className="mt-2 text-sm text-theme-text-secondary">
        {t("onboarding.publishDescription")}
      </p>
      <button
        type="button"
        onClick={onPublish}
        disabled={!canPublish || publishing}
        className="mt-6 rounded-lg bg-sky-500 px-6 py-3 text-sm font-semibold text-white hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {publishing ? t("onboarding.publishing") : t("onboarding.publish")}
      </button>
      {!canPublish && (
        <p className="mt-3 text-sm text-red-500">
          {t("onboarding.publishIncomplete")}
        </p>
      )}
    </div>
  );
}
