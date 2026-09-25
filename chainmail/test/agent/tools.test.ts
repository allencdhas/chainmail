import { describe, expect, it } from "vitest";
import {
  AGENT_TOOLS,
  buildToolHandlers,
  checkForDuplicates,
  createInvoiceDraft,
} from "../../src/agent/tools.js";
import type { PolicyConfig, TransactionRecord } from "../../src/policy/types.js";

const NOW = new Date("2026-09-25T12:00:00.000Z");

function txAt(overrides: Partial<TransactionRecord> = {}): TransactionRecord {
  return {
    id: overrides.id ?? "tx-1",
    payeeEmail: overrides.payeeEmail ?? "alex@example.com",
    recipient: overrides.recipient ?? "client@example.com",
    amountUsd: overrides.amountUsd ?? 100,
    createdAt: overrides.createdAt ?? NOW,
    status: overrides.status ?? "settled",
  };
}

const POLICY_CONFIG: PolicyConfig = {
  perTransactionCapUsd: 1000,
  dailyCapUsd: 2000,
  secondConfirmationThresholdUsd: 500,
  blockedRecipients: [],
};

describe("checkForDuplicates", () => {
  it("reports no duplicate with empty history", () => {
    const result = checkForDuplicates({
      candidate: { payeeEmail: "alex@example.com", recipient: "client@example.com", amountUsd: 500 },
      history: [],
      now: NOW,
    });
    expect(result.isDuplicate).toBe(false);
    expect(result.matches).toHaveLength(0);
  });

  it("flags an exact-match recent transaction as a duplicate", () => {
    const history = [txAt({ amountUsd: 500, createdAt: new Date(NOW.getTime() - 60_000) })];
    const result = checkForDuplicates({
      candidate: { payeeEmail: "alex@example.com", recipient: "client@example.com", amountUsd: 500 },
      history,
      now: NOW,
    });
    expect(result.isDuplicate).toBe(true);
    expect(result.matches).toHaveLength(1);
  });

  it("flags a same-recipient transaction within amount tolerance as a duplicate", () => {
    const history = [txAt({ amountUsd: 502, createdAt: new Date(NOW.getTime() - 60_000) })]; // within 5% of 500
    const result = checkForDuplicates({
      candidate: { payeeEmail: "alex@example.com", recipient: "client@example.com", amountUsd: 500 },
      history,
      now: NOW,
    });
    expect(result.isDuplicate).toBe(true);
  });

  it("does not flag an amount outside tolerance", () => {
    const history = [txAt({ amountUsd: 600, createdAt: new Date(NOW.getTime() - 60_000) })]; // 20% off
    const result = checkForDuplicates({
      candidate: { payeeEmail: "alex@example.com", recipient: "client@example.com", amountUsd: 500 },
      history,
      now: NOW,
    });
    expect(result.isDuplicate).toBe(false);
  });

  it("does not flag a different recipient even with the same amount", () => {
    const history = [txAt({ recipient: "other@example.com", amountUsd: 500, createdAt: new Date(NOW.getTime() - 60_000) })];
    const result = checkForDuplicates({
      candidate: { payeeEmail: "alex@example.com", recipient: "client@example.com", amountUsd: 500 },
      history,
      now: NOW,
    });
    expect(result.isDuplicate).toBe(false);
  });

  it("does not flag a different payee's transaction", () => {
    const history = [txAt({ payeeEmail: "someone-else@example.com", amountUsd: 500, createdAt: new Date(NOW.getTime() - 60_000) })];
    const result = checkForDuplicates({
      candidate: { payeeEmail: "alex@example.com", recipient: "client@example.com", amountUsd: 500 },
      history,
      now: NOW,
    });
    expect(result.isDuplicate).toBe(false);
  });

  it("does not flag transactions outside the recency window", () => {
    const history = [txAt({ amountUsd: 500, createdAt: new Date(NOW.getTime() - 25 * 60 * 60 * 1000) })]; // 25h ago
    const result = checkForDuplicates({
      candidate: { payeeEmail: "alex@example.com", recipient: "client@example.com", amountUsd: 500 },
      history,
      now: NOW,
    });
    expect(result.isDuplicate).toBe(false);
  });

  it("ignores cancelled transactions", () => {
    const history = [txAt({ amountUsd: 500, status: "cancelled", createdAt: new Date(NOW.getTime() - 60_000) })];
    const result = checkForDuplicates({
      candidate: { payeeEmail: "alex@example.com", recipient: "client@example.com", amountUsd: 500 },
      history,
      now: NOW,
    });
    expect(result.isDuplicate).toBe(false);
  });

  it("is case-insensitive on recipient and payeeEmail", () => {
    const history = [txAt({ recipient: "Client@Example.com", amountUsd: 500, createdAt: new Date(NOW.getTime() - 60_000) })];
    const result = checkForDuplicates({
      candidate: { payeeEmail: "ALEX@EXAMPLE.COM", recipient: "client@example.com", amountUsd: 500 },
      history,
      now: NOW,
    });
    expect(result.isDuplicate).toBe(true);
  });
});

describe("createInvoiceDraft", () => {
  it("builds a draft with all provided fields", () => {
    const draft = createInvoiceDraft({
      payeeEmail: "alex@example.com",
      recipient: "client@example.com",
      amountUsd: 500,
      memo: "logo work",
      now: NOW,
      idGenerator: () => "fixed-id",
    });
    expect(draft).toEqual({
      id: "fixed-id",
      payeeEmail: "alex@example.com",
      recipient: "client@example.com",
      amountUsd: 500,
      memo: "logo work",
      createdAt: NOW.toISOString(),
    });
  });

  it("generates a unique id when no idGenerator is provided", () => {
    const a = createInvoiceDraft({ payeeEmail: "a@x.com", recipient: "b@x.com", amountUsd: 1, memo: "m" });
    const b = createInvoiceDraft({ payeeEmail: "a@x.com", recipient: "b@x.com", amountUsd: 1, memo: "m" });
    expect(a.id).not.toBe(b.id);
  });
});

describe("AGENT_TOOLS", () => {
  it("defines exactly check_duplicate, check_policy_limits, and create_invoice", () => {
    expect(AGENT_TOOLS.map((t) => t.name).sort()).toEqual(
      ["check_duplicate", "check_policy_limits", "create_invoice"].sort(),
    );
  });

  it("every tool has a non-empty description and a JSON Schema input", () => {
    for (const tool of AGENT_TOOLS) {
      expect(tool.description.length).toBeGreaterThan(0);
      expect(tool.inputSchema["type"]).toBe("object");
      expect(Array.isArray(tool.inputSchema["required"])).toBe(true);
    }
  });
});

describe("buildToolHandlers", () => {
  const ctx = {
    payeeEmail: "alex@example.com",
    history: [] as TransactionRecord[],
    policyConfig: POLICY_CONFIG,
    now: NOW,
  };

  it("check_duplicate handler returns a successful, parseable result for valid input", () => {
    const handlers = buildToolHandlers();
    const result = handlers["check_duplicate"]!({ recipient: "client@example.com", amountUsd: 500 }, ctx);
    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content)).toHaveProperty("isDuplicate", false);
  });

  it("check_duplicate handler returns an error for invalid input", () => {
    const handlers = buildToolHandlers();
    const result = handlers["check_duplicate"]!({ recipient: "client@example.com", amountUsd: -5 }, ctx);
    expect(result.isError).toBe(true);
  });

  it("check_policy_limits handler wires through to the real policy engine", () => {
    const handlers = buildToolHandlers();
    const result = handlers["check_policy_limits"]!({ recipient: "client@example.com", amountUsd: 1500 }, ctx);
    expect(result.isError).toBe(false);
    const decision = JSON.parse(result.content);
    expect(decision.allowed).toBe(false);
    expect(decision.violations.some((v: { code: string }) => v.code === "PER_TRANSACTION_CAP_EXCEEDED")).toBe(true);
  });

  it("check_policy_limits handler returns an error for invalid input", () => {
    const handlers = buildToolHandlers();
    const result = handlers["check_policy_limits"]!({ recipient: "", amountUsd: 100 }, ctx);
    expect(result.isError).toBe(true);
  });

  it("create_invoice handler returns a valid invoice draft", () => {
    const handlers = buildToolHandlers();
    const result = handlers["create_invoice"]!(
      { recipient: "client@example.com", amountUsd: 500, memo: "logo work" },
      ctx,
    );
    expect(result.isError).toBe(false);
    const draft = JSON.parse(result.content);
    expect(draft.recipient).toBe("client@example.com");
    expect(draft.amountUsd).toBe(500);
    expect(draft.memo).toBe("logo work");
    expect(draft.payeeEmail).toBe(ctx.payeeEmail);
  });

  it("create_invoice handler returns an error for invalid input (missing memo)", () => {
    const handlers = buildToolHandlers();
    const result = handlers["create_invoice"]!({ recipient: "client@example.com", amountUsd: 500 }, ctx);
    expect(result.isError).toBe(true);
  });

  it("returns handlers for exactly the three known tool names", () => {
    const handlers = buildToolHandlers();
    expect(Object.keys(handlers).sort()).toEqual(
      ["check_duplicate", "check_policy_limits", "create_invoice"].sort(),
    );
  });
});
