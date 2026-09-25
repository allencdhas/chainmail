import { ClientSecretCredential } from "@azure/identity";
import { Client } from "@microsoft/microsoft-graph-client";
import type { AuthenticationProvider } from "@microsoft/microsoft-graph-client";
import "isomorphic-fetch";
import type { Env } from "../config/env.js";
import type { GraphSubscription } from "./types.js";
import type {
  CreateSubscriptionRequestBody,
  RenewSubscriptionRequestBody,
} from "./subscriptionLifecycle.js";

/**
 * INTEGRATION-ONLY MODULE — not covered by unit tests.
 *
 * This is a thin wrapper around the real Microsoft Graph SDK and Azure AD
 * app-only auth. It cannot be meaningfully unit tested without either a live
 * Azure AD tenant or reimplementing the Graph SDK's internals as a fake —
 * neither is worth the cost here. All business logic that CAN be tested in
 * isolation (validation handshake, notification dedupe, subscription
 * lifecycle math) lives in sibling files with full unit test coverage;
 * this file only wires that logic to the real network.
 *
 * Uses application permissions (client credentials flow) — every call must
 * target `/users/{mailboxUserId}/...`, never `/me/...`, since there is no
 * signed-in user in this flow.
 */

const GRAPH_SCOPE = "https://graph.microsoft.com/.default";

export function createGraphClient(env: Pick<Env, "GRAPH_TENANT_ID" | "GRAPH_CLIENT_ID" | "GRAPH_CLIENT_SECRET">): Client {
  const credential = new ClientSecretCredential(
    env.GRAPH_TENANT_ID,
    env.GRAPH_CLIENT_ID,
    env.GRAPH_CLIENT_SECRET,
  );

  const authProvider: AuthenticationProvider = {
    getAccessToken: async () => {
      const token = await credential.getToken(GRAPH_SCOPE);
      if (!token) {
        throw new Error("Failed to acquire Microsoft Graph access token via client credentials.");
      }
      return token.token;
    },
  };

  return Client.initWithMiddleware({ authProvider });
}

export class GraphMailClient {
  constructor(
    private readonly client: Client,
    private readonly mailboxUserId: string,
  ) {}

  async createSubscription(body: CreateSubscriptionRequestBody): Promise<GraphSubscription> {
    return this.client.api("/subscriptions").post(body);
  }

  async renewSubscription(subscriptionId: string, body: RenewSubscriptionRequestBody): Promise<GraphSubscription> {
    return this.client.api(`/subscriptions/${subscriptionId}`).patch(body);
  }

  async deleteSubscription(subscriptionId: string): Promise<void> {
    await this.client.api(`/subscriptions/${subscriptionId}`).delete();
  }

  async listSubscriptions(): Promise<GraphSubscription[]> {
    const response = await this.client.api("/subscriptions").get();
    return response.value ?? [];
  }

  /** Refetches a message's full content — notification payloads never include the body. */
  async getMessage(messageId: string, select?: readonly string[]): Promise<unknown> {
    let request = this.client.api(`/users/${this.mailboxUserId}/messages/${messageId}`);
    if (select?.length) {
      request = request.select(select.join(","));
    }
    return request.get();
  }

  async patchMessage(messageId: string, patch: Record<string, unknown>): Promise<void> {
    await this.client.api(`/users/${this.mailboxUserId}/messages/${messageId}`).patch(patch);
  }

  async moveMessage(messageId: string, destinationFolderId: string): Promise<void> {
    await this.client
      .api(`/users/${this.mailboxUserId}/messages/${messageId}/move`)
      .post({ destinationId: destinationFolderId });
  }

  async sendMail(message: Record<string, unknown>, saveToSentItems = true): Promise<void> {
    await this.client
      .api(`/users/${this.mailboxUserId}/sendMail`)
      .post({ message, saveToSentItems });
  }

  // --- Folders, categories, drafts (for ledger/folderSync orchestration) ---

  async listMailFolders(parentFolderId?: string): Promise<Array<{ id: string; displayName: string }>> {
    const path = parentFolderId
      ? `/users/${this.mailboxUserId}/mailFolders/${parentFolderId}/childFolders`
      : `/users/${this.mailboxUserId}/mailFolders`;
    const response = await this.client.api(path).get();
    return response.value ?? [];
  }

  async createMailFolder(
    displayName: string,
    parentFolderId?: string,
  ): Promise<{ id: string; displayName: string }> {
    const path = parentFolderId
      ? `/users/${this.mailboxUserId}/mailFolders/${parentFolderId}/childFolders`
      : `/users/${this.mailboxUserId}/mailFolders`;
    return this.client.api(path).post({ displayName });
  }

  async listMasterCategories(): Promise<Array<{ id: string; displayName: string; color: string }>> {
    const response = await this.client
      .api(`/users/${this.mailboxUserId}/outlook/masterCategories`)
      .get();
    return response.value ?? [];
  }

  async createMasterCategory(displayName: string, color: string): Promise<void> {
    await this.client
      .api(`/users/${this.mailboxUserId}/outlook/masterCategories`)
      .post({ displayName, color });
  }

  async createDraftMessage(input: {
    subject: string;
    body: { contentType: "HTML" | "Text"; content: string };
  }): Promise<{ id: string }> {
    return this.client.api(`/users/${this.mailboxUserId}/messages`).post(input);
  }
}
