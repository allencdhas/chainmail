import { normalizeEmail } from "../wallet/derive.js";

const LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function isValidEnsLabel(label: string): boolean {
  return LABEL_PATTERN.test(label);
}

function assertValidLabel(label: string): void {
  if (!isValidEnsLabel(label)) {
    throw new Error(`"${label}" is not a valid ENS label.`);
  }
}

/**
 * Derives a candidate ENS label from an email's local-part: lowercases,
 * strips plus-addressing (`alex+billing@x.com` -> `alex`), replaces any
 * character outside `[a-z0-9-]` with `-`, collapses repeats, and trims
 * leading/trailing hyphens.
 *
 * Does NOT guarantee uniqueness within the parent namespace — callers must
 * check on-chain availability and append a disambiguating suffix themselves
 * (e.g. `alex-2`) if the label is already registered.
 */
export function deriveLabelFromEmail(email: string): string {
  const normalized = normalizeEmail(email);
  const [localPartRaw] = normalized.split("@");
  const localPart = localPartRaw ?? "";
  if (!localPart) {
    throw new Error(`Cannot derive an ENS label from email "${email}": missing local part.`);
  }

  const withoutPlusTag = localPart.split("+")[0] ?? localPart;
  const sanitized = withoutPlusTag
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);

  if (!sanitized) {
    throw new Error(`Email "${email}" produced an empty ENS label after sanitization.`);
  }
  // Defensive: unreachable in practice given the sanitization above (which
  // already strips leading/trailing hyphens and truncates to 63 chars), but
  // kept as a hard guarantee in case the sanitization logic above changes.
  if (!isValidEnsLabel(sanitized)) {
    throw new Error(`Derived label "${sanitized}" from email "${email}" is not a valid ENS label.`);
  }

  return sanitized;
}

/** Builds `<label>.<parentName>`, e.g. `userSubname("alex", "chainmail.eth")` -> `"alex.chainmail.eth"`. */
export function userSubname(label: string, parentName: string): string {
  assertValidLabel(label);
  return `${label}.${parentName}`;
}

/**
 * Builds the agent's own distinct subname, e.g.
 * `agentSubname("alex", "chainmail.eth")` -> `"agent.alex.chainmail.eth"`.
 * Distinct from the user's own subname per the PRD's ENS Integration section.
 */
export function agentSubname(label: string, parentName: string): string {
  assertValidLabel(label);
  return `agent.${label}.${parentName}`;
}
