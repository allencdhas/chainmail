import { describe, expect, it } from "vitest";
import { computeLedgerTotals, renderLedgerBodyHtml } from "../../src/ledger/ledgerRenderer.js";
import type { LedgerEntry } from "../../src/ledger/types.js";

const NOW = new Date("2026-09-25T12:00:00.000Z");

function entry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: overrides.id ?? "tx-1",
    recipient: overrides.recipient ?? "client@example.com",
    amountUsd: overrides.amountUsd ?? 100,
    state: overrides.state ?? "settled",
    memo: overrides.memo ?? "logo work",
    updatedAt: overrides.updatedAt ?? NOW.toISOString(),
  };
}

describe("computeLedgerTotals", () => {
  it("returns all zeros for an empty ledger", () => {
    const totals = computeLedgerTotals([]);
    expect(totals).toEqual({
      settledUsd: 0,
      pendingUsd: 0,
      flaggedUsd: 0,
      recurringUsd: 0,
      transactionCount: 0,
    });
  });

  it("sums settled amounts separately", () => {
    const totals = computeLedgerTotals([
      entry({ state: "settled", amountUsd: 100 }),
      entry({ state: "settled", amountUsd: 50 }),
    ]);
    expect(totals.settledUsd).toBe(150);
  });

  it("combines pending_confirmation and settling into pendingUsd", () => {
    const totals = computeLedgerTotals([
      entry({ state: "pending_confirmation", amountUsd: 100 }),
      entry({ state: "settling", amountUsd: 200 }),
    ]);
    expect(totals.pendingUsd).toBe(300);
  });

  it("sums flagged and recurring amounts separately", () => {
    const totals = computeLedgerTotals([
      entry({ state: "flagged", amountUsd: 40 }),
      entry({ state: "recurring", amountUsd: 60 }),
    ]);
    expect(totals.flaggedUsd).toBe(40);
    expect(totals.recurringUsd).toBe(60);
  });

  it("counts every entry regardless of state", () => {
    const totals = computeLedgerTotals([
      entry({ state: "settled" }),
      entry({ state: "flagged" }),
      entry({ state: "recurring" }),
    ]);
    expect(totals.transactionCount).toBe(3);
  });
});

describe("renderLedgerBodyHtml", () => {
  it("renders a placeholder row when there are no transactions", () => {
    const html = renderLedgerBodyHtml([], NOW);
    expect(html).toContain("No transactions yet.");
  });

  it("includes each entry's recipient, amount, memo, and state label", () => {
    const html = renderLedgerBodyHtml(
      [entry({ recipient: "client@example.com", amountUsd: 500, memo: "logo work", state: "settled" })],
      NOW,
    );
    expect(html).toContain("client@example.com");
    expect(html).toContain("$500.00");
    expect(html).toContain("logo work");
    expect(html).toContain("Settled");
  });

  it("HTML-escapes recipient and memo fields to prevent injection", () => {
    const html = renderLedgerBodyHtml(
      [entry({ recipient: "a@x.com", memo: "<script>alert(1)</script>" })],
      NOW,
    );
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("sorts entries most-recently-updated first", () => {
    const html = renderLedgerBodyHtml(
      [
        entry({ id: "old", recipient: "old@x.com", updatedAt: new Date(NOW.getTime() - 60_000).toISOString() }),
        entry({ id: "new", recipient: "new@x.com", updatedAt: NOW.toISOString() }),
      ],
      NOW,
    );
    expect(html.indexOf("new@x.com")).toBeLessThan(html.indexOf("old@x.com"));
  });

  it("includes computed totals in the rendered output", () => {
    const html = renderLedgerBodyHtml(
      [entry({ state: "settled", amountUsd: 250 }), entry({ state: "flagged", amountUsd: 75 })],
      NOW,
    );
    expect(html).toContain("$250.00");
    expect(html).toContain("$75.00");
    expect(html).toContain("Total transactions: 2");
  });

  it("stamps the provided 'now' as the last-updated time", () => {
    const html = renderLedgerBodyHtml([], NOW);
    expect(html).toContain(NOW.toISOString());
  });

  it("defaults 'now' to the current time when omitted", () => {
    const before = Date.now();
    const html = renderLedgerBodyHtml([]);
    const after = Date.now();
    const match = html.match(/Last updated: ([\d\-T:.Z]+)/);
    expect(match).not.toBeNull();
    const stamped = new Date(match![1]!).getTime();
    expect(stamped).toBeGreaterThanOrEqual(before);
    expect(stamped).toBeLessThanOrEqual(after);
  });
});
