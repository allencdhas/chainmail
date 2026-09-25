import type {
  PolicyCandidate,
  PolicyConfig,
  PolicyDecision,
  PolicyViolation,
  TransactionRecord,
} from "./types.js";

const DEFAULT_DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Statuses that count toward the daily cap — everything except cancelled/flagged. */
const CAP_COUNTING_STATUSES = new Set<TransactionRecord["status"]>([
  "pending",
  "settling",
  "settled",
]);

function normalizeIdentifier(value: string): string {
  return value.trim().toLowerCase();
}

function isBlocked(recipient: string, blockedRecipients: readonly string[]): boolean {
  const normalized = normalizeIdentifier(recipient);
  return blockedRecipients.some((blocked) => normalizeIdentifier(blocked) === normalized);
}

function sumRecentAmountsUsd(
  history: readonly TransactionRecord[],
  payeeEmail: string,
  now: Date,
  windowMs: number,
): number {
  const normalizedPayee = normalizeIdentifier(payeeEmail);
  const windowStart = now.getTime() - windowMs;

  return history.reduce((total, tx) => {
    if (normalizeIdentifier(tx.payeeEmail) !== normalizedPayee) return total;
    if (!CAP_COUNTING_STATUSES.has(tx.status)) return total;
    if (tx.createdAt.getTime() < windowStart || tx.createdAt.getTime() > now.getTime()) {
      return total;
    }
    return total + tx.amountUsd;
  }, 0);
}

/**
 * Evaluate a candidate transaction against deterministic policy rules.
 *
 * Must be called at proposal time (to decide whether to flag/confirm) AND
 * again at settlement time (immediately before moving funds), using
 * up-to-date history both times. A pass at proposal time is not a
 * settlement-time guarantee — new transactions may have landed in between.
 */
export function evaluatePolicy(params: {
  candidate: PolicyCandidate;
  history: readonly TransactionRecord[];
  config: PolicyConfig;
}): PolicyDecision {
  const { candidate, history, config } = params;
  const now = candidate.now ?? new Date();
  const windowMs = config.dailyCapWindowMs ?? DEFAULT_DAILY_WINDOW_MS;
  const violations: PolicyViolation[] = [];

  if (!Number.isFinite(candidate.amountUsd) || candidate.amountUsd <= 0) {
    violations.push({
      code: "INVALID_AMOUNT",
      message: `Amount must be a positive finite number, got ${candidate.amountUsd}.`,
    });
  }

  if (candidate.amountUsd > config.perTransactionCapUsd) {
    violations.push({
      code: "PER_TRANSACTION_CAP_EXCEEDED",
      message: `Amount $${candidate.amountUsd} exceeds per-transaction cap of $${config.perTransactionCapUsd}.`,
    });
  }

  const priorTotal = sumRecentAmountsUsd(history, candidate.payeeEmail, now, windowMs);
  const dailyTotalUsd = priorTotal + Math.max(candidate.amountUsd, 0);

  if (dailyTotalUsd > config.dailyCapUsd) {
    violations.push({
      code: "DAILY_CAP_EXCEEDED",
      message: `Cumulative amount $${dailyTotalUsd} exceeds daily cap of $${config.dailyCapUsd}.`,
    });
  }

  if (isBlocked(candidate.recipient, config.blockedRecipients)) {
    violations.push({
      code: "BLOCKED_RECIPIENT",
      message: `Recipient "${candidate.recipient}" is on the blocklist.`,
    });
  }

  return {
    allowed: violations.length === 0,
    requiresSecondConfirmation: candidate.amountUsd >= config.secondConfirmationThresholdUsd,
    violations,
    dailyTotalUsd,
  };
}
