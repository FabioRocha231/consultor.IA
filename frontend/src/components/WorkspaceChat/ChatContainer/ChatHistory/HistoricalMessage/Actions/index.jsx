import React, { memo, useState } from "react";
import useCopyText from "@/hooks/useCopyText";
import {
  Activity,
  Check,
  ThumbsUp,
  ThumbsDown,
  ArrowsClockwise,
  Copy,
  X,
} from "@phosphor-icons/react";
import Workspace from "@/models/workspace";
import { EditMessageAction } from "./EditMessage";
import RenderMetrics from "./RenderMetrics";
import ActionMenu from "./ActionMenu";
import { useTranslation } from "react-i18next";
import Modal, {
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalPrimaryButton,
  ModalSecondaryButton,
  ModalTextarea,
} from "@/components/lib/Modal";

const FEEDBACK_CATEGORIES = [
  "informacao_incorreta",
  "informacao_desatualizada",
  "nao_encontrou_resposta",
  "resposta_confusa",
  "outro",
];

const Actions = ({
  message,
  feedbackScore,
  feedbackCategory = null,
  feedbackComment = null,
  traceId = null,
  chatId,
  slug,
  isLastMessage,
  regenerateMessage,
  forkThread,
  isEditing,
  role,
  metrics = {},
}) => {
  const { t } = useTranslation();
  const [selectedFeedback, setSelectedFeedback] = useState(feedbackScore);
  const [submittedCategory, setSubmittedCategory] = useState(feedbackCategory);
  const [submittedComment, setSubmittedComment] = useState(feedbackComment);
  const [modalOpen, setModalOpen] = useState(false);
  const [draftCategory, setDraftCategory] = useState(null);
  const [draftComment, setDraftComment] = useState("");

  const handlePositiveFeedback = async () => {
    const updatedFeedback = selectedFeedback === true ? null : true;
    await Workspace.updateChatFeedback(chatId, slug, updatedFeedback);
    setSelectedFeedback(updatedFeedback);
    if (updatedFeedback !== true) {
      setSubmittedCategory(null);
      setSubmittedComment(null);
    }
  };

  const openNegativeFeedback = () => {
    setDraftCategory(submittedCategory || null);
    setDraftComment(submittedComment || "");
    setModalOpen(true);
  };

  const submitNegativeFeedback = async () => {
    if (!draftCategory) return;
    const comment = draftComment.trim() || null;
    await Workspace.updateChatFeedback(
      chatId,
      slug,
      false,
      draftCategory,
      comment
    );
    setSelectedFeedback(false);
    setSubmittedCategory(draftCategory);
    setSubmittedComment(comment);
    setModalOpen(false);
  };

  const clearFeedback = async () => {
    await Workspace.updateChatFeedback(chatId, slug, null);
    setSelectedFeedback(null);
    setSubmittedCategory(null);
    setSubmittedComment(null);
  };

  return (
    <div
      className={`flex w-full flex-wrap items-center gap-y-1 ${role === "user" ? "justify-end" : "justify-between"}`}
    >
      <div className="flex justify-start items-center gap-x-[8px]">
        <div className="md:group-hover:opacity-100 transition-all duration-300 md:opacity-0 flex justify-start items-center gap-x-[8px]">
          <div
            className={`flex justify-start items-center gap-x-[8px] ${role === "user" ? "flex-row-reverse" : ""}`}
          >
            <CopyMessage message={message} />
            <EditMessageAction
              chatId={chatId}
              role={role}
              isEditing={isEditing}
            />
          </div>
          {isLastMessage && !isEditing && (
            <RegenerateMessage
              regenerateMessage={regenerateMessage}
              slug={slug}
              chatId={chatId}
            />
          )}
          {chatId && role !== "user" && !isEditing && (
            <div className="flex items-start gap-x-1">
              {traceId && <TraceButton traceId={traceId} />}
              <FeedbackButton
                isSelected={selectedFeedback === true}
                handleFeedback={handlePositiveFeedback}
                tooltipId="feedback-button"
                tooltipContent={
                  selectedFeedback === true
                    ? t("feedback.thanks")
                    : t("chat_window.good_response")
                }
                IconComponent={ThumbsUp}
              />
              <FeedbackButton
                isSelected={selectedFeedback === false}
                handleFeedback={openNegativeFeedback}
                tooltipId="feedback-button-negative"
                tooltipContent={t("feedback.title")}
                IconComponent={ThumbsDown}
              />
              {selectedFeedback === false && submittedCategory && (
                <div className="mt-3 flex items-center gap-x-1">
                  <button
                    onClick={openNegativeFeedback}
                    className="text-xs text-zinc-300 light:text-slate-500 hover:text-white light:hover:text-slate-900"
                  >
                    {t(`feedback.categories.${submittedCategory}`)}
                  </button>
                  <button
                    onClick={clearFeedback}
                    aria-label={t("feedback.clear")}
                    className="text-zinc-300 light:text-slate-500 hover:text-white light:hover:text-slate-900"
                  >
                    <X size={12} weight="bold" />
                  </button>
                </div>
              )}
            </div>
          )}
          <ActionMenu
            chatId={chatId}
            forkThread={forkThread}
            isEditing={isEditing}
            role={role}
          />
        </div>
      </div>
      <RenderMetrics metrics={metrics} />
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        size="sm"
        closeOnBackdrop
      >
        <ModalHeader
          title={t("feedback.title")}
          onClose={() => setModalOpen(false)}
        />
        <ModalBody>
          <div className="flex flex-col gap-y-2">
            {traceId && (
              <a
                href={traceUrl(traceId)}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-x-1 text-xs text-zinc-300 light:text-slate-500 hover:text-sky-300 light:hover:text-sky-700"
              >
                <Activity size={16} />
                {t("workspace.trace.view")}
              </a>
            )}
            {FEEDBACK_CATEGORIES.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setDraftCategory(category)}
                aria-pressed={draftCategory === category}
                className={`w-full rounded-lg border px-3 py-2 text-sm text-left transition-colors ${
                  draftCategory === category
                    ? "border-sky-500 bg-sky-500/10 text-sky-300 light:text-sky-700"
                    : "border-zinc-700 bg-zinc-800 text-zinc-200 hover:border-zinc-500 light:border-slate-300 light:bg-white light:text-slate-800"
                }`}
              >
                {t(`feedback.categories.${category}`)}
              </button>
            ))}
          </div>
          <ModalTextarea
            label={t("feedback.comment.label")}
            placeholder={t("feedback.comment.placeholder")}
            value={draftComment}
            onChange={(event) => setDraftComment(event.target.value)}
            maxLength={500}
            rows={3}
            optional
          />
        </ModalBody>
        <ModalFooter>
          <ModalSecondaryButton
            type="button"
            onClick={() => setModalOpen(false)}
          >
            {t("feedback.cancel")}
          </ModalSecondaryButton>
          <ModalPrimaryButton
            type="button"
            onClick={submitNegativeFeedback}
            disabled={!draftCategory}
          >
            {t("feedback.submit")}
          </ModalPrimaryButton>
        </ModalFooter>
      </Modal>
    </div>
  );
};

function FeedbackButton({
  isSelected,
  handleFeedback,
  tooltipContent,
  tooltipId,
  IconComponent,
}) {
  return (
    <div className="mt-3 relative">
      <button
        onClick={handleFeedback}
        data-tooltip-id={tooltipId}
        data-tooltip-content={tooltipContent}
        className="text-zinc-300 light:text-slate-500"
        aria-label={tooltipContent}
      >
        <IconComponent
          size={20}
          className="mb-1"
          weight={isSelected ? "fill" : "regular"}
        />
      </button>
    </div>
  );
}

function TraceButton({ traceId }) {
  const { t } = useTranslation();
  return (
    <div className="mt-3 relative">
      <a
        href={traceUrl(traceId)}
        target="_blank"
        rel="noreferrer"
        data-tooltip-id="view-trace"
        data-tooltip-content={t("workspace.trace.view")}
        aria-label={t("workspace.trace.view")}
        className="text-zinc-300 light:text-slate-500 hover:text-sky-300 light:hover:text-sky-700"
      >
        <Activity size={20} className="mb-1" />
      </a>
    </div>
  );
}

function traceUrl(traceId) {
  return `https://grafana.local/explore?trace=${traceId}`;
}

function CopyMessage({ message }) {
  const { copied, copyText } = useCopyText();
  const { t } = useTranslation();

  return (
    <>
      <div className="mt-3 relative">
        <button
          onClick={() => copyText(message)}
          data-tooltip-id="copy-assistant-text"
          data-tooltip-content={t("chat_window.copy")}
          className="text-zinc-300 light:text-slate-500"
          aria-label={t("chat_window.copy")}
        >
          {copied ? (
            <Check size={20} className="mb-1" />
          ) : (
            <Copy size={20} className="mb-1" />
          )}
        </button>
      </div>
    </>
  );
}

function RegenerateMessage({ regenerateMessage, chatId }) {
  const { t } = useTranslation();
  if (!chatId) return null;
  return (
    <div className="mt-3 relative">
      <button
        onClick={() => regenerateMessage(chatId)}
        data-tooltip-id="regenerate-assistant-text"
        data-tooltip-content={t("chat_window.regenerate_response")}
        className="border-none text-zinc-300 light:text-slate-500"
        aria-label={t("chat_window.regenerate")}
      >
        <ArrowsClockwise size={20} className="mb-1" weight="fill" />
      </button>
    </div>
  );
}

export default memo(Actions);
