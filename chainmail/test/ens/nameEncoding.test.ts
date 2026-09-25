import { describe, expect, it } from "vitest";
import { decodeDnsName, dnsEncodeName } from "../../src/ens/nameEncoding.js";

describe("dnsEncodeName", () => {
  it("matches the well-known test vector for a single label ('eth')", () => {
    expect(dnsEncodeName("eth")).toBe("0x0365746800");
  });

  it("encodes the root name as a single zero byte", () => {
    expect(dnsEncodeName("")).toBe("0x00");
    expect(dnsEncodeName(".")).toBe("0x00");
  });

  it("encodes a two-label name with correct length prefixes", () => {
    // "a.b" -> [len=1]'a'(0x61) [len=1]'b'(0x62) [terminator=0]
    expect(dnsEncodeName("a.b")).toBe("0x0161016200");
  });

  it("trims surrounding whitespace before encoding", () => {
    expect(dnsEncodeName("  eth  ")).toBe(dnsEncodeName("eth"));
  });

  it("round-trips through decodeDnsName for realistic ChainMail names", () => {
    for (const name of ["eth", "chainmail.eth", "alex.chainmail.eth", "agent.alex.chainmail.eth"]) {
      expect(decodeDnsName(dnsEncodeName(name))).toBe(name);
    }
  });

  it("accepts digits and hyphens within labels", () => {
    expect(decodeDnsName(dnsEncodeName("alex-2.chainmail.eth"))).toBe("alex-2.chainmail.eth");
  });

  it("rejects a label containing uppercase characters", () => {
    expect(() => dnsEncodeName("Alex.chainmail.eth")).toThrow(/not a simple lowercase ASCII/);
  });

  it("rejects a label containing an underscore or other disallowed character", () => {
    expect(() => dnsEncodeName("alex_dev.chainmail.eth")).toThrow(/not a simple lowercase ASCII/);
  });

  it("rejects an empty label from consecutive dots", () => {
    expect(() => dnsEncodeName("alex..chainmail.eth")).toThrow(/not a simple lowercase ASCII/);
  });

  it("rejects a label longer than 63 bytes", () => {
    const tooLong = "a".repeat(64);
    // 64 a's still matches the simple-ascii pattern, so this should fail on the length check.
    expect(() => dnsEncodeName(`${tooLong}.eth`)).toThrow(/exceeds 63 bytes/);
  });
});

describe("decodeDnsName", () => {
  it("decodes the well-known 'eth' vector", () => {
    expect(decodeDnsName("0x0365746800")).toBe("eth");
  });

  it("decodes the root name", () => {
    expect(decodeDnsName("0x00")).toBe("");
  });

  it("throws on a buffer missing its terminating zero byte", () => {
    // Full "eth" label (03 65 74 68) with the trailing 00 terminator stripped.
    expect(() => decodeDnsName("0x03657468")).toThrow(/missing terminating zero byte/);
  });

  it("throws when a label length byte exceeds the remaining buffer", () => {
    expect(() => decodeDnsName("0xff657468")).toThrow(/label length exceeds buffer/);
  });
});
