import type { GraphChangeNotification, GraphNotificationPayload } from "./types.js";

/**
 * Validates and deduplicates an incoming Graph change-notification payload.
 *
 * Three independent checks, per Microsoft's own guidance and the researched
 * failure modes for this integration:
 *   1. `clientState` must match our shared secret (proves the payload
 *      actually came from our subscription, not a forged POST).
 *   2. `subscriptionId` must be one we currently recognize (a leftover
 *      subscription from an old deploy or a different environment should
 *      not be trusted).
 *   3. Duplicate notifications (retries, or overlapping subscriptions on
 *      the same resource) must not be processed twice — idempotency is
 *      required because Graph retries for up to 4 hours on non-2xx/timeout.
 *
 * This function does NOT send the HTTP response itself — callers must still
 * respond 202/200 within Graph's 3-second window regardless of the outcome
 * here (see webhookValidation.ts doc comment and the route wiring for why).
 */

export type NotificationRejectReason =
  | "MISSING_CLIENT_STATE"
  | "CLIENT_STATE_MISMATCH"
  | "UNKNOWN_SUBSCRIPTION"
  | "DUPLICATE";

export interface RejectedNotification {
  readonly notification: GraphChangeNotification;
  readonly reason: NotificationRejectReason;
}

export interface NotificationValidationResult {
  readonly accepted: readonly GraphChangeNotification[];
  readonly rejected: readonly RejectedNotification[];
}

export interface NotificationValidationConfig {
  readonly expectedClientState: string;
  readonly knownSubscriptionIds: ReadonlySet<string> | readonly string[];
}

/** Storage interface for the dedupe key set — swap for a TTL-backed cache (e.g. Redis) in production. */
export interface SeenNotificationStore {
  has(key: string): boolean;
  add(key: string): void;
}

/**
 * In-memory dedupe store. Adequate for a single-process hackathon deploy;
 * does NOT survive process restarts and grows unbounded (no TTL eviction).
 * Swap for a Redis-backed store with a >=4h TTL before any real deployment,
 * since Graph's own retry window is 4 hours.
 */
export class InMemorySeenNotificationStore implements SeenNotificationStore {
  private readonly seen = new Set<string>();

  has(key: string): boolean {
    return this.seen.has(key);
  }

  add(key: string): void {
    this.seen.add(key);
  }
}

/**
 * Builds a stable dedupe key from the fields present on every Graph
 * notification. `resourceData.id` is only present on rich notifications, so
 * it's included when available but not required.
 */
export function computeNotificationDedupeKey(notification: GraphChangeNotification): string {
  return [
    notification.subscriptionId,
    notification.changeType,
    notification.resource,
    notification.resourceData?.id ?? "",
  ].join("|");
}

function toIdSet(ids: ReadonlySet<string> | readonly string[]): ReadonlySet<string> {
  return ids instanceof Set ? ids : new Set(ids);
}

export function validateNotifications(
  payload: GraphNotificationPayload,
  config: NotificationValidationConfig,
  seenStore: SeenNotificationStore,
): NotificationValidationResult {
  const knownIds = toIdSet(config.knownSubscriptionIds);
  const accepted: GraphChangeNotification[] = [];
  const rejected: RejectedNotification[] = [];

  for (const notification of payload.value) {
    if (!notification.clientState) {
      rejected.push({ notification, reason: "MISSING_CLIENT_STATE" });
      continue;
    }

    if (notification.clientState !== config.expectedClientState) {
      rejected.push({ notification, reason: "CLIENT_STATE_MISMATCH" });
      continue;
    }

    if (!knownIds.has(notification.subscriptionId)) {
      rejected.push({ notification, reason: "UNKNOWN_SUBSCRIPTION" });
      continue;
    }

    const dedupeKey = computeNotificationDedupeKey(notification);
    if (seenStore.has(dedupeKey)) {
      rejected.push({ notification, reason: "DUPLICATE" });
      continue;
    }

    seenStore.add(dedupeKey);
    accepted.push(notification);
  }

  return { accepted, rejected };
}
