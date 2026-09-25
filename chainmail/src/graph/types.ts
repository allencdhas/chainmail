/** Shape of a single entry in a Microsoft Graph change notification payload. */
export interface GraphChangeNotification {
  readonly subscriptionId: string;
  readonly subscriptionExpirationDateTime?: string | undefined;
  readonly clientState?: string | undefined;
  readonly changeType: string;
  readonly resource: string;
  readonly resourceData?:
    | {
        readonly id?: string;
        readonly [key: string]: unknown;
      }
    | undefined;
  readonly tenantId?: string | undefined;
}

/** Body of a POST to the webhook notification endpoint. */
export interface GraphNotificationPayload {
  readonly value: readonly GraphChangeNotification[];
}

/** Minimal shape of a Graph `subscription` resource, as returned by the API. */
export interface GraphSubscription {
  readonly id: string;
  readonly resource: string;
  readonly changeType: string;
  readonly notificationUrl: string;
  readonly expirationDateTime: string;
  readonly clientState?: string;
  readonly includeResourceData?: boolean;
}
