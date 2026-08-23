import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import Organization from "@/models/organization";

export default function Test() {
  const { t } = useTranslation();
  const [message, setMessage] = useState("");
  const [response, setResponse] = useState("");
  const [error, setError] = useState("");
  const [testing, setTesting] = useState(false);

  async function handleTest() {
    if (!message.trim()) {
      setError(t("onboarding.testMessageRequired"));
      return;
    }
    setError("");
    setTesting(true);
    const result = await Organization.testOnboarding(message);
    setTesting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setResponse(result.response);
  }

  return (
    <div className="w-full max-w-xl mx-auto space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") handleTest();
          }}
          placeholder={t("onboarding.testMessage")}
          className="flex-1 border border-theme-chat-input-border bg-theme-settings-input-bg text-theme-text-primary rounded-lg px-4 py-3 text-sm outline-none focus:outline-primary-button"
        />
        <button
          type="button"
          onClick={handleTest}
          disabled={testing}
          className="rounded-lg bg-sky-500 px-5 py-3 text-sm font-semibold text-white hover:bg-sky-400 disabled:opacity-50"
        >
          {testing ? t("onboarding.testing") : t("onboarding.test")}
        </button>
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      {response && (
        <div className="rounded-lg border border-theme-chat-input-border bg-theme-settings-input-bg p-4 text-sm text-theme-text-primary whitespace-pre-wrap">
          {response}
        </div>
      )}
    </div>
  );
}
