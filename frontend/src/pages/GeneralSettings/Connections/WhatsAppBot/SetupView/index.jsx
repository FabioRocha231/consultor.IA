import { useEffect, useState } from "react";
import {
  CircleNotch,
  Eye,
  EyeSlash,
  WhatsappLogo,
} from "@phosphor-icons/react";
import WhatsApp from "@/models/whatsapp";
import Workspace from "@/models/workspace";
import showToast from "@/utils/toast";
import { StatusPill } from "../../ConnectionsLayout";
import { useTranslation } from "react-i18next";

const FIELD_LIMITS = {
  phoneNumberId: 64,
  workspaceSlug: 255,
  verifyToken: 128,
  appSecret: 255,
  accessToken: 512,
};

const SECRET_FIELDS = [
  "phoneNumberId",
  "verifyToken",
  "appSecret",
  "accessToken",
];

const FIELDS = [
  "phoneNumberId",
  "workspaceSlug",
  "verifyToken",
  "appSecret",
  "accessToken",
];

export default function SetupView({ onConnected }) {
  const { t } = useTranslation();
  const [values, setValues] = useState({
    phoneNumberId: "",
    workspaceSlug: "",
    verifyToken: "",
    appSecret: "",
    accessToken: "",
  });
  const [showFields, setShowFields] = useState({
    phoneNumberId: false,
    verifyToken: false,
    appSecret: false,
    accessToken: false,
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [workspaces, setWorkspaces] = useState([]);

  useEffect(() => {
    Workspace.all().then(setWorkspaces);
  }, []);

  function validate() {
    const nextErrors = {};
    for (const field of FIELDS) {
      const label = t(`whatsapp.setup.fields.${field}.label`);
      const value = values[field].trim();
      if (!value) {
        nextErrors[field] = `${label} is required.`;
      } else if (value.length > FIELD_LIMITS[field]) {
        nextErrors[field] =
          `${label} must be ${FIELD_LIMITS[field]} characters or fewer.`;
      }
    }
    return nextErrors;
  }

  function handleChange(field) {
    return (e) => {
      setValues((prev) => ({ ...prev, [field]: e.target.value }));
      setErrors((prev) => ({ ...prev, [field]: undefined }));
      setFormError("");
    };
  }

  function toggleVisibility(field) {
    setShowFields((prev) => ({ ...prev, [field]: !prev[field] }));
  }

  async function handleConnect(e) {
    e.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);
    setFormError("");
    if (Object.values(nextErrors).some(Boolean)) return;

    setSubmitting(true);
    const res = await WhatsApp.connect({
      appSecret: values.appSecret.trim(),
      phoneNumberId: values.phoneNumberId.trim(),
      accessToken: values.accessToken.trim(),
      verifyToken: values.verifyToken.trim(),
      workspaceSlug: values.workspaceSlug.trim(),
    });

    if (!res.success) {
      const fieldError = FIELDS.find((field) =>
        res.error?.toLowerCase().includes(field.toLowerCase())
      );
      if (fieldError) {
        setErrors((prev) => ({ ...prev, [fieldError]: res.error }));
      }
      setFormError(res.error || t("whatsapp.setup.toast-connect-failed"));
      setSubmitting(false);
      showToast(res.error || t("whatsapp.setup.toast-connect-failed"), "error");
      return;
    }

    const configRes = await WhatsApp.getConfig();
    setSubmitting(false);
    showToast(t("whatsapp.setup.toast-connect-success"), "success");
    onConnected(configRes?.config);
  }

  return (
    <div className="flex flex-col gap-y-8 mt-8">
      <div className="flex flex-col gap-y-2">
        <StatusPill variant="disconnected">
          {t("whatsapp.connected.status-disconnected")}
        </StatusPill>
        <p className="text-sm text-zinc-400 light:text-slate-600 max-w-[700px]">
          {t("whatsapp.description")}
        </p>
        <a
          href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
          target="_blank"
          rel="noreferrer"
          className="text-xs text-blue-400 light:text-blue-600 underline w-fit"
        >
          View Meta setup steps
        </a>
      </div>

      {formError && (
        <div className="flex flex-col gap-y-2" role="alert">
          <StatusPill variant="error">Error</StatusPill>
          <p className="text-sm text-red-400 light:text-red-600">{formError}</p>
        </div>
      )}

      <form
        onSubmit={handleConnect}
        noValidate
        className="flex flex-col gap-y-[18px]"
      >
        <div className="flex flex-col gap-y-4 w-full max-w-[700px]">
          {FIELDS.map((field) => (
            <WhatsAppField
              key={field}
              field={field}
              value={values[field]}
              error={errors[field]}
              isSecret={SECRET_FIELDS.includes(field)}
              showValue={showFields[field]}
              onToggleVisibility={() => toggleVisibility(field)}
              onChange={handleChange(field)}
              workspaces={workspaces}
            />
          ))}
        </div>

        <button
          type="submit"
          disabled={submitting}
          aria-busy={submitting}
          className="flex items-center justify-center gap-x-2 text-sm font-medium bg-zinc-50 light:bg-slate-900 text-zinc-900 light:text-white rounded-lg h-11 px-5 w-fit hover:opacity-90 transition-opacity duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? (
            <>
              <CircleNotch className="h-4 w-4 animate-spin" />
              {t("whatsapp.setup.submit")}
            </>
          ) : (
            <>
              <WhatsappLogo className="h-5 w-5" weight="fill" />
              {t("whatsapp.setup.submit")}
            </>
          )}
        </button>
      </form>
    </div>
  );
}

function WhatsAppField({
  field,
  value,
  error,
  isSecret,
  showValue,
  onToggleVisibility,
  onChange,
  workspaces,
}) {
  const { t } = useTranslation();
  const label = t(`whatsapp.setup.fields.${field}.label`);
  const errorId = `whatsapp-${field}-error`;
  const Icon = showValue ? EyeSlash : Eye;

  return (
    <div className="flex flex-col gap-y-2">
      <label
        htmlFor={`whatsapp-${field}`}
        className="text-sm font-medium text-zinc-200 light:text-slate-900"
      >
        {label}
      </label>
      <div className="bg-zinc-800 light:bg-white light:border light:border-slate-300 h-11 rounded-lg px-3.5 flex items-center gap-x-2">
        {isSecret && (
          <button
            type="button"
            onClick={onToggleVisibility}
            aria-label={showValue ? "Hide value" : "Show value"}
            aria-pressed={showValue}
            className="text-zinc-400 light:text-slate-500 hover:text-zinc-300 light:hover:text-slate-700 transition-colors shrink-0 h-11"
          >
            <Icon className="h-4 w-4" />
          </button>
        )}
        <input
          id={`whatsapp-${field}`}
          type={isSecret && !showValue ? "password" : "text"}
          value={value}
          onChange={onChange}
          maxLength={FIELD_LIMITS[field]}
          aria-describedby={error ? errorId : undefined}
          aria-invalid={!!error}
          placeholder={t(`whatsapp.setup.fields.${field}.placeholder`)}
          list={field === "workspaceSlug" ? "whatsapp-workspaces" : undefined}
          className="bg-transparent flex-1 text-sm text-white light:text-slate-900 placeholder:text-zinc-400 light:placeholder:text-slate-500 outline-none min-w-0"
          autoComplete="off"
        />
      </div>
      {field === "workspaceSlug" && (
        <datalist id="whatsapp-workspaces">
          {workspaces.map((workspace) => (
            <option
              key={workspace.slug || workspace.id || workspace.name}
              value={workspace.slug}
            />
          ))}
        </datalist>
      )}
      <p className="text-xs text-zinc-400 light:text-slate-600">
        {t(`whatsapp.setup.fields.${field}.help`)}
      </p>
      <p
        id={errorId}
        role="alert"
        className="text-xs text-red-400 light:text-red-600"
      >
        {error || ""}
      </p>
    </div>
  );
}
