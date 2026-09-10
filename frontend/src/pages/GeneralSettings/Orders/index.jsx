import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { isMobile } from "react-device-detect";
import { ArrowsClockwise, Eye } from "@phosphor-icons/react";
import Sidebar from "@/components/SettingsSidebar";
import Modal from "@/components/lib/Modal";
import { useModal } from "@/hooks/useModal";
import Orders from "@/models/orders";
import showToast from "@/utils/toast";
import Detail, { OrdersStatusBadge } from "./Detail";

const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "delivered",
  "cancelled",
];

function formatMoney(order) {
  return (order.totalCents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: order.currency || "BRL",
  });
}

export default function OrdersPage() {
  const { t } = useTranslation();
  const { isOpen, openModal, closeModal } = useModal();
  const [orders, setOrders] = useState([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);

  const fetchOrders = async () => {
    setLoading(true);
    const { orders: foundOrders, error } = await Orders.list(
      statusFilter ? { status: statusFilter } : {}
    );
    if (error) showToast(error, "error");
    setOrders(foundOrders || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchOrders();
  }, [statusFilter]);

  const handleOpen = (order) => {
    setSelectedOrder(order);
    openModal();
  };

  return (
    <div className="w-screen h-screen overflow-hidden bg-theme-bg-container flex">
      <Sidebar />
      <div
        style={{ height: isMobile ? "100%" : "calc(100% - 32px)" }}
        className="relative md:ml-[2px] md:mr-[16px] md:my-[16px] md:rounded-[16px] bg-theme-bg-secondary w-full h-full overflow-y-scroll p-4 md:p-0"
      >
        <div className="flex flex-col w-full px-1 md:pl-6 md:pr-[50px] md:py-6 py-16">
          <div className="w-full flex flex-wrap items-end justify-between gap-x-4 gap-y-4 pb-6 border-white/10 light:border-slate-300 border-b-2">
            <div className="flex flex-col gap-y-2">
              <p className="text-lg leading-7 font-semibold text-zinc-50 light:text-slate-950">
                {t("settings.orders.label")}
              </p>
              <p className="text-xs leading-4 text-zinc-400 light:text-slate-600 max-w-[700px]">
                {t("settings.orders.description")}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="h-9 rounded-lg bg-zinc-800 light:bg-slate-100 border border-zinc-700 light:border-slate-300 px-3 text-sm text-zinc-100 light:text-slate-900 outline-none focus:border-zinc-500"
                aria-label={t("settings.orders.filterByStatus")}
              >
                <option value="">{t("settings.orders.filterByStatus")}</option>
                {ORDER_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {t(`settings.orders.status.${status}`)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={fetchOrders}
                className="border-none flex items-center gap-1.5 h-9 px-5 rounded-lg bg-zinc-50 text-zinc-950 light:bg-slate-900 light:text-white text-sm font-medium hover:bg-zinc-200 light:hover:bg-slate-800 transition-colors"
              >
                <ArrowsClockwise size={16} />
                {t("refresh")}
              </button>
            </div>
          </div>
          <div className="pt-8">
            {loading ? (
              <div className="w-full flex items-center justify-center text-zinc-400 light:text-slate-600 text-sm pt-8">
                {t("settings.orders.loading")}
              </div>
            ) : orders.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-8 py-24 text-center">
                <p className="text-base font-semibold text-zinc-50 light:text-slate-950">
                  {t("settings.orders.empty")}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm">
                  <thead>
                    <tr className="text-left text-xs font-semibold uppercase tracking-[1.4px] text-zinc-400 light:text-slate-600">
                      <th className="px-4 pb-[14px] w-[100px]">
                        {t("settings.orders.fields.orderId")}
                      </th>
                      <th className="px-4 pb-[14px]">
                        {t("settings.orders.fields.customerName")}
                      </th>
                      <th className="px-4 pb-[14px] w-[160px]">
                        {t("settings.orders.fields.status")}
                      </th>
                      <th className="px-4 pb-[14px] w-[130px]">
                        {t("settings.orders.fields.totalCents")}
                      </th>
                      <th className="px-4 pb-[14px] w-[170px]">
                        {t("settings.orders.fields.createdAt")}
                      </th>
                      <th className="px-4 pb-[14px] w-[80px] text-right">
                        {t("settings.orders.actions.updateStatus")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 light:divide-slate-300">
                    {orders.map((order) => (
                      <tr
                        key={order.id}
                        className="text-zinc-200 light:text-slate-800"
                      >
                        <td className="px-4 py-3">#{order.id}</td>
                        <td className="px-4 py-3">
                          <div>{order.customerName}</div>
                          <div className="text-xs text-zinc-400 light:text-slate-600">
                            {order.customerPhone}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <OrdersStatusBadge status={order.status} />
                        </td>
                        <td className="px-4 py-3">{formatMoney(order)}</td>
                        <td className="px-4 py-3">
                          {new Date(order.createdAt).toLocaleString("pt-BR")}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleOpen(order)}
                            aria-label={t(
                              "settings.orders.actions.updateStatus"
                            )}
                            className="border-none p-2 rounded-lg hover:bg-white/10 light:hover:bg-slate-200 text-zinc-300 light:text-slate-700"
                          >
                            <Eye size={18} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      <Modal isOpen={isOpen} onClose={closeModal} size="lg">
        {selectedOrder && (
          <Detail
            order={selectedOrder}
            onClose={closeModal}
            onUpdated={() => {
              closeModal();
              fetchOrders();
            }}
          />
        )}
      </Modal>
    </div>
  );
}
