import { describe, expect, it } from "vitest";
import { ENS_V2_SEPOLIA, ensV2SepoliaAddressEntries } from "../../src/ens/deployments.js";

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

describe("ENS_V2_SEPOLIA", () => {
  it("targets Sepolia's chain id", () => {
    expect(ENS_V2_SEPOLIA.chainId).toBe(11_155_111);
  });

  it("every contract address is a well-formed 20-byte hex address", () => {
    for (const [key, address] of ensV2SepoliaAddressEntries()) {
      expect(address, `${key} should be a valid 0x address`).toMatch(ADDRESS_PATTERN);
    }
  });

  it("all documented addresses are distinct", () => {
    const addresses = ensV2SepoliaAddressEntries().map(([, address]) => address.toLowerCase());
    expect(new Set(addresses).size).toBe(addresses.length);
  });
});
