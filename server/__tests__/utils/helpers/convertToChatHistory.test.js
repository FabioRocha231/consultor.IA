/* eslint-env jest, node */
const {
  convertToChatHistory,
} = require("../../../utils/helpers/chat/responses");

const TRACE_ID = "0123456789abcdef0123456789abcdef";

describe("convertToChatHistory traceId", () => {
  it("includes traceId on the assistant history message", () => {
    const history = [
      {
        id: 1,
        prompt: "Olá",
        response: JSON.stringify({ text: "Oi" }),
        createdAt: new Date("2026-08-23T12:00:00.000Z"),
        traceId: TRACE_ID,
      },
    ];

    const result = convertToChatHistory(history);

    expect(result).toEqual([
      expect.objectContaining({ role: "user", chatId: 1 }),
      expect.objectContaining({
        role: "assistant",
        chatId: 1,
        traceId: TRACE_ID,
      }),
    ]);
  });
});
