import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ModalHeader, ModalBody } from "@/components/lib/Modal";
import { CircleNotch } from "@phosphor-icons/react";
import Orders from "@/models/orders";
import showToast from "@/utils/toast";

const ALLOWED_TRANSITIONS = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["delivered"],
  delivered: [],
  cancelled: [],
};

const STATUS_BADGE = {
  pending: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  confirmed: "bg-sky-500/10 text-sky-300 border-sky-500/30",
  preparing: "bg-violet-500/10 text-violet-300 border-violet-500/30",
  ready: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  delivered: "bg-green-500/10 text-green-300 border-green-500/30",
  cancelled: "bg-red-500/10 text-red-300 border-red-500/30",
};

export function OrdersStatusBadge({ status }) {
  const { t } = useTranslation();
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${
        STATUS_BADGE[status] || STATUS_BADGE.pending
      }`}
    >
      {t(`settings.orders.status.${status}`)}
    </span>
  );
}

function formatMoney(order) {
  return (order.totalCents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: order.currency || "BRL",
  });
}

export default function OrderDetail({ order, onClose, onUpdated }) {
  const { t } = useTranslation();
  const [detail, setDetail] = useState(order);
  const [loading, setLoading] = useState(!order?.items?.length);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Orders.get(order.id).then(({ order: found, error }) => {
      if (!active) return;
      if (found) setDetail(found);
      else if (error) showToast(error, "error");
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [order.id]);

  const handleStatus = async (status) => {
    setSaving(true);
    const { error } = await Orders.updateStatus(detail.id, status);
    setSaving(false);
    if (error) {
      showToast(error, "error");
      return;
    }
    showToast(t("settings.orders.actions.updateStatus"), "success");
    onUpdated();
  };

  const transitions = ALLOWED_TRANSITIONS[detail?.status] || [];
  const nonCancelTransitions = transitions.filter(
    (status) => status !== "cancelled"
  );
  const canCancel = !["delivered", "cancelled"].includes(detail?.status);

  return (
    <form
      className="flex flex-col gap-y-5"
      onSubmit={(event) => event.preventDefault()}
    >
      <ModalHeader
        title={`${t("settings.orders.fields.orderId")} #${detail?.id}`}
        onClose={onClose}
      />
      <ModalBody>
        {loading || !detail ? (
          <div className="flex items-center justify-center py-10 text-zinc-400 light:text-slate-600">
            <CircleNotch size={20} className="animate-spin" />
          </div>
        ) : (
          <div className="flex flex-col gap-y-5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <OrdersStatusBadge status={detail.status} />
              <span className="text-sm text-zinc-200 light:text-slate-800">
                {detail.customerName} — {detail.customerPhone}
              </span>
              <span className="text-sm font-medium text-zinc-100 light:text-slate-900">
                {formatMoney(detail)}
              </span>
            </div>
            <div className="text-xs text-zinc-400 light:text-slate-600">
              {t("settings.orders.fields.createdAt")}:{" "}
              {new Date(detail.createdAt).toLocaleString("pt-BR")}
            </div>
            {detail.notes && (
              <p className="text-sm whitespace-pre-wrap text-zinc-300 light:text-slate-700">
                {detail.notes}
              </p>
            )}
            <div className="flex flex-col divide-y divide-white/5 light:divide-slate-300">
              <div className="flex items-center justify-between px-2 pb-[14px] text-xs font-semibold uppercase tracking-[1.4px] text-zinc-400 light:text-slate-600">
                <span>{t("settings.orders.fields.items")}</span>
                <span>{t("settings.orders.fields.quantity")}</span>
                <span>{t("settings.orders.fields.totalCents")}</span>
              </div>
              {detail.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between px-2 py-3 text-sm text-zinc-200 light:text-slate-800"
                >
                  <span>
                    #{item.menuItemId}
                    {item.notes ? ` — ${item.notes}` : ""}
                  </span>
                  <span>{item.quantity}</span>
                  <span>
                    {(item.unitPriceCents * item.quantity).toLocaleString(
                      "pt-BR",
                      {
                        style: "currency",
                        currency: detail.currency || "BRL",
                      }
                    )}
                  </span>
                </div>
              ))}
            </div>
            {nonCancelTransitions.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {nonCancelTransitions.map((status) => (
                  <button
                    key={status}
                    type="button"
                    disabled={saving}
                    onClick={() => handleStatus(status)}
                    className="border-none h-9 px-4 rounded-lg bg-zinc-50 text-zinc-950 light:bg-slate-900 light:text-white text-sm font-medium hover:bg-zinc-200 light:hover:bg-slate-800"
                  >
                    {t(`settings.orders.status.${status}`)}
                  </button>
                ))}
                {canCancel && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handleStatus("cancelled")}
                    className="border-none h-9 px-4 rounded-lg bg-red-500/10 text-red-300 text-sm font-medium hover:bg-red-500/20"
                  >
                    {t("settings.orders.actions.cancel")}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </ModalBody>
    </form>
  );
}
