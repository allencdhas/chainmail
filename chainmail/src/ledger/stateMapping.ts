import type { LedgerState } from "./types.js";

/**
 * Direct encoding of the PRD's Transaction Lifecycle table:
 *
 *   State                 Folder                          Category color
 *   Pending Confirmation  ChainMail/Pending Confirmation   Yellow
 *   Settling              ChainMail/Settling               Blue
 *   Settled               ChainMail/Settled                Green
 *   Flagged               ChainMail/Flagged                Red
 *   Recurring             ChainMail/Recurring              Purple
 *
 * `categoryDisplayName` is the Outlook master category name this app owns
 * end-to-end (created once at startup, applied/removed per transition) —
 * distinct from `colorKeyword`, which only feeds the Graph-preset color
 * lookup in `categoryColors.ts`.
 */
export interface LedgerStateMapping {
  readonly state: LedgerState;
  readonly folderDisplayName: string;
  readonly categoryDisplayName: string;
  readonly colorKeyword: "yellow" | "blue" | "green" | "red" | "purple";
}

const ROOT_FOLDER_DISPLAY_NAME = "ChainMail";

export const LEDGER_STATE_MAPPINGS: readonly LedgerStateMapping[] = [
  {
    state: "pending_confirmation",
    folderDisplayName: `${ROOT_FOLDER_DISPLAY_NAME}/Pending Confirmation`,
    categoryDisplayName: "ChainMail: Pending Confirmation",
    colorKeyword: "yellow",
  },
  {
    state: "settling",
    folderDisplayName: `${ROOT_FOLDER_DISPLAY_NAME}/Settling`,
    categoryDisplayName: "ChainMail: Settling",
    colorKeyword: "blue",
  },
  {
    state: "settled",
    folderDisplayName: `${ROOT_FOLDER_DISPLAY_NAME}/Settled`,
    categoryDisplayName: "ChainMail: Settled",
    colorKeyword: "green",
  },
  {
    state: "flagged",
    folderDisplayName: `${ROOT_FOLDER_DISPLAY_NAME}/Flagged`,
    categoryDisplayName: "ChainMail: Flagged",
    colorKeyword: "red",
  },
  {
    state: "recurring",
    folderDisplayName: `${ROOT_FOLDER_DISPLAY_NAME}/Recurring`,
    categoryDisplayName: "ChainMail: Recurring",
    colorKeyword: "purple",
  },
] as const;

const MAPPING_BY_STATE = new Map(LEDGER_STATE_MAPPINGS.map((m) => [m.state, m]));

export function mappingForState(state: LedgerState): LedgerStateMapping {
  const mapping = MAPPING_BY_STATE.get(state);
  if (!mapping) {
    // Unreachable given `LedgerState`'s finite union, kept as a hard guard
    // against a future state being added to the type but not this table.
    throw new Error(`No folder/category mapping defined for ledger state "${state}".`);
  }
  return mapping;
}

/** Every category display name this app owns — used to strip stale ChainMail categories during a transition. */
export const ALL_CHAINMAIL_CATEGORY_NAMES: readonly string[] = LEDGER_STATE_MAPPINGS.map(
  (m) => m.categoryDisplayName,
);

/** Every folder path this app creates at startup, in parent-first order. */
export const ALL_CHAINMAIL_FOLDER_DISPLAY_NAMES: readonly string[] = [
  ROOT_FOLDER_DISPLAY_NAME,
  ...LEDGER_STATE_MAPPINGS.map((m) => m.folderDisplayName),
  `${ROOT_FOLDER_DISPLAY_NAME}/Ledger`,
];
