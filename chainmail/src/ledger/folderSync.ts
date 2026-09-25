import { ALL_CHAINMAIL_CATEGORY_NAMES, mappingForState } from "./stateMapping.js";
import type { LedgerState } from "./types.js";

/**
 * Plans the Graph actions needed to move a transaction email into its new
 * state's folder and category, per the PRD: "each state change ... moves
 * the message into the matching folder with the matching color category."
 *
 * A transaction should only ever carry one ChainMail status category at a
 * time, so any stale ChainMail category from a prior state is stripped
 * before adding the new one — non-ChainMail categories the user (or Outlook)
 * applied independently are always preserved untouched.
 */
export interface FolderSyncPlan {
  readonly destinationFolderDisplayName: string;
  readonly categoriesToSet: readonly string[];
}

export function planFolderSync(params: {
  readonly newState: LedgerState;
  readonly existingCategories?: readonly string[];
}): FolderSyncPlan {
  const mapping = mappingForState(params.newState);
  const existing = params.existingCategories ?? [];

  const preserved = existing.filter((category) => !ALL_CHAINMAIL_CATEGORY_NAMES.includes(category));
  const categoriesToSet = [...preserved, mapping.categoryDisplayName];

  return {
    destinationFolderDisplayName: mapping.folderDisplayName,
    categoriesToSet,
  };
}
