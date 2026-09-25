import { describe, expect, it } from "vitest";
import {
  InMemorySeenNotificationStore,
  computeNotificationDedupeKey,
  validateNotifications,
} from "../../src/graph/notifications.js";
import type { GraphChangeNotification, GraphNotificationPayload } from "../../src/graph/types.js";

const CLIENT_STATE = "shared-webhook-secret";
const SUBSCRIPTION_ID = "sub-1";

function notification(overrides: Partial<GraphChangeNotification> = {}): GraphChangeNotification {
  // Use `in` (not `??`) so an explicit `{ clientState: undefined }` override
  // is respected instead of silently falling back to the default — several
  // tests below rely on being able to force a field to `undefined`.
  return {
    subscriptionId: "subscriptionId" in overrides ? overrides.subscriptionId! : SUBSCRIPTION_ID,
    clientState: "clientState" in overrides ? overrides.clientState : CLIENT_STATE,
    changeType: "changeType" in overrides ? overrides.changeType! : "created",
    resource: "resource" in overrides ? overrides.resource! : "users/mailbox-id/messages",
    resourceData: "resourceData" in overrides ? overrides.resourceData : { id: "msg-1" },
    tenantId: "tenantId" in overrides ? overrides.tenantId : "tenant-1",
  };
}

function config(overrides: { knownSubscriptionIds?: readonly string[] } = {}) {
  return {
    expectedClientState: CLIENT_STATE,
    knownSubscriptionIds: overrides.knownSubscriptionIds ?? [SUBSCRIPTION_ID],
  };
}

describe("computeNotificationDedupeKey", () => {
  it("combines subscriptionId, changeType, resource, and resourceData.id", () => {
    const key = computeNotificationDedupeKey(notification());
    expect(key).toBe("sub-1|created|users/mailbox-id/messages|msg-1");
  });

  it("falls back to an empty id segment when resourceData is absent (basic notifications)", () => {
    const key = computeNotificationDedupeKey(notification({ resourceData: undefined }));
    expect(key).toBe("sub-1|created|users/mailbox-id/messages|");
  });

  it("produces different keys for different changeTypes on the same resource", () => {
    const created = computeNotificationDedupeKey(notification({ changeType: "created" }));
    const updated = computeNotificationDedupeKey(notification({ changeType: "updated" }));
    expect(created).not.toBe(updated);
  });
});

describe("validateNotifications", () => {
  it("accepts a well-formed, known, first-seen notification", () => {
    const payload: GraphNotificationPayload = { value: [notification()] };
    const result = validateNotifications(payload, config(), new InMemorySeenNotificationStore());

    expect(result.accepted).toHaveLength(1);
    expect(result.rejected).toHaveLength(0);
  });

  it("rejects a notification with a missing clientState", () => {
    const payload: GraphNotificationPayload = { value: [notification({ clientState: undefined })] };
    const result = validateNotifications(payload, config(), new InMemorySeenNotificationStore());

    expect(result.accepted).toHaveLength(0);
    expect(result.rejected[0]?.reason).toBe("MISSING_CLIENT_STATE");
  });

  it("rejects a notification with a mismatched clientState (forged payload)", () => {
    const payload: GraphNotificationPayload = { value: [notification({ clientState: "wrong-secret" })] };
    const result = validateNotifications(payload, config(), new InMemorySeenNotificationStore());

    expect(result.accepted).toHaveLength(0);
    expect(result.rejected[0]?.reason).toBe("CLIENT_STATE_MISMATCH");
  });

  it("rejects a notification from an unrecognized subscriptionId", () => {
    const payload: GraphNotificationPayload = { value: [notification({ subscriptionId: "unknown-sub" })] };
    const result = validateNotifications(payload, config(), new InMemorySeenNotificationStore());

    expect(result.accepted).toHaveLength(0);
    expect(result.rejected[0]?.reason).toBe("UNKNOWN_SUBSCRIPTION");
  });

  it("accepts knownSubscriptionIds passed as a Set", () => {
    const payload: GraphNotificationPayload = { value: [notification()] };
    const result = validateNotifications(
      payload,
      { expectedClientState: CLIENT_STATE, knownSubscriptionIds: new Set([SUBSCRIPTION_ID]) },
      new InMemorySeenNotificationStore(),
    );
    expect(result.accepted).toHaveLength(1);
  });

  it("rejects a duplicate notification seen in a prior call (idempotency across retries)", () => {
    const store = new InMemorySeenNotificationStore();
    const payload: GraphNotificationPayload = { value: [notification()] };

    const first = validateNotifications(payload, config(), store);
    const second = validateNotifications(payload, config(), store);

    expect(first.accepted).toHaveLength(1);
    expect(second.accepted).toHaveLength(0);
    expect(second.rejected[0]?.reason).toBe("DUPLICATE");
  });

  it("rejects duplicates within the same batch, keeping only the first occurrence", () => {
    const payload: GraphNotificationPayload = { value: [notification(), notification()] };
    const result = validateNotifications(payload, config(), new InMemorySeenNotificationStore());

    expect(result.accepted).toHaveLength(1);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toBe("DUPLICATE");
  });

  it("processes a mixed batch, accepting valid entries and rejecting invalid ones independently", () => {
    const payload: GraphNotificationPayload = {
      value: [
        notification({ resourceData: { id: "msg-1" } }),
        notification({ clientState: "wrong" }),
        notification({ subscriptionId: "other-sub" }),
        notification({ resourceData: { id: "msg-2" } }),
      ],
    };
    const result = validateNotifications(payload, config(), new InMemorySeenNotificationStore());

    expect(result.accepted).toHaveLength(2);
    expect(result.rejected).toHaveLength(2);
    expect(result.rejected.map((r) => r.reason).sort()).toEqual(
      ["CLIENT_STATE_MISMATCH", "UNKNOWN_SUBSCRIPTION"].sort(),
    );
  });

  it("returns empty accepted/rejected arrays for an empty payload", () => {
    const result = validateNotifications({ value: [] }, config(), new InMemorySeenNotificationStore());
    expect(result.accepted).toHaveLength(0);
    expect(result.rejected).toHaveLength(0);
  });
});

describe("InMemorySeenNotificationStore", () => {
  it("has() is false before add(), true after", () => {
    const store = new InMemorySeenNotificationStore();
    expect(store.has("key-1")).toBe(false);
    store.add("key-1");
    expect(store.has("key-1")).toBe(true);
  });
});
