import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CircleNotch } from "@phosphor-icons/react";
import WhatsApp from "@/models/whatsapp";
import ConnectedView from "./ConnectedView";
import SetupView from "./SetupView";
import ConnectionsLayout from "../ConnectionsLayout";
import { useTranslation } from "react-i18next";
import System from "@/models/system";
import paths from "@/utils/paths";

export default function WhatsAppBotSettings() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [redirected, setRedirected] = useState(false);
  const [config, setConfig] = useState(null);

  useEffect(() => {
    async function fetchData() {
      const [isMultiUserMode, configRes] = await Promise.all([
        System.isMultiUserMode(),
        WhatsApp.getConfig(),
      ]);

      if (isMultiUserMode) {
        navigate(paths.home());
        setRedirected(true);
        return;
      }

      setConfig(configRes?.config || null);
      setLoading(false);
    }
    fetchData();
  }, []);

  const handleConnected = (newConfig) => setConfig(newConfig);
  const handleDisconnected = async () => {
    const configRes = await WhatsApp.getConfig();
    setConfig(configRes?.config || null);
  };

  if (redirected) return null;

  if (loading) {
    return (
      <ConnectionsLayout>
        <div
          className="flex items-center justify-center h-full"
          role="status"
          aria-live="polite"
        >
          <CircleNotch className="h-8 w-8 text-zinc-400 light:text-slate-400 animate-spin" />
          <span className="sr-only">Loading</span>
        </div>
      </ConnectionsLayout>
    );
  }

  const hasConfig = config?.active && config?.phoneNumberId;
  if (!hasConfig) {
    return (
      <ConnectionsLayout
        fullPage={true}
        title={t("whatsapp.title")}
        description={t("whatsapp.description")}
        docsHref={paths.docs("/channels/whatsapp")}
      >
        <SetupView onConnected={handleConnected} />
      </ConnectionsLayout>
    );
  }

  return (
    <ConnectionsLayout
      fullPage={true}
      title={t("whatsapp.title")}
      description={t("whatsapp.description")}
      docsHref={paths.docs("/channels/whatsapp")}
    >
      <ConnectedView config={config} onDisconnected={handleDisconnected} />
    </ConnectionsLayout>
  );
}
