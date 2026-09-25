/**
 * Policy / Guardrail Engine — deterministic rules layer sitting underneath the
 * LLM's proposal. Per PRD Security & Guardrails: the AI proposes, the policy
 * engine gates, the user's magic-link click (or payer's pay click) authorizes.
 *
 * This module must be called independently at BOTH proposal time and
 * settlement time — never trust the LLM's tool call as the actual gate, and
 * never trust that a proposal-time pass is still valid at settlement time.
 */

export interface PolicyConfig {
  /** Max USD value allowed in a single transaction. */
  readonly perTransactionCapUsd: number;
  /** Max cumulative USD value allowed per payee within the rolling daily window. */
  readonly dailyCapUsd: number;
  /** Transactions at or above this USD amount require an explicit second confirmation. */
  readonly secondConfirmationThresholdUsd: number;
  /**
   * Blocked recipient identifiers (emails and/or addresses). Compared
   * case-insensitively after trimming; addresses are also compared
   * checksum-insensitively via lowercasing.
   */
  readonly blockedRecipients: readonly string[];
  /** Rolling window (ms) used for the daily cap calculation. Defaults to 24h if omitted. */
  readonly dailyCapWindowMs?: number;
}

export type TransactionStatus =
  | "pending"
  | "settling"
  | "settled"
  | "flagged"
  | "cancelled";

export interface TransactionRecord {
  readonly id: string;
  readonly payeeEmail: string;
  readonly recipient: string;
  readonly amountUsd: number;
  readonly createdAt: Date;
  readonly status: TransactionStatus;
}

export interface PolicyCandidate {
  readonly payeeEmail: string;
  readonly recipient: string;
  readonly amountUsd: number;
  /** Injectable for deterministic testing; defaults to `new Date()`. */
  readonly now?: Date | undefined;
}

export type PolicyViolationCode =
  | "INVALID_AMOUNT"
  | "PER_TRANSACTION_CAP_EXCEEDED"
  | "DAILY_CAP_EXCEEDED"
  | "BLOCKED_RECIPIENT";

export interface PolicyViolation {
  readonly code: PolicyViolationCode;
  readonly message: string;
}

export interface PolicyDecision {
  /** True only when there are zero violations. */
  readonly allowed: boolean;
  /** True when the candidate's amount is at/above the second-confirmation threshold. */
  readonly requiresSecondConfirmation: boolean;
  readonly violations: readonly PolicyViolation[];
  /** Sum of counted prior transactions + candidate amount, for observability. */
  readonly dailyTotalUsd: number;
}
