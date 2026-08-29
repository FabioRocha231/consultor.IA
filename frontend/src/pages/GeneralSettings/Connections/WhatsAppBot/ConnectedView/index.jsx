import { useState } from "react";
import { CircleNotch, Copy, WhatsappLogo } from "@phosphor-icons/react";
import WhatsApp from "@/models/whatsapp";
import showToast from "@/utils/toast";
import { StatusPill } from "../../ConnectionsLayout";
import { useTranslation } from "react-i18next";

export default function ConnectedView({ config, onDisconnected }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const webhookUrl = `${window.location.origin}${config.webhookPath || ""}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      showToast(t("whatsapp.connected.copied"), "success");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast(t("whatsapp.connected.toast-copy-failed"), "error");
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    const res = await WhatsApp.disconnect();
    setDisconnecting(false);

    if (!res.success) {
      showToast(
        res.error || t("whatsapp.connected.toast-disconnect-failed"),
        "error"
      );
      return;
    }

    showToast(t("whatsapp.connected.toast-disconnect-success"), "success");
    onDisconnected();
  }

  return (
    <div className="flex flex-col gap-y-8 mt-8">
      <div className="flex flex-col gap-y-[18px]">
        <div className="border border-zinc-700 light:border-slate-200 rounded-xl p-4 w-full max-w-[700px]">
          <div className="flex flex-col gap-y-4 text-sm">
            <div className="flex items-center justify-between gap-x-2">
              <div className="flex items-center gap-x-2">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[#25D366]/20 shrink-0">
                  <WhatsappLogo
                    className="h-5 w-5 text-[#25D366]"
                    weight="fill"
                  />
                </div>
                <StatusPill variant="connected">
                  {t("whatsapp.connected.status-connected")}
                </StatusPill>
              </div>
            </div>
            <DetailRow
              label={t("whatsapp.connected.phone-number")}
              value={config.phoneNumberId}
            />
            <DetailRow
              label={t("whatsapp.connected.workspace")}
              value={config.workspaceSlug}
            />
            <div className="flex flex-col gap-y-2">
              <span className="font-medium text-white light:text-slate-900">
                {t("whatsapp.connected.webhook-url")}
              </span>
              <p className="text-xs text-zinc-400 light:text-slate-600">
                {t("whatsapp.connected.webhook-url-help")}
              </p>
              <div className="flex flex-col sm:flex-row gap-x-2 gap-y-2">
                <code className="flex-1 min-w-0 text-xs text-zinc-300 light:text-slate-700 break-all bg-zinc-800 light:bg-slate-100 rounded-lg px-3 py-2">
                  {webhookUrl}
                </code>
                <button
                  type="button"
                  onClick={handleCopy}
                  disabled={copied}
                  className="flex items-center justify-center gap-x-2 text-sm font-medium bg-zinc-50 light:bg-slate-900 text-zinc-900 light:text-white rounded-lg h-11 px-4 hover:opacity-90 transition-opacity duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <Copy className="h-4 w-4" />
                  {copied
                    ? t("whatsapp.connected.copied")
                    : t("whatsapp.connected.copy-url")}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-y-2">
        {confirmingDisconnect ? (
          <div className="flex flex-col gap-y-2" role="alert">
            <p className="text-sm text-white light:text-slate-900">
              Are you sure you want to disconnect WhatsApp?
            </p>
            <div className="flex flex-wrap gap-x-2 gap-y-2">
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="flex items-center justify-center gap-x-2 text-sm font-medium bg-red-500/20 light:bg-red-100 text-red-400 light:text-red-700 rounded-lg h-11 px-4 hover:opacity-90 transition-opacity duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {disconnecting ? (
                  <CircleNotch className="h-4 w-4 animate-spin" />
                ) : (
                  t("whatsapp.connected.disconnect")
                )}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDisconnect(false)}
                disabled={disconnecting}
                className="flex items-center justify-center text-sm font-medium bg-zinc-800 light:bg-slate-200 text-white light:text-slate-900 rounded-lg h-11 px-4 hover:opacity-90 transition-opacity duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDisconnect(true)}
            className="flex items-center justify-center gap-x-2 text-sm font-medium bg-zinc-50 light:bg-slate-900 text-zinc-950 light:text-white rounded-lg h-11 px-5 w-fit hover:opacity-90 transition-opacity duration-200"
          >
            {t("whatsapp.connected.disconnect")}
          </button>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-x-4">
      <span className="font-medium text-white light:text-slate-900">
        {label}
      </span>
      <span className="text-zinc-300 light:text-slate-700 break-all text-right">
        {value}
      </span>
    </div>
  );
}
