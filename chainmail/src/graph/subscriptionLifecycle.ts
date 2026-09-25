/**
 * Subscription create/renew payload builders and renewal-due detection.
 *
 * Per Microsoft's documented subscription lifetimes (learn.microsoft.com/
 * graph/api/resources/subscription): Outlook message/event/contact
 * subscriptions max out at 10,080 minutes (7 days) for basic notifications,
 * or 1,440 minutes (1 day) for rich notifications (includeResourceData).
 * Any expirationDateTime under 45 minutes from the request time is silently
 * clamped up to 45 minutes by Graph itself — we clamp defensively on our
 * side too so our own renewal-due math stays consistent with what Graph
 * will actually store.
 */

export const MAX_SUBSCRIPTION_LIFETIME_MINUTES = {
  outlookResourceBasic: 10_080,
  outlookResourceRich: 1_440,
} as const;

const GRAPH_MINIMUM_LIFETIME_MINUTES = 45;
const DEFAULT_SAFETY_BUFFER_MINUTES = 60;
const DEFAULT_RENEWAL_LEAD_MINUTES = 120;

export interface CreateSubscriptionInput {
  readonly resource: string;
  readonly changeType: string;
  readonly notificationUrl: string;
  readonly clientState: string;
  readonly includeResourceData?: boolean;
  /** Minutes to shave off the resource's max lifetime, so renewal has headroom. Defaults to 60. */
  readonly safetyBufferMinutes?: number;
}

export interface CreateSubscriptionRequestBody {
  readonly changeType: string;
  readonly notificationUrl: string;
  readonly resource: string;
  readonly expirationDateTime: string;
  readonly clientState: string;
  readonly includeResourceData?: boolean;
}

function maxLifetimeMinutesFor(includeResourceData: boolean | undefined): number {
  return includeResourceData
    ? MAX_SUBSCRIPTION_LIFETIME_MINUTES.outlookResourceRich
    : MAX_SUBSCRIPTION_LIFETIME_MINUTES.outlookResourceBasic;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

/**
 * Computes an `expirationDateTime` that is safely inside Graph's allowed
 * range: at least the 45-minute minimum, at most (resource max - buffer).
 * If the buffer would push the value below the 45-minute floor (only
 * possible with a pathologically large buffer), the floor wins.
 */
export function computeExpirationDateTime(
  now: Date,
  options: { includeResourceData?: boolean | undefined; safetyBufferMinutes?: number | undefined },
): Date {
  const maxLifetime = maxLifetimeMinutesFor(options.includeResourceData);
  const buffer = options.safetyBufferMinutes ?? DEFAULT_SAFETY_BUFFER_MINUTES;
  const targetMinutes = Math.max(maxLifetime - buffer, GRAPH_MINIMUM_LIFETIME_MINUTES);
  return addMinutes(now, targetMinutes);
}

export function buildCreateSubscriptionRequest(
  input: CreateSubscriptionInput,
  now: Date = new Date(),
): CreateSubscriptionRequestBody {
  const expirationDateTime = computeExpirationDateTime(now, {
    includeResourceData: input.includeResourceData,
    safetyBufferMinutes: input.safetyBufferMinutes,
  });

  const body: CreateSubscriptionRequestBody = {
    changeType: input.changeType,
    notificationUrl: input.notificationUrl,
    resource: input.resource,
    expirationDateTime: expirationDateTime.toISOString(),
    clientState: input.clientState,
  };

  return input.includeResourceData === undefined
    ? body
    : { ...body, includeResourceData: input.includeResourceData };
}

export interface RenewSubscriptionRequestBody {
  readonly expirationDateTime: string;
}

export function buildRenewSubscriptionRequest(
  options: { includeResourceData?: boolean | undefined; safetyBufferMinutes?: number | undefined },
  now: Date = new Date(),
): RenewSubscriptionRequestBody {
  return {
    expirationDateTime: computeExpirationDateTime(now, options).toISOString(),
  };
}

export interface RenewableSubscription {
  readonly id: string;
  readonly expirationDateTime: string;
}

/**
 * True when a subscription's expiration falls within `leadMinutes` of `now`
 * (default 2 hours) — i.e. it's time to renew. Also true for subscriptions
 * that have already expired, so a missed cron cycle self-heals on the next
 * run instead of leaving mail silently unwatched.
 */
export function needsRenewal(
  subscription: RenewableSubscription,
  now: Date = new Date(),
  leadMinutes: number = DEFAULT_RENEWAL_LEAD_MINUTES,
): boolean {
  const expiresAt = new Date(subscription.expirationDateTime).getTime();
  const leadMs = leadMinutes * 60_000;
  return expiresAt - now.getTime() <= leadMs;
}

export function selectSubscriptionsNeedingRenewal<T extends RenewableSubscription>(
  subscriptions: readonly T[],
  now: Date = new Date(),
  leadMinutes: number = DEFAULT_RENEWAL_LEAD_MINUTES,
): readonly T[] {
  return subscriptions.filter((subscription) => needsRenewal(subscription, now, leadMinutes));
}
