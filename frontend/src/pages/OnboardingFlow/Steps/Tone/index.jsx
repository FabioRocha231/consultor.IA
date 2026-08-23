import React from "react";
import { useTranslation } from "react-i18next";

const OPTIONS = ["profissional", "amigavel", "comercial", "objetivo"];

export default function Tone({ formData, updateFormData, attempted }) {
  const { t } = useTranslation();

  return (
    <div className="w-full max-w-xl mx-auto">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {OPTIONS.map((tone) => {
          const selected = formData.tone === tone;
          return (
            <button
              type="button"
              key={tone}
              onClick={() => updateFormData({ tone })}
              className={`rounded-lg border-2 px-4 py-4 text-sm font-medium transition-colors ${
                selected
                  ? "border-sky-400 bg-sky-400/10 text-sky-400"
                  : "border-theme-sidebar-border bg-theme-settings-input-bg text-theme-text-primary hover:border-sky-400/60"
              }`}
            >
              {t(`onboarding.tones.${tone}`)}
            </button>
          );
        })}
      </div>
      {attempted && !formData.tone && (
        <p className="mt-3 text-sm text-red-500">
          {t("onboarding.requiredField")}
        </p>
      )}
    </div>
  );
}
