import { describe, expect, it } from "vitest";
import { dnsEncodeName } from "../../src/ens/nameEncoding.js";
import {
  PROPOSAL_TEXT_KEY,
  buildAuthorizeProposalTextRoleRequest,
  buildProposalRecordValue,
  parseProposalRecordValue,
  serializeProposalRecordValue,
} from "../../src/ens/proposalRecord.js";

const AGENT_ADDRESS = "0x000000000000000000000000000000000000aa" as const;
const NOW = new Date("2026-09-25T12:00:00.000Z");

describe("buildProposalRecordValue", () => {
  it("always encodes canPropose: true, canExecuteAboveThreshold: false", () => {
    const value = buildProposalRecordValue({ secondConfirmationThresholdUsd: 500, now: NOW });
    expect(value.canPropose).toBe(true);
    expect(value.canExecuteAboveThreshold).toBe(false);
  });

  it("carries through the threshold and stamps updatedAt", () => {
    const value = buildProposalRecordValue({ secondConfirmationThresholdUsd: 500, now: NOW });
    expect(value.secondConfirmationThresholdUsd).toBe(500);
    expect(value.updatedAt).toBe(NOW.toISOString());
  });

  it("defaults updatedAt to the current time when now is omitted", () => {
    const before = Date.now();
    const value = buildProposalRecordValue({ secondConfirmationThresholdUsd: 500 });
    const after = Date.now();
    const stamped = new Date(value.updatedAt).getTime();
    expect(stamped).toBeGreaterThanOrEqual(before);
    expect(stamped).toBeLessThanOrEqual(after);
  });

  it("rejects a non-positive threshold", () => {
    expect(() => buildProposalRecordValue({ secondConfirmationThresholdUsd: 0 })).toThrow(
      /positive finite number/,
    );
    expect(() => buildProposalRecordValue({ secondConfirmationThresholdUsd: -1 })).toThrow(
      /positive finite number/,
    );
  });

  it("rejects a non-finite threshold", () => {
    expect(() =>
      buildProposalRecordValue({ secondConfirmationThresholdUsd: Number.NaN }),
    ).toThrow(/positive finite number/);
  });
});

describe("serializeProposalRecordValue / parseProposalRecordValue", () => {
  it("round-trips a valid value", () => {
    const value = buildProposalRecordValue({ secondConfirmationThresholdUsd: 500, now: NOW });
    const serialized = serializeProposalRecordValue(value);
    expect(parseProposalRecordValue(serialized)).toEqual(value);
  });

  it("throws on malformed JSON", () => {
    expect(() => parseProposalRecordValue("not json")).toThrow(/not valid JSON/);
  });

  it("throws when canPropose is not exactly true", () => {
    expect(() =>
      parseProposalRecordValue(JSON.stringify({ canPropose: false, canExecuteAboveThreshold: false, secondConfirmationThresholdUsd: 1, updatedAt: NOW.toISOString() })),
    ).toThrow(/unexpected shape/);
  });

  it("throws when canExecuteAboveThreshold is not exactly false", () => {
    expect(() =>
      parseProposalRecordValue(JSON.stringify({ canPropose: true, canExecuteAboveThreshold: true, secondConfirmationThresholdUsd: 1, updatedAt: NOW.toISOString() })),
    ).toThrow(/unexpected shape/);
  });

  it("throws when required fields are missing or mistyped", () => {
    expect(() =>
      parseProposalRecordValue(JSON.stringify({ canPropose: true, canExecuteAboveThreshold: false })),
    ).toThrow(/unexpected shape/);
    expect(() =>
      parseProposalRecordValue(
        JSON.stringify({
          canPropose: true,
          canExecuteAboveThreshold: false,
          secondConfirmationThresholdUsd: "500",
          updatedAt: NOW.toISOString(),
        }),
      ),
    ).toThrow(/unexpected shape/);
  });

  it("throws on a JSON array or primitive instead of an object", () => {
    expect(() => parseProposalRecordValue("[]")).toThrow(/unexpected shape/);
    expect(() => parseProposalRecordValue("null")).toThrow(/unexpected shape/);
    expect(() => parseProposalRecordValue("42")).toThrow(/unexpected shape/);
  });
});

describe("buildAuthorizeProposalTextRoleRequest", () => {
  it("DNS-encodes the agent subname and uses the fixed proposal text key", () => {
    const request = buildAuthorizeProposalTextRoleRequest({
      agentSubname: "agent.alex.chainmail.eth",
      agentAddress: AGENT_ADDRESS,
    });

    expect(request.toName).toBe(dnsEncodeName("agent.alex.chainmail.eth"));
    expect(request.key).toBe(PROPOSAL_TEXT_KEY);
    expect(request.account).toBe(AGENT_ADDRESS);
  });

  it("defaults grant to true", () => {
    const request = buildAuthorizeProposalTextRoleRequest({
      agentSubname: "agent.alex.chainmail.eth",
      agentAddress: AGENT_ADDRESS,
    });
    expect(request.grant).toBe(true);
  });

  it("allows an explicit grant: false to build a revocation request", () => {
    const request = buildAuthorizeProposalTextRoleRequest({
      agentSubname: "agent.alex.chainmail.eth",
      agentAddress: AGENT_ADDRESS,
      grant: false,
    });
    expect(request.grant).toBe(false);
  });
});
