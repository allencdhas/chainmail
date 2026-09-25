import { describe, expect, it } from "vitest";
import { graphPresetForColorKeyword } from "../../src/ledger/categoryColors.js";
import { LEDGER_STATE_MAPPINGS } from "../../src/ledger/stateMapping.js";

describe("graphPresetForColorKeyword", () => {
  it("resolves every color keyword actually used by the state mapping table", () => {
    for (const mapping of LEDGER_STATE_MAPPINGS) {
      expect(() => graphPresetForColorKeyword(mapping.colorKeyword)).not.toThrow();
    }
  });

  it("returns distinct presets for each of the five state colors", () => {
    const presets = LEDGER_STATE_MAPPINGS.map((m) => graphPresetForColorKeyword(m.colorKeyword));
    expect(new Set(presets).size).toBe(presets.length);
  });

  it("returns a preset string matching the presetN pattern", () => {
    expect(graphPresetForColorKeyword("red")).toMatch(/^preset\d+$/);
  });

  it("throws a descriptive error for an unknown color keyword", () => {
    expect(() => graphPresetForColorKeyword("magenta")).toThrow(/No Graph category preset mapped/);
  });
});
