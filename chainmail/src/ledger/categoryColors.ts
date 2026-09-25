/**
 * Maps our domain-level color keywords to Microsoft Graph's
 * `masterCategories` preset color enum (`preset0`..`preset24`).
 *
 * ⚠ CAVEAT: this preset-to-color association is from commonly documented
 * Outlook category defaults, NOT independently re-verified against a fetched
 * Microsoft Graph docs page in this session. Unlike the ENS role constants
 * or ABI signatures elsewhere in this repo, getting this wrong is low-risk
 * (worst case: the wrong color swatch shows up, not a functional break) —
 * but confirm it renders as expected against a real tenant during the Day 1
 * folder/category setup step, and adjust here if not.
 */
const COLOR_KEYWORD_TO_GRAPH_PRESET: Readonly<Record<string, string>> = {
  red: "preset0",
  orange: "preset1",
  brown: "preset2",
  yellow: "preset3",
  green: "preset4",
  teal: "preset5",
  olive: "preset6",
  blue: "preset7",
  purple: "preset8",
  cranberry: "preset9",
};

export type ColorKeyword = keyof typeof COLOR_KEYWORD_TO_GRAPH_PRESET;

export function graphPresetForColorKeyword(colorKeyword: string): string {
  const preset = COLOR_KEYWORD_TO_GRAPH_PRESET[colorKeyword];
  if (!preset) {
    throw new Error(
      `No Graph category preset mapped for color keyword "${colorKeyword}". ` +
        `Known keywords: ${Object.keys(COLOR_KEYWORD_TO_GRAPH_PRESET).join(", ")}.`,
    );
  }
  return preset;
}
