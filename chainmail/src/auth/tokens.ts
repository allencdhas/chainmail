import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";

/**
 * Authenticated magic-link / payment-token issuance and verification, per
 * the PRD's Security & Guardrails section: "the user authorizes execution
 * via an authenticated magic link, never by trusting the plain text of an
 * email reply." Two distinct, non-interchangeable purposes, matching the
 * corrected transaction flow:
 *
 *   1. `confirm_invoice` — the Payee's link, confirming the AI's parsed
 *      proposal so the invoice is sent to the Payer. Does NOT move funds.
 *   2. `authorize_payment` — the Payer's separate one-time link (the "Pay"
 *      click), which is what actually triggers settlement. A
 *      `confirm_invoice` token can never be used where an
 *      `authorize_payment` token is required, or vice versa — the `purpose`
 *      claim is checked explicitly, not inferred from context.
 *
 * Tokens use explicit numeric `iat`/`exp` claims computed from an injectable
 * `now`, and verification uses jsonwebtoken's `clockTimestamp` option to
 * evaluate expiry against that same `now` — this makes every expiry edge
 * case exactly reproducible in tests without fake timers.
 */

const DEFAULT_TTL_SECONDS = {
  confirm_invoice: 15 * 60,
  authorize_payment: 24 * 60 * 60,
} as const;

function toUnixSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

export class TokenPurposeMismatchError extends Error {
  constructor(
    public readonly expected: string,
    public readonly actual: string,
  ) {
    super(`Expected a token with purpose "${expected}", got "${actual}".`);
    this.name = "TokenPurposeMismatchError";
  }
}

function signToken(payload: Record<string, unknown>, secret: string): string {
  return jwt.sign(payload, secret, { algorithm: "HS256" });
}

function verifyRawToken(token: string, secret: string, now: Date): jwt.JwtPayload {
  const decoded = jwt.verify(token, secret, {
    algorithms: ["HS256"],
    clockTimestamp: toUnixSeconds(now),
  });
  if (typeof decoded === "string") {
    throw new Error("Malformed token: expected a JSON payload, got a string.");
  }
  return decoded;
}

// --- confirm_invoice ---------------------------------------------------

export interface ConfirmInvoiceTokenPayload {
  readonly purpose: "confirm_invoice";
  readonly transactionId: string;
  readonly jti: string;
}

export function issueConfirmInvoiceToken(params: {
  readonly transactionId: string;
  readonly secret: string;
  readonly now?: Date;
  readonly ttlSeconds?: number;
  readonly jti?: string;
}): string {
  const now = params.now ?? new Date();
  const iat = toUnixSeconds(now);
  const ttlSeconds = params.ttlSeconds ?? DEFAULT_TTL_SECONDS.confirm_invoice;

  return signToken(
    {
      purpose: "confirm_invoice",
      transactionId: params.transactionId,
      jti: params.jti ?? randomUUID(),
      iat,
      exp: iat + ttlSeconds,
    },
    params.secret,
  );
}

export function verifyConfirmInvoiceToken(
  token: string,
  params: { readonly secret: string; readonly now?: Date },
): ConfirmInvoiceTokenPayload {
  const now = params.now ?? new Date();
  const decoded = verifyRawToken(token, params.secret, now);

  if (decoded["purpose"] !== "confirm_invoice") {
    throw new TokenPurposeMismatchError("confirm_invoice", String(decoded["purpose"]));
  }

  return {
    purpose: "confirm_invoice",
    transactionId: String(decoded["transactionId"]),
    jti: String(decoded["jti"]),
  };
}

// --- authorize_payment ----------------------------------------------------

export interface AuthorizePaymentTokenPayload {
  readonly purpose: "authorize_payment";
  readonly transactionId: string;
  /** Bound at issue time so a mismatch against current invoice data is detectable downstream. */
  readonly recipient: string;
  readonly amountUsd: number;
  readonly jti: string;
}

export function issueAuthorizePaymentToken(params: {
  readonly transactionId: string;
  readonly recipient: string;
  readonly amountUsd: number;
  readonly secret: string;
  readonly now?: Date;
  readonly ttlSeconds?: number;
  readonly jti?: string;
}): string {
  const now = params.now ?? new Date();
  const iat = toUnixSeconds(now);
  const ttlSeconds = params.ttlSeconds ?? DEFAULT_TTL_SECONDS.authorize_payment;

  return signToken(
    {
      purpose: "authorize_payment",
      transactionId: params.transactionId,
      recipient: params.recipient,
      amountUsd: params.amountUsd,
      jti: params.jti ?? randomUUID(),
      iat,
      exp: iat + ttlSeconds,
    },
    params.secret,
  );
}

export function verifyAuthorizePaymentToken(
  token: string,
  params: { readonly secret: string; readonly now?: Date },
): AuthorizePaymentTokenPayload {
  const now = params.now ?? new Date();
  const decoded = verifyRawToken(token, params.secret, now);

  if (decoded["purpose"] !== "authorize_payment") {
    throw new TokenPurposeMismatchError("authorize_payment", String(decoded["purpose"]));
  }

  return {
    purpose: "authorize_payment",
    transactionId: String(decoded["transactionId"]),
    recipient: String(decoded["recipient"]),
    amountUsd: Number(decoded["amountUsd"]),
    jti: String(decoded["jti"]),
  };
}

// --- single-use consumption --------------------------------------------

export class TokenAlreadyConsumedError extends Error {
  constructor(public readonly jti: string) {
    super(`Token "${jti}" has already been consumed.`);
    this.name = "TokenAlreadyConsumedError";
  }
}

/**
 * Tracks which token ids (`jti`) have been used. In-memory implementation
 * is adequate for a single-process hackathon deploy; does NOT survive
 * restarts and provides no cross-instance atomicity. A real deployment
 * needs a DB row with a unique constraint on `jti` (insert-or-fail) to
 * actually guarantee single-use under concurrent requests.
 */
export interface ConsumedTokenStore {
  hasBeenConsumed(jti: string): boolean;
  markConsumed(jti: string): void;
}

export class InMemoryConsumedTokenStore implements ConsumedTokenStore {
  private readonly consumed = new Set<string>();

  hasBeenConsumed(jti: string): boolean {
    return this.consumed.has(jti);
  }

  markConsumed(jti: string): void {
    this.consumed.add(jti);
  }
}

function consumeToken(store: ConsumedTokenStore, jti: string): void {
  if (store.hasBeenConsumed(jti)) {
    throw new TokenAlreadyConsumedError(jti);
  }
  store.markConsumed(jti);
}

/** Recommended entry point for the confirm-invoice route: verifies AND consumes in one call, so it can't be forgotten. */
export function verifyAndConsumeConfirmInvoiceToken(
  token: string,
  params: { readonly secret: string; readonly now?: Date },
  store: ConsumedTokenStore,
): ConfirmInvoiceTokenPayload {
  const payload = verifyConfirmInvoiceToken(token, params);
  consumeToken(store, payload.jti);
  return payload;
}

/** Recommended entry point for the pay-click route: verifies AND consumes in one call. This is the "atomically consumes the token" step in the corrected settlement flow. */
export function verifyAndConsumeAuthorizePaymentToken(
  token: string,
  params: { readonly secret: string; readonly now?: Date },
  store: ConsumedTokenStore,
): AuthorizePaymentTokenPayload {
  const payload = verifyAuthorizePaymentToken(token, params);
  consumeToken(store, payload.jti);
  return payload;
}
