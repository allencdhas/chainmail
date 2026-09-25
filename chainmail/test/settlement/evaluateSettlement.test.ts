import { describe, expect, it } from "vitest";
import { evaluateSettlement } from "../../src/settlement/evaluateSettlement.js";
import type { PolicyConfig, TransactionRecord } from "../../src/policy/types.js";

const NOW = new Date("2026-09-25T12:00:00.000Z");

const POLICY_CONFIG: PolicyConfig = {
  perTransactionCapUsd: 1000,
  dailyCapUsd: 2000,
  secondConfirmationThresholdUsd: 500,
  blockedRecipients: ["bad-actor@example.com"],
};

describe("evaluateSettlement", () => {
  it("approves a valid in-range candidate with no history", () => {
    const decision = evaluateSettlement({
      candidate: { payeeEmail: "alex@example.com", recipient: "client@example.com", amountUsd: 100 },
      history: [],
      config: POLICY_CONFIG,
      now: NOW,
    });
    expect(decision.approved).toBe(true);
    expect(decision.policyDecision.allowed).toBe(true);
  });

  it("rejects a candidate over the per-transaction cap", () => {
    const decision = evaluateSettlement({
      candidate: { payeeEmail: "alex@example.com", recipient: "client@example.com", amountUsd: 1500 },
      history: [],
      config: POLICY_CONFIG,
      now: NOW,
    });
    expect(decision.approved).toBe(false);
    expect(decision.policyDecision.violations.map((v) => v.code)).toContain("PER_TRANSACTION_CAP_EXCEEDED");
  });

  it("rejects a blocked recipient", () => {
    const decision = evaluateSettlement({
      candidate: { payeeEmail: "alex@example.com", recipient: "bad-actor@example.com", amountUsd: 10 },
      history: [],
      config: POLICY_CONFIG,
      now: NOW,
    });
    expect(decision.approved).toBe(false);
  });

  it("catches a daily cap violation caused by transactions that landed AFTER a hypothetical proposal-time check", () => {
    // Simulates the exact scenario this module exists to prevent: other
    // transactions landed between proposal time and the payer's pay-click
    // (the authorize_payment token can be valid for up to 24h).
    const history: TransactionRecord[] = [
      {
        id: "tx-in-between",
        payeeEmail: "alex@example.com",
        recipient: "someone-else@example.com",
        amountUsd: 1950,
        createdAt: new Date(NOW.getTime() - 60_000),
        status: "settled",
      },
    ];

    const decision = evaluateSettlement({
      candidate: { payeeEmail: "alex@example.com", recipient: "client@example.com", amountUsd: 100 },
      history,
      config: POLICY_CONFIG,
      now: NOW,
    });

    expect(decision.approved).toBe(false);
    expect(decision.policyDecision.violations.map((v) => v.code)).toContain("DAILY_CAP_EXCEEDED");
  });

  it("exposes the full underlying policyDecision for logging/auditing", () => {
    const decision = evaluateSettlement({
      candidate: { payeeEmail: "alex@example.com", recipient: "client@example.com", amountUsd: 600 },
      history: [],
      config: POLICY_CONFIG,
      now: NOW,
    });
    expect(decision.policyDecision.requiresSecondConfirmation).toBe(true);
    expect(decision.policyDecision.dailyTotalUsd).toBe(600);
  });
});
