import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Sidebar from "@/components/SettingsSidebar";
import { isMobile } from "react-device-detect";
import Modal from "@/components/lib/Modal";
import { useModal } from "@/hooks/useModal";
import Menu from "@/models/menu";
import showToast from "@/utils/toast";
import { Plus } from "@phosphor-icons/react";
import List from "./List";
import Editor from "./Editor";

export default function MenuPage() {
  const { t } = useTranslation();
  const { isOpen, openModal, closeModal } = useModal();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingItem, setEditingItem] = useState(null);

  const fetchItems = async () => {
    const { items: foundItems } = await Menu.list();
    setItems(foundItems || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const handleToggle = async (item) => {
    const { error } = await Menu.update(item.id, {
      available: !item.available,
    });
    if (error) {
      showToast(error, "error", { clear: true });
      return;
    }
    fetchItems();
  };

  const handleDelete = async (item) => {
    if (!window.confirm(t("settings.menu.confirmDelete"))) return;
    const { error } = await Menu.delete(item.id);
    if (error) {
      showToast(error, "error", { clear: true });
      return;
    }
    fetchItems();
  };

  const handleCreate = () => {
    setEditingItem(null);
    openModal();
  };

  const handleEdit = (item) => {
    setEditingItem(item);
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
          <div className="w-full flex items-end justify-between gap-x-4 pb-6 border-white/10 light:border-slate-300 border-b-2">
            <div className="flex flex-col gap-y-2">
              <p className="text-lg leading-7 font-semibold text-zinc-50 light:text-slate-950">
                {t("settings.menu.label")}
              </p>
              <p className="text-xs leading-4 text-zinc-400 light:text-slate-600 max-w-[700px]">
                {t("settings.menu.description")}
              </p>
            </div>
            <button
              type="button"
              onClick={handleCreate}
              className="border-none flex items-center gap-1.5 h-9 px-5 rounded-lg bg-zinc-50 text-zinc-950 light:bg-slate-900 light:text-white text-sm font-medium hover:bg-zinc-200 light:hover:bg-slate-800 transition-colors"
            >
              <Plus size={16} />
              {t("settings.menu.items.new")}
            </button>
          </div>
          <div className="pt-8">
            {loading ? (
              <div className="w-full flex items-center justify-center text-zinc-400 light:text-slate-600 text-sm pt-8">
                {t("settings.menu.loading")}
              </div>
            ) : (
              <List
                items={items}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onToggle={handleToggle}
              />
            )}
          </div>
        </div>
      </div>

      <Modal isOpen={isOpen} onClose={closeModal} size="lg">
        <Editor
          item={editingItem}
          onClose={closeModal}
          onSaved={() => {
            closeModal();
            fetchItems();
          }}
        />
      </Modal>
    </div>
  );
}
