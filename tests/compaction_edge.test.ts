import { expect, test } from "bun:test";
import {
  createSession,
  appendMessage,
  compactSessionMessages,
  getContextMessages,
  getMessages,
  hasSessionContext,
} from "../src/store.ts";
import { fallbackSummarize, summarizeContext, compactContext } from "../src/context.ts";

test("compactSessionMessages safely handles <= 8 messages or empty sessions without TypeError", () => {
  const session = createSession({ projectDir: process.cwd() });

  // 0 messages: getContextMessages must return [] not [undefined, ...]
  expect(getContextMessages(session.id)).toEqual([]);

  // compactSessionMessages on empty session returns dropped=0 without throw
  const resEmpty = compactSessionMessages(session.id, "Summary note");
  expect(resEmpty.dropped).toBe(0);
  expect(resEmpty.originalCount).toBe(0);

  // 5 messages (< 8 messages)
  for (let i = 0; i < 5; i++) {
    appendMessage(session.id, `msg_${i}`, {
      id: `msg_${i}`,
      role: i % 2 === 0 ? "user" : "assistant",
      parts: [{ type: "text", text: `hello ${i}` }],
    });
  }
  const resFew = compactSessionMessages(session.id, "Summary note");
  expect(resFew.dropped).toBe(0);
  expect(resFew.originalCount).toBe(5);
});

test("compactSessionMessages generates compact-notice with role assistant and safe cutoff", () => {
  const session = createSession({ projectDir: process.cwd() });
  for (let i = 0; i < 15; i++) {
    appendMessage(session.id, `msg_${i}`, {
      id: `msg_${i}`,
      role: i % 2 === 0 ? "user" : "assistant",
      parts: [{ type: "text", text: `Turn ${i}` }],
    });
  }

  const compactRes = compactSessionMessages(session.id, "Archive summary text");
  expect(compactRes.dropped).toBe(6); // 15 - 1 - 8 = 6
  expect(hasSessionContext(session.id)).toBe(true);

  const contextMsgs = getContextMessages(session.id);
  expect(contextMsgs.length).toBe(10); // 1 (first) + 1 (notice) + 8 (tail)

  const notice = contextMsgs[1];
  expect(notice?.uid).toBe("compact-notice");
  expect(notice?.data?.id).toBe("compact-notice");
  expect(notice?.data?.role).toBe("assistant");
  expect(notice?.data?.parts?.[0]?.text).toBe("Archive summary text");

  // getMessages should still preserve all 15 original messages
  expect(getMessages(session.id).length).toBe(15);
});

test("fallbackSummarize extracts user goals, tool file paths, commands and error states", () => {
  const mockHistory = [
    {
      role: "user",
      parts: [{ type: "text", text: "Fix database compaction and resilience" }],
    },
    {
      role: "assistant",
      parts: [
        {
          type: "tool-edit",
          input: { path: "src/store.ts", command: "bun test" },
          errorText: "Failed reading offset",
        },
      ],
    },
    {
      role: "user",
      parts: [{ type: "text", text: "Make sure fallback works reliably" }],
    },
  ];

  const summary = fallbackSummarize(mockHistory);
  expect(summary).toContain("Fix database compaction");
  expect(summary).toContain("src/store.ts");
  expect(summary).toContain("bun test");
  expect(summary).toContain("Failed reading offset");
});

test("summarizeContext safely falls back to deterministic summary on upstream error", async () => {
  const mockHistory = [
    {
      role: "user",
      parts: [{ type: "text", text: "Test upstream failure resilience" }],
    },
    {
      role: "assistant",
      parts: [
        {
          type: "tool-write",
          input: { file: "test.ts" },
        },
      ],
    },
  ];

  // Pass non-existent provider/model so network/model initialization fails
  const summary = await summarizeContext(mockHistory, "nonexistent-provider", "nonexistent-model");
  expect(summary).toBeDefined();
  expect(typeof summary).toBe("string");
  expect(summary.length).toBeGreaterThan(0);
  expect(summary).toContain("Test upstream failure resilience");
  expect(summary).toContain("test.ts");
});

test("compactContext completes successfully even when model fails", async () => {
  const session = createSession({ projectDir: process.cwd() });
  for (let i = 0; i < 14; i++) {
    appendMessage(session.id, `msg_${i}`, {
      id: `msg_${i}`,
      role: i % 2 === 0 ? "user" : "assistant",
      parts: [{ type: "text", text: `Step ${i}: testing fallback` }],
    });
  }

  // compactContext with broken model
  const result = await compactContext(session.id, "invalid-prov", "invalid-mod");
  expect(result.dropped).toBeGreaterThan(0);
  expect(hasSessionContext(session.id)).toBe(true);

  const contextMsgs = getContextMessages(session.id);
  expect(contextMsgs.length).toBe(10);
  expect(contextMsgs[1]?.data?.id).toBe("compact-notice");
  expect(contextMsgs[1]?.data?.role).toBe("assistant");
});
