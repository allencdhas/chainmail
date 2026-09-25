import { describe, expect, it } from "vitest";
import { planFolderSync } from "../../src/ledger/folderSync.js";
import { ALL_CHAINMAIL_CATEGORY_NAMES, mappingForState } from "../../src/ledger/stateMapping.js";

describe("planFolderSync", () => {
  it("targets the correct destination folder for a given state", () => {
    const plan = planFolderSync({ newState: "settled" });
    expect(plan.destinationFolderDisplayName).toBe(mappingForState("settled").folderDisplayName);
  });

  it("sets exactly the new state's category when there are no existing categories", () => {
    const plan = planFolderSync({ newState: "flagged" });
    expect(plan.categoriesToSet).toEqual([mappingForState("flagged").categoryDisplayName]);
  });

  it("preserves non-ChainMail categories already on the message", () => {
    const plan = planFolderSync({
      newState: "settling",
      existingCategories: ["Personal", "Important"],
    });
    expect(plan.categoriesToSet).toEqual([
      "Personal",
      "Important",
      mappingForState("settling").categoryDisplayName,
    ]);
  });

  it("strips a stale ChainMail category from a prior state before adding the new one", () => {
    const priorCategory = mappingForState("pending_confirmation").categoryDisplayName;
    const plan = planFolderSync({
      newState: "settled",
      existingCategories: [priorCategory],
    });
    expect(plan.categoriesToSet).toEqual([mappingForState("settled").categoryDisplayName]);
    expect(plan.categoriesToSet).not.toContain(priorCategory);
  });

  it("never results in more than one ChainMail category being set", () => {
    // Simulate a message that somehow carries every ChainMail category at once.
    const plan = planFolderSync({
      newState: "recurring",
      existingCategories: [...ALL_CHAINMAIL_CATEGORY_NAMES],
    });
    const chainmailCategoriesInResult = plan.categoriesToSet.filter((c) =>
      ALL_CHAINMAIL_CATEGORY_NAMES.includes(c),
    );
    expect(chainmailCategoriesInResult).toEqual([mappingForState("recurring").categoryDisplayName]);
  });

  it("preserves a mix of user categories and strips only the stale ChainMail one", () => {
    const priorCategory = mappingForState("settling").categoryDisplayName;
    const plan = planFolderSync({
      newState: "settled",
      existingCategories: ["Client A", priorCategory, "Urgent"],
    });
    expect(plan.categoriesToSet).toEqual(["Client A", "Urgent", mappingForState("settled").categoryDisplayName]);
  });
});
