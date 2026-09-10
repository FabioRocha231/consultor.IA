import { useTranslation } from "react-i18next";
import { PencilSimple, Trash } from "@phosphor-icons/react";

function formatMoney(item) {
  return (item.priceCents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: item.currency || "BRL",
  });
}

export default function MenuList({ items, onEdit, onDelete, onToggle }) {
  const { t } = useTranslation();

  if (items.length === 0)
    return (
      <div className="flex flex-col items-center justify-center gap-8 py-24 text-center">
        <p className="text-base font-semibold text-zinc-50 light:text-slate-950">
          {t("settings.menu.empty")}
        </p>
      </div>
    );

  return (
    <div className="flex flex-col divide-y divide-white/5 light:divide-slate-300">
      <div className="flex items-center justify-between px-4 pb-[18px] text-xs font-semibold uppercase tracking-[1.4px] text-zinc-400 light:text-slate-600">
        <span className="w-[180px]">{t("settings.menu.fields.category")}</span>
        <span className="w-[220px]">{t("settings.menu.fields.name")}</span>
        <span className="w-[140px]">{t("settings.menu.price")}</span>
        <span className="w-[100px]">{t("settings.menu.fields.available")}</span>
        <span className="w-[120px] text-right">
          {t("settings.menu.actions")}
        </span>
      </div>
      <div className="h-px w-full bg-white/10 light:bg-slate-300" />
      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-center justify-between px-4 py-3 text-sm text-zinc-200 light:text-slate-800"
        >
          <span className="w-[180px] break-words">{item.category}</span>
          <span className="w-[220px] break-words">{item.name}</span>
          <span className="w-[140px]">{formatMoney(item)}</span>
          <span className="w-[100px]">
            <input
              type="checkbox"
              checked={Boolean(item.available)}
              onChange={() => onToggle(item)}
              aria-label={t("settings.menu.fields.available")}
            />
          </span>
          <span className="w-[120px] flex items-center justify-end gap-x-1">
            <button
              type="button"
              onClick={() => onEdit(item)}
              aria-label={t("settings.menu.items.edit")}
              className="border-none p-2 rounded-lg hover:bg-white/10 light:hover:bg-slate-200 text-zinc-300 light:text-slate-700"
            >
              <PencilSimple size={18} />
            </button>
            <button
              type="button"
              onClick={() => onDelete(item)}
              aria-label="Delete"
              className="border-none p-2 rounded-lg hover:bg-white/10 light:hover:bg-slate-200 text-red-400"
            >
              <Trash size={18} />
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}
