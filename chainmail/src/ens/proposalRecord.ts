import { dnsEncodeName } from "./nameEncoding.js";

/**
 * The agent's delegated ENS identity gets exactly ONE real, narrowly-scoped
 * permission: the right to write the `chainmail.proposal` text record on
 * its own subname's resolver, via ENSv2 Enhanced Access Control's
 * `authorizeTextRoles(toName, key, account, grant)` (ROLE_SET_TEXT, scoped
 * to this one text key only — not a name-level grant).
 *
 * This is deliberately NOT a spending-limit enforcement mechanism. ENS has
 * no relationship to USDC transfers, and a raw ERC-20 transfer never
 * consults it. What this DOES give the demo, honestly: the agent's subname
 * can provably only ever write this one record — an on-chain, auditable
 * "the agent proposed X, and is not permitted to touch anything else on its
 * own identity" story. The actual spending gate is the deterministic policy
 * engine (see policy/engine.ts) plus the magic-link / pay-click
 * authorizations, exactly as documented in the PRD's Security & Guardrails
 * section.
 */

export const PROPOSAL_TEXT_KEY = "chainmail.proposal";

export interface ProposalRecordValue {
  readonly canPropose: true;
  readonly canExecuteAboveThreshold: false;
  readonly secondConfirmationThresholdUsd: number;
  readonly updatedAt: string;
}

export function buildProposalRecordValue(params: {
  readonly secondConfirmationThresholdUsd: number;
  readonly now?: Date;
}): ProposalRecordValue {
  const { secondConfirmationThresholdUsd } = params;
  if (!Number.isFinite(secondConfirmationThresholdUsd) || secondConfirmationThresholdUsd <= 0) {
    throw new Error(
      `secondConfirmationThresholdUsd must be a positive finite number, got ${secondConfirmationThresholdUsd}.`,
    );
  }

  return {
    canPropose: true,
    canExecuteAboveThreshold: false,
    secondConfirmationThresholdUsd,
    updatedAt: (params.now ?? new Date()).toISOString(),
  };
}

export function serializeProposalRecordValue(value: ProposalRecordValue): string {
  return JSON.stringify(value);
}

export function parseProposalRecordValue(raw: string): ProposalRecordValue {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`"${PROPOSAL_TEXT_KEY}" record value is not valid JSON: ${raw}`);
  }

  if (!isProposalRecordShape(parsed)) {
    throw new Error(`"${PROPOSAL_TEXT_KEY}" record value has an unexpected shape: ${raw}`);
  }

  return parsed;
}

function isProposalRecordShape(value: unknown): value is ProposalRecordValue {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate["canPropose"] === true &&
    candidate["canExecuteAboveThreshold"] === false &&
    typeof candidate["secondConfirmationThresholdUsd"] === "number" &&
    typeof candidate["updatedAt"] === "string"
  );
}

export interface AuthorizeProposalTextRoleRequest {
  readonly toName: `0x${string}`;
  readonly key: string;
  readonly account: `0x${string}`;
  readonly grant: boolean;
}

/**
 * Builds the argument tuple for the resolver's
 * `authorizeTextRoles(toName, key, account, grant)` call — pure, so it can
 * be unit tested without touching a real resolver. `client.ts` is
 * responsible for actually sending this as a transaction.
 */
export function buildAuthorizeProposalTextRoleRequest(params: {
  readonly agentSubname: string;
  readonly agentAddress: `0x${string}`;
  readonly grant?: boolean;
}): AuthorizeProposalTextRoleRequest {
  return {
    toName: dnsEncodeName(params.agentSubname),
    key: PROPOSAL_TEXT_KEY,
    account: params.agentAddress,
    grant: params.grant ?? true,
  };
}
