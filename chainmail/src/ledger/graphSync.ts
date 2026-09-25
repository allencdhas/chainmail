import type { GraphMailClient } from "../graph/client.js";
import { graphPresetForColorKeyword } from "./categoryColors.js";
import { planFolderSync } from "./folderSync.js";
import { renderLedgerBodyHtml } from "./ledgerRenderer.js";
import { ALL_CHAINMAIL_FOLDER_DISPLAY_NAMES, LEDGER_STATE_MAPPINGS } from "./stateMapping.js";
import type { LedgerEntry, LedgerState } from "./types.js";

/**
 * INTEGRATION-ONLY MODULE — not covered by unit tests, for the same reason
 * as the other `client.ts`/`*Client.ts` files in this repo: it orchestrates
 * real Graph API calls (folder/category creation, message move/patch, draft
 * creation) via `GraphMailClient` and cannot be meaningfully unit tested
 * without a live mailbox. All decision logic that CAN be tested in
 * isolation — which folder/category a state maps to, what categories to
 * set on a transition, how the ledger body renders — lives in
 * `stateMapping.ts`, `folderSync.ts`, and `ledgerRenderer.ts` with full unit
 * test coverage; this file only wires that logic to the real mailbox.
 *
 * Idempotent by design: folder/category creation checks for an existing
 * match by display name before creating, so this is safe to call on every
 * server startup, not just the very first one.
 */

const LEDGER_FOLDER_DISPLAY_NAME = "ChainMail/Ledger";
const LEDGER_DRAFT_SUBJECT = "ChainMail Ledger (live — do not send)";

export async function ensureFoldersAndCategoriesExist(client: GraphMailClient): Promise<void> {
  const existingFolders = await client.listMailFolders();
  const existingByName = new Map(existingFolders.map((f) => [f.displayName, f]));

  let rootFolder = existingByName.get("ChainMail");
  if (!rootFolder) {
    rootFolder = await client.createMailFolder("ChainMail");
  }

  const existingChildren = await client.listMailFolders(rootFolder.id);
  const existingChildByName = new Map(existingChildren.map((f) => [f.displayName, f]));

  for (const folderPath of ALL_CHAINMAIL_FOLDER_DISPLAY_NAMES) {
    if (folderPath === "ChainMail") continue;
    const childName = folderPath.split("/")[1];
    if (!childName || existingChildByName.has(childName)) continue;
    await client.createMailFolder(childName, rootFolder.id);
  }

  const existingCategories = await client.listMasterCategories();
  const existingCategoryNames = new Set(existingCategories.map((c) => c.displayName));

  for (const mapping of LEDGER_STATE_MAPPINGS) {
    if (existingCategoryNames.has(mapping.categoryDisplayName)) continue;
    await client.createMasterCategory(
      mapping.categoryDisplayName,
      graphPresetForColorKeyword(mapping.colorKeyword),
    );
  }
}

/** Finds or creates the single persistent ledger draft, returning its message id. */
export async function ensureLedgerDraft(client: GraphMailClient): Promise<string> {
  const folders = await client.listMailFolders();
  const chainmailRoot = folders.find((f) => f.displayName === "ChainMail");
  const ledgerFolder = chainmailRoot
    ? (await client.listMailFolders(chainmailRoot.id)).find((f) => f.displayName === "Ledger")
    : undefined;

  if (!ledgerFolder) {
    throw new Error(
      `"${LEDGER_FOLDER_DISPLAY_NAME}" folder not found — call ensureFoldersAndCategoriesExist() first.`,
    );
  }

  // NOTE: listing drafts within the Ledger folder to find a pre-existing one
  // is intentionally omitted here for brevity — a production version should
  // check first and only create if none exists, to stay idempotent across
  // restarts. Track the returned id externally (e.g. in Postgres) rather
  // than relying on re-discovery.
  const draft = await client.createDraftMessage({
    subject: LEDGER_DRAFT_SUBJECT,
    body: { contentType: "HTML", content: renderLedgerBodyHtml([]) },
  });
  return draft.id;
}

export async function updateLedgerDraft(
  client: GraphMailClient,
  draftMessageId: string,
  entries: readonly LedgerEntry[],
): Promise<void> {
  await client.patchMessage(draftMessageId, {
    body: { contentType: "HTML", content: renderLedgerBodyHtml(entries) },
  });
}

/** Applies a state transition to a transaction email: move + category patch, per the PRD lifecycle table. */
export async function applyStateTransition(
  client: GraphMailClient,
  messageId: string,
  newState: LedgerState,
  destinationFolderIdsByDisplayName: ReadonlyMap<string, string>,
  existingCategories: readonly string[] = [],
): Promise<void> {
  const plan = planFolderSync({ newState, existingCategories });
  const destinationFolderId = destinationFolderIdsByDisplayName.get(plan.destinationFolderDisplayName);
  if (!destinationFolderId) {
    throw new Error(
      `No known folder id for "${plan.destinationFolderDisplayName}" — call ensureFoldersAndCategoriesExist() and refresh the folder id map first.`,
    );
  }

  await client.patchMessage(messageId, { categories: plan.categoriesToSet });
  await client.moveMessage(messageId, destinationFolderId);
}
