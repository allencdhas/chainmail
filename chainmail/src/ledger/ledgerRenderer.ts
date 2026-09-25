import type { LedgerEntry, LedgerState } from "./types.js";

/**
 * Renders the "always current, never stale" ledger view. Per the corrected
 * design (a pinned SENT email cannot be body-edited via Graph — only drafts
 * can), this is the body of a single persistent DRAFT message living in
 * ChainMail/Ledger, re-rendered from scratch and PATCHed in place on every
 * transaction state change. See `graphSync.ts` for the orchestration.
 */

export interface LedgerTotals {
  readonly settledUsd: number;
  /** pending_confirmation + settling, combined per the PRD's ledger description. */
  readonly pendingUsd: number;
  readonly flaggedUsd: number;
  readonly recurringUsd: number;
  readonly transactionCount: number;
}

const PENDING_STATES: ReadonlySet<LedgerState> = new Set(["pending_confirmation", "settling"]);

export function computeLedgerTotals(entries: readonly LedgerEntry[]): LedgerTotals {
  let settledUsd = 0;
  let pendingUsd = 0;
  let flaggedUsd = 0;
  let recurringUsd = 0;

  for (const entry of entries) {
    if (entry.state === "settled") {
      settledUsd += entry.amountUsd;
    } else if (PENDING_STATES.has(entry.state)) {
      pendingUsd += entry.amountUsd;
    } else if (entry.state === "flagged") {
      flaggedUsd += entry.amountUsd;
    } else if (entry.state === "recurring") {
      recurringUsd += entry.amountUsd;
    }
  }

  return { settledUsd, pendingUsd, flaggedUsd, recurringUsd, transactionCount: entries.length };
}

const STATE_LABELS: Readonly<Record<LedgerState, string>> = {
  pending_confirmation: "Pending Confirmation",
  settling: "Settling",
  settled: "Settled",
  flagged: "Flagged",
  recurring: "Recurring",
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatUsd(amountUsd: number): string {
  return `$${amountUsd.toFixed(2)}`;
}

function sortByMostRecentFirst(entries: readonly LedgerEntry[]): readonly LedgerEntry[] {
  return [...entries].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

/** Renders the full ledger draft body as HTML. All user-supplied fields are HTML-escaped. */
export function renderLedgerBodyHtml(entries: readonly LedgerEntry[], now: Date = new Date()): string {
  const totals = computeLedgerTotals(entries);
  const sorted = sortByMostRecentFirst(entries);

  const rowsHtml =
    sorted.length === 0
      ? `<tr><td colspan="5">No transactions yet.</td></tr>`
      : sorted
          .map(
            (entry) => `<tr>
      <td>${escapeHtml(STATE_LABELS[entry.state])}</td>
      <td>${escapeHtml(entry.recipient)}</td>
      <td>${formatUsd(entry.amountUsd)}</td>
      <td>${escapeHtml(entry.memo)}</td>
      <td>${escapeHtml(entry.updatedAt)}</td>
    </tr>`,
          )
          .join("\n");

  return `<h2>ChainMail Ledger</h2>
<p>Last updated: ${escapeHtml(now.toISOString())}</p>
<table border="1" cellpadding="4" cellspacing="0">
  <thead>
    <tr><th>Status</th><th>Recipient</th><th>Amount</th><th>Memo</th><th>Updated</th></tr>
  </thead>
  <tbody>
${rowsHtml}
  </tbody>
</table>
<h3>Totals</h3>
<ul>
  <li>Settled: ${formatUsd(totals.settledUsd)}</li>
  <li>Pending (awaiting confirmation or settling): ${formatUsd(totals.pendingUsd)}</li>
  <li>Flagged: ${formatUsd(totals.flaggedUsd)}</li>
  <li>Recurring: ${formatUsd(totals.recurringUsd)}</li>
  <li>Total transactions: ${totals.transactionCount}</li>
</ul>`;
}
