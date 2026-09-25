import { evaluatePolicy } from "../policy/engine.js";
import type { PolicyConfig, PolicyDecision, TransactionRecord } from "../policy/types.js";

/**
 * The authoritative, settlement-time policy gate — independent from
 * whatever check the agent loop or confirmation step already ran. Per the
 * PRD, a proposal-time pass is never trusted as a settlement-time
 * guarantee, since other transactions may have landed in the meantime
 * (e.g. a daily cap that had headroom at proposal time may not by the time
 * the Payer actually clicks Pay, possibly hours or days later thanks to the
 * authorize_payment token's longer TTL).
 *
 * Call this immediately before transferring funds — never rely on the
 * agent loop's advisory `check_policy_limits` tool call, and never rely on
 * a policy check performed at confirm-invoice time either.
 */

export interface SettlementCandidate {
  readonly payeeEmail: string;
  readonly recipient: string;
  readonly amountUsd: number;
}

export interface SettlementDecision {
  readonly approved: boolean;
  readonly policyDecision: PolicyDecision;
}

export function evaluateSettlement(params: {
  readonly candidate: SettlementCandidate;
  readonly history: readonly TransactionRecord[];
  readonly config: PolicyConfig;
  readonly now?: Date;
}): SettlementDecision {
  const policyDecision = evaluatePolicy({
    candidate: {
      payeeEmail: params.candidate.payeeEmail,
      recipient: params.candidate.recipient,
      amountUsd: params.candidate.amountUsd,
      now: params.now,
    },
    history: params.history,
    config: params.config,
  });

  return { approved: policyDecision.allowed, policyDecision };
}
