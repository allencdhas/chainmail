import { describe, expect, it } from "vitest";
import {
  USDC_DECIMALS,
  buildUsdcTransferCallArgs,
  usdcAtomicUnitsToUsd,
  usdToUsdcAtomicUnits,
} from "../../src/settlement/usdcTransfer.js";

const RECIPIENT = "0x000000000000000000000000000000000000aa" as const;

describe("usdToUsdcAtomicUnits", () => {
  it("uses 6 decimals", () => {
    expect(USDC_DECIMALS).toBe(6);
  });

  it("converts a whole-dollar amount correctly", () => {
    expect(usdToUsdcAtomicUnits(500)).toBe(500_000_000n);
  });

  it("converts a cents-precision amount correctly", () => {
    expect(usdToUsdcAtomicUnits(0.01)).toBe(10_000n);
  });

  it("converts the smallest representable unit correctly", () => {
    expect(usdToUsdcAtomicUnits(0.000001)).toBe(1n);
  });

  it("rounds amounts with more precision than USDC supports, rather than truncating", () => {
    // 1.2345678 * 1e6 = 1234567.8 -> rounds to 1234568
    expect(usdToUsdcAtomicUnits(1.2345678)).toBe(1_234_568n);
  });

  it("returns a bigint", () => {
    expect(typeof usdToUsdcAtomicUnits(1)).toBe("bigint");
  });

  it("rejects zero", () => {
    expect(() => usdToUsdcAtomicUnits(0)).toThrow(/positive finite number/);
  });

  it("rejects negative amounts", () => {
    expect(() => usdToUsdcAtomicUnits(-5)).toThrow(/positive finite number/);
  });

  it("rejects NaN and Infinity", () => {
    expect(() => usdToUsdcAtomicUnits(Number.NaN)).toThrow(/positive finite number/);
    expect(() => usdToUsdcAtomicUnits(Number.POSITIVE_INFINITY)).toThrow(/positive finite number/);
  });
});

describe("usdcAtomicUnitsToUsd", () => {
  it("round-trips through usdToUsdcAtomicUnits for whole and fractional dollar amounts", () => {
    for (const amount of [500, 0.01, 1.5, 999.99]) {
      expect(usdcAtomicUnitsToUsd(usdToUsdcAtomicUnits(amount))).toBeCloseTo(amount, 6);
    }
  });

  it("converts a known atomic value back to dollars", () => {
    expect(usdcAtomicUnitsToUsd(500_000_000n)).toBe(500);
  });
});

describe("buildUsdcTransferCallArgs", () => {
  it("builds a transfer call with the recipient and atomic amount", () => {
    const call = buildUsdcTransferCallArgs({ to: RECIPIENT, amountUsd: 500 });
    expect(call.functionName).toBe("transfer");
    expect(call.args).toEqual([RECIPIENT, 500_000_000n]);
  });

  it("propagates validation errors from usdToUsdcAtomicUnits for invalid amounts", () => {
    expect(() => buildUsdcTransferCallArgs({ to: RECIPIENT, amountUsd: -1 })).toThrow(/positive finite number/);
  });
});
