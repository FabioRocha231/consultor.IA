import React from "react";
import { useTranslation } from "react-i18next";

function slugify(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export default function CompanySetup({ formData, updateFormData, attempted }) {
  const { t } = useTranslation();
  const companyName = formData.companyName || "";
  const autoSlug = slugify(companyName);
  const [slugEdited, setSlugEdited] = React.useState(
    () => !!formData.slug && formData.slug !== autoSlug
  );
  const [showErrors, setShowErrors] = React.useState(false);

  function handleNameChange(event) {
    const value = event.target.value;
    updateFormData({ companyName: value });
    if (!slugEdited) updateFormData({ slug: slugify(value) });
  }

  function handleSlugChange(event) {
    setSlugEdited(true);
    updateFormData({ slug: slugify(event.target.value) });
  }

  const showNameError = (attempted || showErrors) && !companyName.trim();

  return (
    <div className="w-full max-w-xl mx-auto space-y-5">
      <div>
        <label
          htmlFor="company-name"
          className="block mb-2 text-sm font-medium text-theme-text-primary"
        >
          {t("onboarding.companyName")}
        </label>
        <input
          id="company-name"
          type="text"
          value={companyName}
          onChange={handleNameChange}
          onBlur={() => setShowErrors(true)}
          placeholder={t("onboarding.companyNamePlaceholder")}
          className="w-full border border-theme-chat-input-border bg-theme-settings-input-bg text-theme-text-primary rounded-lg px-4 py-3 text-sm outline-none focus:outline-primary-button"
        />
        {showNameError && (
          <p className="mt-2 text-sm text-red-500">
            {t("onboarding.requiredField")}
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor="company-slug"
          className="block mb-2 text-sm font-medium text-theme-text-primary"
        >
          {t("onboarding.slug")}
        </label>
        <input
          id="company-slug"
          type="text"
          value={formData.slug || ""}
          onChange={handleSlugChange}
          className="w-full border border-theme-chat-input-border bg-theme-settings-input-bg text-theme-text-primary rounded-lg px-4 py-3 text-sm outline-none focus:outline-primary-button"
        />
      </div>

      <div>
        <label
          htmlFor="company-identity"
          className="block mb-2 text-sm font-medium text-theme-text-primary"
        >
          {t("onboarding.identity")}
        </label>
        <input
          id="company-identity"
          type="text"
          value={formData.identity || ""}
          onChange={(event) => updateFormData({ identity: event.target.value })}
          placeholder={t("onboarding.identityPlaceholder")}
          className="w-full border border-theme-chat-input-border bg-theme-settings-input-bg text-theme-text-primary rounded-lg px-4 py-3 text-sm outline-none focus:outline-primary-button"
        />
      </div>
    </div>
  );
}
