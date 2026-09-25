import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import {
  InMemoryConsumedTokenStore,
  TokenAlreadyConsumedError,
  TokenPurposeMismatchError,
  issueAuthorizePaymentToken,
  issueConfirmInvoiceToken,
  verifyAndConsumeAuthorizePaymentToken,
  verifyAndConsumeConfirmInvoiceToken,
  verifyAuthorizePaymentToken,
  verifyConfirmInvoiceToken,
} from "../../src/auth/tokens.js";

const SECRET = "a-jwt-signing-secret-at-least-32-chars-long";
const NOW = new Date("2026-09-25T12:00:00.000Z");

describe("issueConfirmInvoiceToken / verifyConfirmInvoiceToken", () => {
  it("round-trips a valid token", () => {
    const token = issueConfirmInvoiceToken({ transactionId: "tx-1", secret: SECRET, now: NOW });
    const payload = verifyConfirmInvoiceToken(token, { secret: SECRET, now: NOW });
    expect(payload.purpose).toBe("confirm_invoice");
    expect(payload.transactionId).toBe("tx-1");
    expect(typeof payload.jti).toBe("string");
    expect(payload.jti.length).toBeGreaterThan(0);
  });

  it("generates a distinct jti per issuance by default", () => {
    const a = issueConfirmInvoiceToken({ transactionId: "tx-1", secret: SECRET, now: NOW });
    const b = issueConfirmInvoiceToken({ transactionId: "tx-1", secret: SECRET, now: NOW });
    const payloadA = verifyConfirmInvoiceToken(a, { secret: SECRET, now: NOW });
    const payloadB = verifyConfirmInvoiceToken(b, { secret: SECRET, now: NOW });
    expect(payloadA.jti).not.toBe(payloadB.jti);
  });

  it("accepts an explicit jti override", () => {
    const token = issueConfirmInvoiceToken({ transactionId: "tx-1", secret: SECRET, now: NOW, jti: "fixed-jti" });
    const payload = verifyConfirmInvoiceToken(token, { secret: SECRET, now: NOW });
    expect(payload.jti).toBe("fixed-jti");
  });

  it("is valid just before expiry and rejected just after (default 15 min TTL)", () => {
    const token = issueConfirmInvoiceToken({ transactionId: "tx-1", secret: SECRET, now: NOW });

    const justBefore = new Date(NOW.getTime() + 15 * 60 * 1000 - 1000);
    expect(() => verifyConfirmInvoiceToken(token, { secret: SECRET, now: justBefore })).not.toThrow();

    const justAfter = new Date(NOW.getTime() + 15 * 60 * 1000 + 1000);
    expect(() => verifyConfirmInvoiceToken(token, { secret: SECRET, now: justAfter })).toThrow(jwt.TokenExpiredError);
  });

  it("respects a custom ttlSeconds", () => {
    const token = issueConfirmInvoiceToken({ transactionId: "tx-1", secret: SECRET, now: NOW, ttlSeconds: 60 });
    const after61s = new Date(NOW.getTime() + 61_000);
    expect(() => verifyConfirmInvoiceToken(token, { secret: SECRET, now: after61s })).toThrow(jwt.TokenExpiredError);
  });

  it("rejects a token signed with a different secret", () => {
    const token = issueConfirmInvoiceToken({ transactionId: "tx-1", secret: SECRET, now: NOW });
    expect(() => verifyConfirmInvoiceToken(token, { secret: "a-completely-different-secret-32ch", now: NOW })).toThrow(
      jwt.JsonWebTokenError,
    );
  });

  it("rejects an authorize_payment token presented as confirm_invoice (purpose isolation)", () => {
    const paymentToken = issueAuthorizePaymentToken({
      transactionId: "tx-1",
      recipient: "client@example.com",
      amountUsd: 500,
      secret: SECRET,
      now: NOW,
    });
    expect(() => verifyConfirmInvoiceToken(paymentToken, { secret: SECRET, now: NOW })).toThrow(
      TokenPurposeMismatchError,
    );
  });

  it("rejects a malformed/garbage token", () => {
    expect(() => verifyConfirmInvoiceToken("not-a-real-token", { secret: SECRET, now: NOW })).toThrow(
      jwt.JsonWebTokenError,
    );
  });

  it("rejects a validly-signed token whose payload is a bare string, not an object", () => {
    const stringPayloadToken = jwt.sign("just a string, not our payload shape", SECRET, { algorithm: "HS256" });
    expect(() => verifyConfirmInvoiceToken(stringPayloadToken, { secret: SECRET, now: NOW })).toThrow(
      /expected a JSON payload/,
    );
  });
});

describe("issueAuthorizePaymentToken / verifyAuthorizePaymentToken", () => {
  it("round-trips a valid token with recipient and amount bound", () => {
    const token = issueAuthorizePaymentToken({
      transactionId: "tx-1",
      recipient: "client@example.com",
      amountUsd: 500,
      secret: SECRET,
      now: NOW,
    });
    const payload = verifyAuthorizePaymentToken(token, { secret: SECRET, now: NOW });
    expect(payload).toMatchObject({
      purpose: "authorize_payment",
      transactionId: "tx-1",
      recipient: "client@example.com",
      amountUsd: 500,
    });
  });

  it("defaults to a 24h TTL, distinct from confirm_invoice's 15 min", () => {
    const token = issueAuthorizePaymentToken({
      transactionId: "tx-1",
      recipient: "client@example.com",
      amountUsd: 500,
      secret: SECRET,
      now: NOW,
    });
    const after20h = new Date(NOW.getTime() + 20 * 60 * 60 * 1000);
    expect(() => verifyAuthorizePaymentToken(token, { secret: SECRET, now: after20h })).not.toThrow();

    const after25h = new Date(NOW.getTime() + 25 * 60 * 60 * 1000);
    expect(() => verifyAuthorizePaymentToken(token, { secret: SECRET, now: after25h })).toThrow(jwt.TokenExpiredError);
  });

  it("rejects a confirm_invoice token presented as authorize_payment (purpose isolation)", () => {
    const confirmToken = issueConfirmInvoiceToken({ transactionId: "tx-1", secret: SECRET, now: NOW });
    expect(() => verifyAuthorizePaymentToken(confirmToken, { secret: SECRET, now: NOW })).toThrow(
      TokenPurposeMismatchError,
    );
  });
});

describe("InMemoryConsumedTokenStore", () => {
  it("is not consumed before markConsumed, and is after", () => {
    const store = new InMemoryConsumedTokenStore();
    expect(store.hasBeenConsumed("jti-1")).toBe(false);
    store.markConsumed("jti-1");
    expect(store.hasBeenConsumed("jti-1")).toBe(true);
  });
});

describe("verifyAndConsumeConfirmInvoiceToken", () => {
  it("succeeds on first use", () => {
    const store = new InMemoryConsumedTokenStore();
    const token = issueConfirmInvoiceToken({ transactionId: "tx-1", secret: SECRET, now: NOW });
    const payload = verifyAndConsumeConfirmInvoiceToken(token, { secret: SECRET, now: NOW }, store);
    expect(payload.transactionId).toBe("tx-1");
  });

  it("throws TokenAlreadyConsumedError on a second use of the same token (replay protection)", () => {
    const store = new InMemoryConsumedTokenStore();
    const token = issueConfirmInvoiceToken({ transactionId: "tx-1", secret: SECRET, now: NOW });
    verifyAndConsumeConfirmInvoiceToken(token, { secret: SECRET, now: NOW }, store);
    expect(() => verifyAndConsumeConfirmInvoiceToken(token, { secret: SECRET, now: NOW }, store)).toThrow(
      TokenAlreadyConsumedError,
    );
  });

  it("does not mark the token consumed if verification fails first (expired token)", () => {
    const store = new InMemoryConsumedTokenStore();
    const token = issueConfirmInvoiceToken({ transactionId: "tx-1", secret: SECRET, now: NOW, ttlSeconds: 1 });
    const later = new Date(NOW.getTime() + 5000);
    expect(() => verifyAndConsumeConfirmInvoiceToken(token, { secret: SECRET, now: later }, store)).toThrow(
      jwt.TokenExpiredError,
    );
    // Store should remain empty since the token never got past verification.
    const payload = jwt.decode(token) as { jti: string };
    expect(store.hasBeenConsumed(payload.jti)).toBe(false);
  });
});

describe("verifyAndConsumeAuthorizePaymentToken", () => {
  it("succeeds on first use (the pay-click flow)", () => {
    const store = new InMemoryConsumedTokenStore();
    const token = issueAuthorizePaymentToken({
      transactionId: "tx-1",
      recipient: "client@example.com",
      amountUsd: 500,
      secret: SECRET,
      now: NOW,
    });
    const payload = verifyAndConsumeAuthorizePaymentToken(token, { secret: SECRET, now: NOW }, store);
    expect(payload.amountUsd).toBe(500);
  });

  it("throws TokenAlreadyConsumedError on double-pay-click (the core anti-double-spend guarantee)", () => {
    const store = new InMemoryConsumedTokenStore();
    const token = issueAuthorizePaymentToken({
      transactionId: "tx-1",
      recipient: "client@example.com",
      amountUsd: 500,
      secret: SECRET,
      now: NOW,
    });
    verifyAndConsumeAuthorizePaymentToken(token, { secret: SECRET, now: NOW }, store);
    expect(() => verifyAndConsumeAuthorizePaymentToken(token, { secret: SECRET, now: NOW }, store)).toThrow(
      TokenAlreadyConsumedError,
    );
  });

  it("two different tokens for the same transaction each get their own consumption slot", () => {
    const store = new InMemoryConsumedTokenStore();
    const tokenA = issueAuthorizePaymentToken({
      transactionId: "tx-1",
      recipient: "client@example.com",
      amountUsd: 500,
      secret: SECRET,
      now: NOW,
    });
    const tokenB = issueAuthorizePaymentToken({
      transactionId: "tx-1",
      recipient: "client@example.com",
      amountUsd: 500,
      secret: SECRET,
      now: NOW,
    });
    expect(() => verifyAndConsumeAuthorizePaymentToken(tokenA, { secret: SECRET, now: NOW }, store)).not.toThrow();
    expect(() => verifyAndConsumeAuthorizePaymentToken(tokenB, { secret: SECRET, now: NOW }, store)).not.toThrow();
  });
});
