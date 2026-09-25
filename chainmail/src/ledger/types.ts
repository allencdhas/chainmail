/**
 * The PRD's five inbox-visible transaction states (Transaction Lifecycle
 * table). Deliberately a separate type from `policy.TransactionStatus`:
 * that one exists purely for daily-cap accounting ("cancelled" matters,
 * "recurring" doesn't); this one drives folder/category sync and includes
 * "recurring" as a real, distinct inbox state per the PRD table.
 */
export type LedgerState = "pending_confirmation" | "settling" | "settled" | "flagged" | "recurring";

export interface LedgerEntry {
  readonly id: string;
  readonly recipient: string;
  readonly amountUsd: number;
  readonly state: LedgerState;
  readonly memo: string;
  readonly updatedAt: string;
}
