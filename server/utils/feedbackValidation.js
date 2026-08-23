const { VALID_FEEDBACK_CATEGORIES } = require("../models/workspaceChats");

function validateFeedbackInput(body = {}) {
  const { feedback = null, category = null, comment = null } = body || {};
  if (feedback !== null && typeof feedback !== "boolean")
    return { ok: false, error: "Invalid feedback value." };

  const normalizedComment = typeof comment === "string" ? comment.trim() : null;
  if (feedback === false) {
    if (!VALID_FEEDBACK_CATEGORIES.includes(category))
      return { ok: false, error: "Invalid feedback category." };
    if (normalizedComment && normalizedComment.length > 1000)
      return {
        ok: false,
        error: "Feedback comment must be 1000 characters or fewer.",
      };
  }

  return {
    ok: true,
    value: {
      score: feedback,
      category: feedback === false ? category : null,
      comment: feedback === false ? normalizedComment : null,
    },
  };
}

module.exports = { validateFeedbackInput };
