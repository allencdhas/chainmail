import { describe, expect, it } from "vitest";
import {
  MAX_SUBSCRIPTION_LIFETIME_MINUTES,
  buildCreateSubscriptionRequest,
  buildRenewSubscriptionRequest,
  computeExpirationDateTime,
  needsRenewal,
  selectSubscriptionsNeedingRenewal,
} from "../../src/graph/subscriptionLifecycle.js";

const NOW = new Date("2026-09-25T12:00:00.000Z");

describe("computeExpirationDateTime", () => {
  it("uses the basic-notification max lifetime minus the default buffer when includeResourceData is false/omitted", () => {
    const result = computeExpirationDateTime(NOW, {});
    const expectedMinutes = MAX_SUBSCRIPTION_LIFETIME_MINUTES.outlookResourceBasic - 60;
    expect(result.getTime()).toBe(NOW.getTime() + expectedMinutes * 60_000);
  });

  it("uses the rich-notification max lifetime when includeResourceData is true", () => {
    const result = computeExpirationDateTime(NOW, { includeResourceData: true });
    const expectedMinutes = MAX_SUBSCRIPTION_LIFETIME_MINUTES.outlookResourceRich - 60;
    expect(result.getTime()).toBe(NOW.getTime() + expectedMinutes * 60_000);
  });

  it("respects a custom safety buffer", () => {
    const result = computeExpirationDateTime(NOW, { safetyBufferMinutes: 100 });
    const expectedMinutes = MAX_SUBSCRIPTION_LIFETIME_MINUTES.outlookResourceBasic - 100;
    expect(result.getTime()).toBe(NOW.getTime() + expectedMinutes * 60_000);
  });

  it("clamps to the 45-minute Graph minimum when the buffer would push it below that", () => {
    const result = computeExpirationDateTime(NOW, {
      includeResourceData: true,
      safetyBufferMinutes: 10_000, // absurdly large, would go negative
    });
    expect(result.getTime()).toBe(NOW.getTime() + 45 * 60_000);
  });
});

describe("buildCreateSubscriptionRequest", () => {
  it("builds a well-formed basic subscription request", () => {
    const body = buildCreateSubscriptionRequest(
      {
        resource: "users/mailbox-id/mailFolders('inbox')/messages",
        changeType: "created",
        notificationUrl: "https://chainmail.example.com/webhooks/graph",
        clientState: "secret",
      },
      NOW,
    );

    expect(body.changeType).toBe("created");
    expect(body.notificationUrl).toBe("https://chainmail.example.com/webhooks/graph");
    expect(body.resource).toBe("users/mailbox-id/mailFolders('inbox')/messages");
    expect(body.clientState).toBe("secret");
    expect(body.includeResourceData).toBeUndefined();
    expect(new Date(body.expirationDateTime).getTime()).toBeGreaterThan(NOW.getTime());
  });

  it("includes includeResourceData in the body only when explicitly provided", () => {
    const withFlag = buildCreateSubscriptionRequest(
      {
        resource: "r",
        changeType: "created",
        notificationUrl: "https://example.com",
        clientState: "secret",
        includeResourceData: true,
      },
      NOW,
    );
    expect(withFlag.includeResourceData).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(withFlag, "includeResourceData")).toBe(true);

    const withoutFlag = buildCreateSubscriptionRequest(
      { resource: "r", changeType: "created", notificationUrl: "https://example.com", clientState: "secret" },
      NOW,
    );
    expect(Object.prototype.hasOwnProperty.call(withoutFlag, "includeResourceData")).toBe(false);
  });

  it("produces an ISO 8601 expirationDateTime string", () => {
    const body = buildCreateSubscriptionRequest(
      { resource: "r", changeType: "created", notificationUrl: "https://example.com", clientState: "secret" },
      NOW,
    );
    expect(body.expirationDateTime).toBe(new Date(body.expirationDateTime).toISOString());
  });
});

describe("buildRenewSubscriptionRequest", () => {
  it("returns only an expirationDateTime field", () => {
    const body = buildRenewSubscriptionRequest({}, NOW);
    expect(Object.keys(body)).toEqual(["expirationDateTime"]);
    expect(new Date(body.expirationDateTime).getTime()).toBeGreaterThan(NOW.getTime());
  });
});

describe("needsRenewal", () => {
  it("is false when expiration is far in the future", () => {
    const subscription = { id: "s1", expirationDateTime: new Date(NOW.getTime() + 5 * 24 * 60 * 60_000).toISOString() };
    expect(needsRenewal(subscription, NOW)).toBe(false);
  });

  it("is true when expiration is within the default lead time (2h)", () => {
    const subscription = { id: "s1", expirationDateTime: new Date(NOW.getTime() + 60 * 60_000).toISOString() };
    expect(needsRenewal(subscription, NOW)).toBe(true);
  });

  it("is true when the subscription has already expired", () => {
    const subscription = { id: "s1", expirationDateTime: new Date(NOW.getTime() - 60 * 60_000).toISOString() };
    expect(needsRenewal(subscription, NOW)).toBe(true);
  });

  it("respects a custom leadMinutes", () => {
    const subscription = { id: "s1", expirationDateTime: new Date(NOW.getTime() + 30 * 60_000).toISOString() };
    expect(needsRenewal(subscription, NOW, 15)).toBe(false);
    expect(needsRenewal(subscription, NOW, 45)).toBe(true);
  });
});

describe("selectSubscriptionsNeedingRenewal", () => {
  it("filters to only the subscriptions due for renewal", () => {
    const subscriptions = [
      { id: "expiring-soon", expirationDateTime: new Date(NOW.getTime() + 30 * 60_000).toISOString() },
      { id: "safe", expirationDateTime: new Date(NOW.getTime() + 5 * 24 * 60 * 60_000).toISOString() },
      { id: "already-expired", expirationDateTime: new Date(NOW.getTime() - 60 * 60_000).toISOString() },
    ];

    const due = selectSubscriptionsNeedingRenewal(subscriptions, NOW);
    expect(due.map((s) => s.id).sort()).toEqual(["already-expired", "expiring-soon"].sort());
  });

  it("returns an empty array when nothing needs renewal", () => {
    const subscriptions = [
      { id: "safe", expirationDateTime: new Date(NOW.getTime() + 5 * 24 * 60 * 60_000).toISOString() },
    ];
    expect(selectSubscriptionsNeedingRenewal(subscriptions, NOW)).toHaveLength(0);
  });
});
