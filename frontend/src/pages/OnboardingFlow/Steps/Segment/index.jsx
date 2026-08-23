import React from "react";
import { useTranslation } from "react-i18next";

const OPTIONS = [
  "atendimento",
  "vendas",
  "suporte",
  "conhecimento_interno",
  "operacoes",
];

export default function Segment({ formData, updateFormData, attempted }) {
  const { t } = useTranslation();

  return (
    <div className="w-full max-w-xl mx-auto">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {OPTIONS.map((segment) => {
          const selected = formData.segment === segment;
          return (
            <button
              type="button"
              key={segment}
              onClick={() => updateFormData({ segment })}
              className={`rounded-lg border-2 px-4 py-4 text-sm font-medium transition-colors ${
                selected
                  ? "border-sky-400 bg-sky-400/10 text-sky-400"
                  : "border-theme-sidebar-border bg-theme-settings-input-bg text-theme-text-primary hover:border-sky-400/60"
              }`}
            >
              {t(`onboarding.segments.${segment}`)}
            </button>
          );
        })}
      </div>
      {attempted && !formData.segment && (
        <p className="mt-3 text-sm text-red-500">
          {t("onboarding.requiredField")}
        </p>
      )}
    </div>
  );
}
