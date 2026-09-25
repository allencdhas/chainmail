import { describe, expect, it } from "vitest";
import {
  agentSubname,
  deriveLabelFromEmail,
  isValidEnsLabel,
  userSubname,
} from "../../src/ens/subnameNaming.js";

describe("isValidEnsLabel", () => {
  it("accepts simple lowercase alphanumeric labels", () => {
    expect(isValidEnsLabel("alex")).toBe(true);
    expect(isValidEnsLabel("alex2")).toBe(true);
  });

  it("accepts internal hyphens but not leading/trailing ones", () => {
    expect(isValidEnsLabel("alex-dev")).toBe(true);
    expect(isValidEnsLabel("-alex")).toBe(false);
    expect(isValidEnsLabel("alex-")).toBe(false);
  });

  it("rejects uppercase, empty, and non-alphanumeric labels", () => {
    expect(isValidEnsLabel("Alex")).toBe(false);
    expect(isValidEnsLabel("")).toBe(false);
    expect(isValidEnsLabel("alex_dev")).toBe(false);
    expect(isValidEnsLabel("alex.dev")).toBe(false);
  });
});

describe("deriveLabelFromEmail", () => {
  it("lowercases the local part", () => {
    expect(deriveLabelFromEmail("Alex@Example.com")).toBe("alex");
  });

  it("strips plus-addressing", () => {
    expect(deriveLabelFromEmail("alex+billing@example.com")).toBe("alex");
  });

  it("replaces disallowed characters with hyphens and collapses repeats", () => {
    expect(deriveLabelFromEmail("alex.d..oe@example.com")).toBe("alex-d-oe");
  });

  it("strips leading and trailing hyphens after sanitization", () => {
    expect(deriveLabelFromEmail(".alex.@example.com")).toBe("alex");
  });

  it("truncates local parts longer than 63 characters", () => {
    const longLocal = "a".repeat(80);
    const label = deriveLabelFromEmail(`${longLocal}@example.com`);
    expect(label.length).toBeLessThanOrEqual(63);
  });

  it("throws for an email with no local part", () => {
    expect(() => deriveLabelFromEmail("@example.com")).toThrow(/missing local part|empty ENS label/);
  });

  it("throws when sanitization empties the label entirely", () => {
    expect(() => deriveLabelFromEmail("...@example.com")).toThrow(/empty ENS label/);
  });

  it("is deterministic for the same email", () => {
    expect(deriveLabelFromEmail("alex@example.com")).toBe(deriveLabelFromEmail("Alex@Example.com  "));
  });
});

describe("userSubname", () => {
  it("builds <label>.<parentName>", () => {
    expect(userSubname("alex", "chainmail.eth")).toBe("alex.chainmail.eth");
  });

  it("throws for an invalid label", () => {
    expect(() => userSubname("Alex", "chainmail.eth")).toThrow(/not a valid ENS label/);
  });
});

describe("agentSubname", () => {
  it("builds agent.<label>.<parentName>, distinct from the user's own subname", () => {
    expect(agentSubname("alex", "chainmail.eth")).toBe("agent.alex.chainmail.eth");
    expect(agentSubname("alex", "chainmail.eth")).not.toBe(userSubname("alex", "chainmail.eth"));
  });

  it("throws for an invalid label", () => {
    expect(() => agentSubname("alex_dev", "chainmail.eth")).toThrow(/not a valid ENS label/);
  });
});
