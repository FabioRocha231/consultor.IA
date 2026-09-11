import { useState } from "react";
import { useTranslation } from "react-i18next";
import Menu from "@/models/menu";
import showToast from "@/utils/toast";
import { ModalHeader, ModalBody } from "@/components/lib/Modal";
import { CircleNotch } from "@phosphor-icons/react";

function initialForm(item) {
  return {
    category: item?.category || "",
    name: item?.name || "",
    description: item?.description || "",
    priceCents: item ? String(item.priceCents) : "",
    currency: item?.currency || "BRL",
    available: item?.available ?? true,
    position: item?.position ?? 0,
    allergens: item?.allergens || "",
    photoUrl: item?.photoUrl || "",
  };
}

export default function MenuEditor({ item = null, onClose, onSaved }) {
  const { t } = useTranslation();
  const isEditing = Boolean(item);
  const [form, setForm] = useState(initialForm(item));
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  const handleChange = (event) => {
    const { name, type, value, checked } = event.target;
    setForm((previous) => ({
      ...previous,
      [name]: type === "checkbox" ? checked : value,
    }));
    setErrors((previous) => {
      if (!previous[name]) return previous;
      const next = { ...previous };
      delete next[name];
      return next;
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const nextErrors = {};
    const priceCents = Number(form.priceCents);
    if (!form.category.trim()) {
      nextErrors.category = t("settings.menu.errors.categoryRequired");
    }
    if (!form.name.trim()) {
      nextErrors.name = t("settings.menu.errors.nameRequired");
    }
    if (
      form.priceCents.trim() === "" ||
      !Number.isInteger(priceCents) ||
      priceCents < 0
    ) {
      nextErrors.priceCents = t("settings.menu.errors.priceCentsInvalid");
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      showToast(t("settings.menu.errors.invalidForm"), "error");
      return;
    }

    setSaving(true);
    const payload = {
      category: form.category.trim(),
      name: form.name.trim(),
      description: form.description || null,
      priceCents,
      currency: form.currency,
      available: Boolean(form.available),
      position: Number(form.position),
      allergens: form.allergens || null,
      photoUrl: form.photoUrl || null,
    };
    const result = isEditing
      ? await Menu.update(item.id, payload)
      : await Menu.create(payload);
    setSaving(false);

    if (result.error) {
      showToast(result.error, "error");
      return;
    }
    showToast(isEditing ? "Item atualizado" : "Item criado", "success");
    onSaved();
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-y-5">
      <ModalHeader
        title={
          isEditing
            ? t("settings.menu.items.edit")
            : t("settings.menu.items.new")
        }
        onClose={onClose}
      />
      <ModalBody>
        <Field
          label={t("settings.menu.fields.category")}
          name="category"
          value={form.category}
          onChange={handleChange}
          error={errors.category}
          required
        />
        <Field
          label={t("settings.menu.fields.name")}
          name="name"
          value={form.name}
          onChange={handleChange}
          error={errors.name}
          required
        />
        <Field
          label={t("settings.menu.fields.description")}
          name="description"
          value={form.description}
          onChange={handleChange}
          multiline
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field
            label={t("settings.menu.fields.priceCents")}
            name="priceCents"
            value={form.priceCents}
            onChange={handleChange}
            error={errors.priceCents}
            type="number"
            min="0"
            step="1"
            required
          />
          <div className="flex flex-col gap-1.5 w-full">
            <span className="text-sm text-zinc-300 light:text-slate-600">
              {t("settings.menu.fields.currency")}
            </span>
            <span className="flex h-9 w-full items-center rounded-lg border border-zinc-700 light:border-slate-300 !bg-zinc-800 light:!bg-slate-100 px-3 text-sm font-medium !text-zinc-100 light:!text-slate-900">
              {t("settings.menu.currency.locked")}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field
            label={t("settings.menu.fields.available")}
            name="available"
            value={form.available}
            onChange={handleChange}
            type="checkbox"
          />
          <Field
            label={t("settings.menu.fields.position")}
            name="position"
            value={String(form.position)}
            onChange={handleChange}
            type="number"
          />
        </div>
        <Field
          label={t("settings.menu.fields.allergens")}
          name="allergens"
          value={form.allergens}
          onChange={handleChange}
          multiline
        />
        <Field
          label={t("settings.menu.fields.photoUrl")}
          name="photoUrl"
          value={form.photoUrl}
          onChange={handleChange}
        />
        <div className="flex flex-col-reverse gap-2 pt-4 sm:flex-row sm:items-center sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="border-none h-9 w-full sm:w-auto px-4 rounded-lg text-sm font-medium text-zinc-300 light:text-slate-600 hover:bg-white/10 light:hover:bg-slate-100"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="border-none flex w-full sm:w-auto items-center justify-center gap-2 h-9 px-5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
          >
            {saving && <CircleNotch size={16} className="animate-spin" />}
            Salvar
          </button>
        </div>
      </ModalBody>
    </form>
  );
}

function Field({
  label,
  name,
  value,
  onChange,
  type = "text",
  multiline = false,
  error,
  ...props
}) {
  const isCheckbox = type === "checkbox";
  const errorId = `${name}-error`;
  const className =
    "w-full h-9 px-3 rounded-lg !bg-zinc-800 light:!bg-slate-100 border text-sm !text-zinc-100 light:!text-slate-900 outline-none focus:border-zinc-500 " +
    (error
      ? "border-red-500 light:border-red-500"
      : "border-zinc-700 light:border-slate-300");

  return (
    <div className="flex flex-col gap-1.5 w-full">
      {isCheckbox ? (
        <label className="flex min-h-9 w-full items-center gap-2 cursor-pointer text-sm text-zinc-300 light:text-slate-600">
          <input
            type="checkbox"
            name={name}
            value="on"
            checked={Boolean(value)}
            onChange={onChange}
            className="h-4 w-4 accent-emerald-600"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
            {...props}
          />
          <span>{label}</span>
        </label>
      ) : (
        <label className="flex flex-col gap-1.5 text-sm text-zinc-300 light:text-slate-600">
          <span>{label}</span>
          {multiline ? (
            <textarea
              name={name}
              value={value}
              onChange={onChange}
              rows={3}
              className={`${className} h-auto min-h-[88px] py-2 resize-y`}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? errorId : undefined}
              {...props}
            />
          ) : (
            <input
              type={type}
              name={name}
              value={value}
              onChange={onChange}
              className={className}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? errorId : undefined}
              {...props}
            />
          )}
        </label>
      )}
      {error && (
        <p id={errorId} className="text-xs text-red-500 light:text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
