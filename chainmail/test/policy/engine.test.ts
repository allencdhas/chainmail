import { describe, expect, it } from "vitest";
import { evaluatePolicy } from "../../src/policy/engine.js";
import type { PolicyConfig, TransactionRecord } from "../../src/policy/types.js";

const baseConfig: PolicyConfig = {
  perTransactionCapUsd: 1000,
  dailyCapUsd: 2000,
  secondConfirmationThresholdUsd: 500,
  blockedRecipients: ["bad-actor@example.com"],
};

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

describe("evaluatePolicy", () => {
  it("allows a simple in-range transaction with no history", () => {
    const decision = evaluatePolicy({
      candidate: { payeeEmail: "alex@example.com", recipient: "client@example.com", amountUsd: 100, now: NOW },
      history: [],
      config: baseConfig,
    });

    expect(decision.allowed).toBe(true);
    expect(decision.violations).toHaveLength(0);
    expect(decision.requiresSecondConfirmation).toBe(false);
    expect(decision.dailyTotalUsd).toBe(100);
  });

  it("rejects zero and negative amounts as INVALID_AMOUNT", () => {
    for (const amountUsd of [0, -50]) {
      const decision = evaluatePolicy({
        candidate: { payeeEmail: "alex@example.com", recipient: "client@example.com", amountUsd, now: NOW },
        history: [],
        config: baseConfig,
      });
      expect(decision.allowed).toBe(false);
      expect(decision.violations.map((v) => v.code)).toContain("INVALID_AMOUNT");
    }
  });

  it("rejects NaN and Infinity amounts", () => {
    for (const amountUsd of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const decision = evaluatePolicy({
        candidate: { payeeEmail: "alex@example.com", recipient: "client@example.com", amountUsd, now: NOW },
        history: [],
        config: baseConfig,
      });
      expect(decision.allowed).toBe(false);
      expect(decision.violations.map((v) => v.code)).toContain("INVALID_AMOUNT");
    }
  });

  it("rejects amounts above the per-transaction cap", () => {
    const decision = evaluatePolicy({
      candidate: { payeeEmail: "alex@example.com", recipient: "client@example.com", amountUsd: 1500, now: NOW },
      history: [],
      config: baseConfig,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.violations.map((v) => v.code)).toContain("PER_TRANSACTION_CAP_EXCEEDED");
  });

  it("allows an amount exactly equal to the per-transaction cap", () => {
    const decision = evaluatePolicy({
      candidate: { payeeEmail: "alex@example.com", recipient: "client@example.com", amountUsd: 1000, now: NOW },
      history: [],
      config: baseConfig,
    });
    expect(decision.violations.map((v) => v.code)).not.toContain("PER_TRANSACTION_CAP_EXCEEDED");
  });

  it("accumulates same-day history toward the daily cap and rejects when exceeded", () => {
    const history: TransactionRecord[] = [
      txAt({ id: "tx-1", amountUsd: 900, createdAt: new Date("2026-09-25T08:00:00.000Z") }),
      txAt({ id: "tx-2", amountUsd: 900, createdAt: new Date("2026-09-25T10:00:00.000Z") }),
    ];

    const decision = evaluatePolicy({
      candidate: { payeeEmail: "alex@example.com", recipient: "client@example.com", amountUsd: 300, now: NOW },
      history,
      config: baseConfig,
    });

    expect(decision.dailyTotalUsd).toBe(2100);
    expect(decision.allowed).toBe(false);
    expect(decision.violations.map((v) => v.code)).toContain("DAILY_CAP_EXCEEDED");
  });

  it("excludes transactions outside the rolling daily window", () => {
    const history: TransactionRecord[] = [
      txAt({ id: "tx-old", amountUsd: 1900, createdAt: new Date("2026-09-24T11:00:00.000Z") }), // 25h before NOW
    ];

    const decision = evaluatePolicy({
      candidate: { payeeEmail: "alex@example.com", recipient: "client@example.com", amountUsd: 100, now: NOW },
      history,
      config: baseConfig,
    });

    expect(decision.dailyTotalUsd).toBe(100);
    expect(decision.allowed).toBe(true);
  });

  it("excludes cancelled and flagged transactions from the daily cap sum", () => {
    const history: TransactionRecord[] = [
      txAt({ id: "tx-cancelled", amountUsd: 1900, status: "cancelled" }),
      txAt({ id: "tx-flagged", amountUsd: 1900, status: "flagged" }),
    ];

    const decision = evaluatePolicy({
      candidate: { payeeEmail: "alex@example.com", recipient: "client@example.com", amountUsd: 100, now: NOW },
      history,
      config: baseConfig,
    });

    expect(decision.dailyTotalUsd).toBe(100);
    expect(decision.allowed).toBe(true);
  });

  it("only counts history belonging to the same payee", () => {
    const history: TransactionRecord[] = [
      txAt({ id: "tx-other-payee", payeeEmail: "someone-else@example.com", amountUsd: 1900 }),
    ];

    const decision = evaluatePolicy({
      candidate: { payeeEmail: "alex@example.com", recipient: "client@example.com", amountUsd: 100, now: NOW },
      history,
      config: baseConfig,
    });

    expect(decision.dailyTotalUsd).toBe(100);
    expect(decision.allowed).toBe(true);
  });

  it("is case-insensitive when matching payee emails across history", () => {
    const history: TransactionRecord[] = [
      txAt({ id: "tx-1", payeeEmail: "Alex@Example.com", amountUsd: 1900 }),
    ];

    const decision = evaluatePolicy({
      candidate: { payeeEmail: "alex@example.com", recipient: "client@example.com", amountUsd: 200, now: NOW },
      history,
      config: baseConfig,
    });

    expect(decision.dailyTotalUsd).toBe(2100);
    expect(decision.allowed).toBe(false);
  });

  it("flags blocked recipients regardless of amount", () => {
    const decision = evaluatePolicy({
      candidate: { payeeEmail: "alex@example.com", recipient: "bad-actor@example.com", amountUsd: 10, now: NOW },
      history: [],
      config: baseConfig,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.violations.map((v) => v.code)).toContain("BLOCKED_RECIPIENT");
  });

  it("matches blocklist entries case-insensitively and trims whitespace", () => {
    const decision = evaluatePolicy({
      candidate: { payeeEmail: "alex@example.com", recipient: "  BAD-ACTOR@EXAMPLE.COM  ", amountUsd: 10, now: NOW },
      history: [],
      config: baseConfig,
    });
    expect(decision.violations.map((v) => v.code)).toContain("BLOCKED_RECIPIENT");
  });

  it("requires second confirmation at or above the threshold, not below it", () => {
    const below = evaluatePolicy({
      candidate: { payeeEmail: "alex@example.com", recipient: "client@example.com", amountUsd: 499, now: NOW },
      history: [],
      config: baseConfig,
    });
    const atThreshold = evaluatePolicy({
      candidate: { payeeEmail: "alex@example.com", recipient: "client@example.com", amountUsd: 500, now: NOW },
      history: [],
      config: baseConfig,
    });

    expect(below.requiresSecondConfirmation).toBe(false);
    expect(atThreshold.requiresSecondConfirmation).toBe(true);
  });

  it("can report multiple simultaneous violations", () => {
    const history: TransactionRecord[] = [txAt({ amountUsd: 1999 })];

    const decision = evaluatePolicy({
      candidate: { payeeEmail: "alex@example.com", recipient: "bad-actor@example.com", amountUsd: 1500, now: NOW },
      history,
      config: baseConfig,
    });

    expect(decision.allowed).toBe(false);
    const codes = decision.violations.map((v) => v.code);
    expect(codes).toContain("PER_TRANSACTION_CAP_EXCEEDED");
    expect(codes).toContain("DAILY_CAP_EXCEEDED");
    expect(codes).toContain("BLOCKED_RECIPIENT");
  });

  it("respects a custom dailyCapWindowMs override", () => {
    const history: TransactionRecord[] = [
      txAt({ amountUsd: 1900, createdAt: new Date(NOW.getTime() - 30 * 60 * 1000) }), // 30 min ago
    ];
    const shortWindowConfig: PolicyConfig = { ...baseConfig, dailyCapWindowMs: 15 * 60 * 1000 }; // 15 min window

    const decision = evaluatePolicy({
      candidate: { payeeEmail: "alex@example.com", recipient: "client@example.com", amountUsd: 100, now: NOW },
      history,
      config: shortWindowConfig,
    });

    expect(decision.dailyTotalUsd).toBe(100); // old tx falls outside the 15-min window
    expect(decision.allowed).toBe(true);
  });

  it("is a pure function: identical inputs always produce identical output", () => {
    const params = {
      candidate: { payeeEmail: "alex@example.com", recipient: "client@example.com", amountUsd: 250, now: NOW },
      history: [txAt({ amountUsd: 100 })],
      config: baseConfig,
    };

    const first = evaluatePolicy(params);
    const second = evaluatePolicy(params);
    expect(first).toEqual(second);
  });
});
