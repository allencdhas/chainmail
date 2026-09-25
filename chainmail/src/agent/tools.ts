import { randomUUID } from "node:crypto";
import { z } from "zod";
import { evaluatePolicy } from "../policy/engine.js";
import type { PolicyConfig, PolicyDecision, TransactionRecord } from "../policy/types.js";
import type { ToolDefinition } from "./types.js";

/**
 * Tool implementations for the agent loop: `check_duplicate` and
 * `check_policy_limits` are read-only observations the LLM uses to decide
 * whether to flag or continue; `create_invoice` composes the structured
 * proposal. None of these are the actual money-moving gate — per the PRD's
 * Security & Guardrails section, `check_policy_limits` here is advisory to
 * the LLM's own reasoning. The authoritative policy check happens again,
 * independently, at settlement time via `policy/engine.ts` directly (never
 * trust the LLM's tool call as the real gate).
 */

// --- check_duplicate ---------------------------------------------------

const DEFAULT_DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;
const DEFAULT_AMOUNT_TOLERANCE_PCT = 0.05;

export const checkDuplicateInputSchema = z.object({
  recipient: z.string().min(1),
  amountUsd: z.number().positive(),
});
export type CheckDuplicateInput = z.infer<typeof checkDuplicateInputSchema>;

export interface DuplicateMatch {
  readonly transactionId: string;
  readonly recipient: string;
  readonly amountUsd: number;
  readonly createdAt: string;
}

export interface DuplicateCheckResult {
  readonly isDuplicate: boolean;
  readonly matches: readonly DuplicateMatch[];
}

const NON_DUPLICATE_STATUSES = new Set<TransactionRecord["status"]>(["cancelled"]);

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Flags likely duplicate/fraudulent requests: same payee, same or similar
 * (within `amountTolerancePct`) recipient + amount, within a short recent
 * window. Matches the PRD's stated attack model (business email compromise
 * / accidental re-billing), not exact-match-only detection.
 */
export function checkForDuplicates(params: {
  readonly candidate: { readonly payeeEmail: string; readonly recipient: string; readonly amountUsd: number };
  readonly history: readonly TransactionRecord[];
  readonly now?: Date | undefined;
  readonly windowMs?: number;
  readonly amountTolerancePct?: number;
}): DuplicateCheckResult {
  const now = params.now ?? new Date();
  const windowMs = params.windowMs ?? DEFAULT_DUPLICATE_WINDOW_MS;
  const tolerancePct = params.amountTolerancePct ?? DEFAULT_AMOUNT_TOLERANCE_PCT;
  const windowStart = now.getTime() - windowMs;

  const normalizedPayee = normalize(params.candidate.payeeEmail);
  const normalizedRecipient = normalize(params.candidate.recipient);

  const matches = params.history.filter((tx) => {
    if (NON_DUPLICATE_STATUSES.has(tx.status)) return false;
    if (normalize(tx.payeeEmail) !== normalizedPayee) return false;
    if (normalize(tx.recipient) !== normalizedRecipient) return false;

    const createdAtMs = tx.createdAt.getTime();
    if (createdAtMs < windowStart || createdAtMs > now.getTime()) return false;

    const amountDiff = Math.abs(tx.amountUsd - params.candidate.amountUsd);
    const allowedDiff = params.candidate.amountUsd * tolerancePct;
    return amountDiff <= allowedDiff;
  });

  return {
    isDuplicate: matches.length > 0,
    matches: matches.map((tx) => ({
      transactionId: tx.id,
      recipient: tx.recipient,
      amountUsd: tx.amountUsd,
      createdAt: tx.createdAt.toISOString(),
    })),
  };
}

// --- check_policy_limits -------------------------------------------------

export const checkPolicyLimitsInputSchema = z.object({
  recipient: z.string().min(1),
  amountUsd: z.number().positive(),
});
export type CheckPolicyLimitsInput = z.infer<typeof checkPolicyLimitsInputSchema>;

// --- create_invoice -------------------------------------------------------

export const createInvoiceInputSchema = z.object({
  recipient: z.string().min(1),
  amountUsd: z.number().positive(),
  memo: z.string().min(1).max(500),
});
export type CreateInvoiceInput = z.infer<typeof createInvoiceInputSchema>;

export interface InvoiceDraft {
  readonly id: string;
  readonly payeeEmail: string;
  readonly recipient: string;
  readonly amountUsd: number;
  readonly memo: string;
  readonly createdAt: string;
}

export function createInvoiceDraft(params: {
  readonly payeeEmail: string;
  readonly recipient: string;
  readonly amountUsd: number;
  readonly memo: string;
  readonly now?: Date | undefined;
  readonly idGenerator?: () => string;
}): InvoiceDraft {
  const idGenerator = params.idGenerator ?? randomUUID;
  return {
    id: idGenerator(),
    payeeEmail: params.payeeEmail,
    recipient: params.recipient,
    amountUsd: params.amountUsd,
    memo: params.memo,
    createdAt: (params.now ?? new Date()).toISOString(),
  };
}

// --- tool definitions (JSON Schema for the LLM API) ------------------------

export const AGENT_TOOLS: readonly ToolDefinition[] = [
  {
    name: "check_duplicate",
    description:
      "Check whether a similar payment request to this recipient/amount was made recently, " +
      "to catch duplicate billing or spoofed/business-email-compromise requests before confirming.",
    inputSchema: {
      type: "object",
      properties: {
        recipient: { type: "string", description: "The payer's email address." },
        amountUsd: { type: "number", description: "The requested amount in USD." },
      },
      required: ["recipient", "amountUsd"],
    },
  },
  {
    name: "check_policy_limits",
    description:
      "Read-only check of this candidate payment against the deterministic policy engine " +
      "(per-transaction cap, daily cap, second-confirmation threshold, blocklist). Advisory only " +
      "— the authoritative check happens again independently before settlement.",
    inputSchema: {
      type: "object",
      properties: {
        recipient: { type: "string", description: "The payer's email address." },
        amountUsd: { type: "number", description: "The requested amount in USD." },
      },
      required: ["recipient", "amountUsd"],
    },
  },
  {
    name: "create_invoice",
    description:
      "Compose the structured invoice proposal once duplicate and policy checks are satisfactory. " +
      "This does not send anything or move funds — it only produces the draft used in the " +
      "plain-language confirmation email to the Payee.",
    inputSchema: {
      type: "object",
      properties: {
        recipient: { type: "string", description: "The payer's email address." },
        amountUsd: { type: "number", description: "The invoice amount in USD." },
        memo: { type: "string", description: "A short plain-language description of the work/reason." },
      },
      required: ["recipient", "amountUsd", "memo"],
    },
  },
] as const;

// --- handler wiring ----------------------------------------------------

export interface ToolHandlerContext {
  readonly payeeEmail: string;
  readonly history: readonly TransactionRecord[];
  readonly policyConfig: PolicyConfig;
  readonly now?: Date | undefined;
}

export interface ToolHandlerResult {
  readonly content: string;
  readonly isError: boolean;
}

export type ToolHandler = (input: unknown, ctx: ToolHandlerContext) => ToolHandlerResult;

function jsonOk(value: unknown): ToolHandlerResult {
  return { content: JSON.stringify(value), isError: false };
}

function jsonError(message: string): ToolHandlerResult {
  return { content: JSON.stringify({ error: message }), isError: true };
}

export function buildToolHandlers(): Record<string, ToolHandler> {
  return {
    check_duplicate: (input, ctx) => {
      const parsed = checkDuplicateInputSchema.safeParse(input);
      if (!parsed.success) return jsonError(parsed.error.message);

      const result = checkForDuplicates({
        candidate: {
          payeeEmail: ctx.payeeEmail,
          recipient: parsed.data.recipient,
          amountUsd: parsed.data.amountUsd,
        },
        history: ctx.history,
        now: ctx.now,
      });
      return jsonOk(result);
    },

    check_policy_limits: (input, ctx) => {
      const parsed = checkPolicyLimitsInputSchema.safeParse(input);
      if (!parsed.success) return jsonError(parsed.error.message);

      const decision: PolicyDecision = evaluatePolicy({
        candidate: {
          payeeEmail: ctx.payeeEmail,
          recipient: parsed.data.recipient,
          amountUsd: parsed.data.amountUsd,
          now: ctx.now,
        },
        history: ctx.history,
        config: ctx.policyConfig,
      });
      return jsonOk(decision);
    },

    create_invoice: (input, ctx) => {
      const parsed = createInvoiceInputSchema.safeParse(input);
      if (!parsed.success) return jsonError(parsed.error.message);

      const draft = createInvoiceDraft({
        payeeEmail: ctx.payeeEmail,
        recipient: parsed.data.recipient,
        amountUsd: parsed.data.amountUsd,
        memo: parsed.data.memo,
        now: ctx.now,
      });
      return jsonOk(draft);
    },
  };
}
