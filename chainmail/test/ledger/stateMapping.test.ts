import { describe, expect, it } from "vitest";
import {
  ALL_CHAINMAIL_CATEGORY_NAMES,
  ALL_CHAINMAIL_FOLDER_DISPLAY_NAMES,
  LEDGER_STATE_MAPPINGS,
  mappingForState,
} from "../../src/ledger/stateMapping.js";
import type { LedgerState } from "../../src/ledger/types.js";

const ALL_STATES: readonly LedgerState[] = [
  "pending_confirmation",
  "settling",
  "settled",
  "flagged",
  "recurring",
];

describe("LEDGER_STATE_MAPPINGS", () => {
  it("defines exactly the five PRD lifecycle states", () => {
    expect(LEDGER_STATE_MAPPINGS.map((m) => m.state).sort()).toEqual([...ALL_STATES].sort());
  });

  it("matches the PRD's exact folder-per-state table", () => {
    expect(mappingForState("pending_confirmation").folderDisplayName).toBe("ChainMail/Pending Confirmation");
    expect(mappingForState("settling").folderDisplayName).toBe("ChainMail/Settling");
    expect(mappingForState("settled").folderDisplayName).toBe("ChainMail/Settled");
    expect(mappingForState("flagged").folderDisplayName).toBe("ChainMail/Flagged");
    expect(mappingForState("recurring").folderDisplayName).toBe("ChainMail/Recurring");
  });

  it("matches the PRD's exact color-per-state table", () => {
    expect(mappingForState("pending_confirmation").colorKeyword).toBe("yellow");
    expect(mappingForState("settling").colorKeyword).toBe("blue");
    expect(mappingForState("settled").colorKeyword).toBe("green");
    expect(mappingForState("flagged").colorKeyword).toBe("red");
    expect(mappingForState("recurring").colorKeyword).toBe("purple");
  });

  it("gives every state a distinct category display name", () => {
    const names = LEDGER_STATE_MAPPINGS.map((m) => m.categoryDisplayName);
    expect(new Set(names).size).toBe(names.length);
  });

  it("gives every state a distinct folder path", () => {
    const folders = LEDGER_STATE_MAPPINGS.map((m) => m.folderDisplayName);
    expect(new Set(folders).size).toBe(folders.length);
  });
});

describe("mappingForState", () => {
  it("returns the correct mapping for each valid state", () => {
    for (const state of ALL_STATES) {
      expect(mappingForState(state).state).toBe(state);
    }
  });

  it("throws for an unrecognized state", () => {
    // @ts-expect-error intentionally passing an invalid state to test the guard
    expect(() => mappingForState("unknown_state")).toThrow(/No folder\/category mapping/);
  });
});

describe("ALL_CHAINMAIL_CATEGORY_NAMES", () => {
  it("contains exactly the five state category names", () => {
    expect(ALL_CHAINMAIL_CATEGORY_NAMES).toHaveLength(5);
    for (const mapping of LEDGER_STATE_MAPPINGS) {
      expect(ALL_CHAINMAIL_CATEGORY_NAMES).toContain(mapping.categoryDisplayName);
    }
  });
});

describe("ALL_CHAINMAIL_FOLDER_DISPLAY_NAMES", () => {
  it("includes the root folder, all five state folders, and the Ledger folder", () => {
    expect(ALL_CHAINMAIL_FOLDER_DISPLAY_NAMES).toContain("ChainMail");
    expect(ALL_CHAINMAIL_FOLDER_DISPLAY_NAMES).toContain("ChainMail/Ledger");
    for (const mapping of LEDGER_STATE_MAPPINGS) {
      expect(ALL_CHAINMAIL_FOLDER_DISPLAY_NAMES).toContain(mapping.folderDisplayName);
    }
  });

  it("has exactly 7 entries (root + 5 states + ledger)", () => {
    expect(ALL_CHAINMAIL_FOLDER_DISPLAY_NAMES).toHaveLength(7);
  });
});
