/* eslint-env jest, node */
const { validateFeedbackInput } = require("../../utils/feedbackValidation");

describe("validateFeedbackInput", () => {
  it("accepts a negative feedback with category and comment", () => {
    const result = validateFeedbackInput({
      feedback: false,
      category: "informacao_incorreta",
      comment: "  O horario esta errado.  ",
    });

    expect(result.ok).toBe(true);
    expect(result.value).toEqual({
      score: false,
      category: "informacao_incorreta",
      comment: "O horario esta errado.",
    });
  });

  it("rejects negative feedback without a category", () => {
    const result = validateFeedbackInput({ feedback: false });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/invalid feedback category/i);
  });

  it("rejects an invalid category", () => {
    const result = validateFeedbackInput({
      feedback: false,
      category: "nao_gostei",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/invalid feedback category/i);
  });

  it("rejects comments longer than 1000 characters", () => {
    const result = validateFeedbackInput({
      feedback: false,
      category: "outro",
      comment: "a".repeat(1001),
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/1000 characters or fewer/i);
  });

  it("ignores category and comment for positive or null feedback", () => {
    const positive = validateFeedbackInput({
      feedback: true,
      category: "outro",
      comment: "ignored",
    });
    const cleared = validateFeedbackInput({
      feedback: null,
      category: "outro",
      comment: "ignored",
    });

    expect(positive.value).toEqual({
      score: true,
      category: null,
      comment: null,
    });
    expect(cleared.value).toEqual({
      score: null,
      category: null,
      comment: null,
    });
  });
});
