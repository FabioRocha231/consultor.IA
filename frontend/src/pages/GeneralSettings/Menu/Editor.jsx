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

  const handleChange = (event) => {
    const { name, type, value, checked } = event.target;
    setForm((previous) => ({
      ...previous,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const priceCents = Number(form.priceCents);
    if (
      !form.category.trim() ||
      !form.name.trim() ||
      !Number.isInteger(priceCents) ||
      priceCents < 0
    ) {
      showToast(t("settings.menu.fields.priceCents"), "error");
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-y-5">
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
          required
        />
        <Field
          label={t("settings.menu.fields.name")}
          name="name"
          value={form.name}
          onChange={handleChange}
          required
        />
        <Field
          label={t("settings.menu.fields.description")}
          name="description"
          value={form.description}
          onChange={handleChange}
          multiline
        />
        <div className="grid grid-cols-2 gap-3">
          <Field
            label={t("settings.menu.fields.priceCents")}
            name="priceCents"
            value={form.priceCents}
            onChange={handleChange}
            type="number"
            min="0"
            step="1"
            required
          />
          <Field
            label={t("settings.menu.fields.currency")}
            name="currency"
            value={form.currency}
            onChange={handleChange}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
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
        <div className="flex items-center justify-end gap-x-2 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="border-none h-9 px-4 rounded-lg text-sm font-medium text-zinc-300 hover:bg-white/10"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="border-none flex items-center gap-2 h-9 px-5 rounded-lg bg-zinc-50 text-zinc-950 light:bg-slate-900 light:text-white text-sm font-medium hover:bg-zinc-200 light:hover:bg-slate-800"
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
  ...props
}) {
  const className =
    "w-full h-9 px-3 rounded-lg bg-zinc-800 light:bg-slate-100 border border-zinc-700 light:border-slate-300 text-sm text-zinc-100 light:text-slate-900 outline-none focus:border-zinc-500";
  return (
    <label className="flex flex-col gap-1.5 text-sm text-zinc-300 light:text-slate-600">
      {label}
      {multiline ? (
        <textarea
          name={name}
          value={value}
          onChange={onChange}
          rows={3}
          className={`${className} h-auto py-2`}
        />
      ) : (
        <input
          type={type}
          name={name}
          value={type === "checkbox" ? "on" : value}
          checked={type === "checkbox" ? Boolean(value) : undefined}
          onChange={onChange}
          {...props}
        />
      )}
    </label>
  );
}
