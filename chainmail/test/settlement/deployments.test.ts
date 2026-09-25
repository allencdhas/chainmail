import { describe, expect, it } from "vitest";
import { SEPOLIA_USDC } from "../../src/settlement/deployments.js";

describe("SEPOLIA_USDC", () => {
  it("targets Sepolia's chain id", () => {
    expect(SEPOLIA_USDC.chainId).toBe(11_155_111);
  });

  it("is a well-formed 20-byte hex address", () => {
    expect(SEPOLIA_USDC.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("uses 6 decimals, never 18", () => {
    expect(SEPOLIA_USDC.decimals).toBe(6);
  });
});
