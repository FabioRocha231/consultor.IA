import React from "react";
import { useDropzone } from "react-dropzone";
import { useTranslation } from "react-i18next";

export default function Knowledge({ formData, updateFormData, attempted }) {
  const { t } = useTranslation();
  const knowledge = formData.knowledge || [];
  const [showErrors, setShowErrors] = React.useState(false);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: ".pdf,.docx,.txt,.md",
    onDrop: (acceptedFiles) =>
      updateFormData({
        knowledge: [
          ...knowledge,
          ...acceptedFiles.map((file) => ({
            name: file.name,
            size: file.size,
          })),
        ],
      }),
  });

  function removeFile(name) {
    updateFormData({
      knowledge: knowledge.filter((file) => file.name !== name),
    });
  }

  const hasKnowledge =
    knowledge.length > 0 ||
    !!formData.knowledgeUrl?.trim() ||
    !!formData.knowledgeText?.trim();

  return (
    <div className="w-full max-w-xl mx-auto space-y-5">
      <div
        {...getRootProps()}
        onBlur={() => setShowErrors(true)}
        className={`rounded-lg border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
          isDragActive
            ? "border-sky-400 bg-sky-400/10"
            : "border-theme-sidebar-border bg-theme-settings-input-bg"
        }`}
      >
        <input {...getInputProps()} />
        <p className="text-sm text-theme-text-primary">
          {isDragActive
            ? t("onboarding.dropFilesActive")
            : t("onboarding.dropFiles")}
        </p>
        <p className="mt-1 text-xs text-theme-text-secondary">
          {t("onboarding.dropFilesHint")}
        </p>
      </div>

      {knowledge.length > 0 && (
        <ul className="space-y-2">
          {knowledge.map((file) => (
            <li
              key={`${file.name}-${file.size}`}
              className="flex items-center justify-between rounded-lg border border-theme-sidebar-border bg-theme-settings-input-bg px-3 py-2 text-sm text-theme-text-primary"
            >
              <span className="truncate">{file.name}</span>
              <button
                type="button"
                onClick={() => removeFile(file.name)}
                className="ml-3 text-xs text-red-400 hover:text-red-300"
              >
                {t("onboarding.removeFile")}
              </button>
            </li>
          ))}
        </ul>
      )}

      <input
        type="url"
        value={formData.knowledgeUrl || ""}
        onChange={(event) =>
          updateFormData({ knowledgeUrl: event.target.value })
        }
        onBlur={() => setShowErrors(true)}
        placeholder={t("onboarding.knowledgeUrl")}
        className="w-full border border-theme-chat-input-border bg-theme-settings-input-bg text-theme-text-primary rounded-lg px-4 py-3 text-sm outline-none focus:outline-primary-button"
      />

      <textarea
        value={formData.knowledgeText || ""}
        onChange={(event) =>
          updateFormData({ knowledgeText: event.target.value })
        }
        onBlur={() => setShowErrors(true)}
        placeholder={t("onboarding.knowledgeText")}
        rows={5}
        className="w-full border border-theme-chat-input-border bg-theme-settings-input-bg text-theme-text-primary rounded-lg px-4 py-3 text-sm outline-none focus:outline-primary-button resize-y"
      />

      {(attempted || showErrors) && !hasKnowledge && (
        <p className="text-sm text-red-500">{t("onboarding.requiredField")}</p>
      )}
    </div>
  );
}
