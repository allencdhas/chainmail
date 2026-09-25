/**
 * USD <-> USDC atomic-unit conversion. USDC uses 6 decimals on every EVM
 * chain (never 18 — a common ERC-20 mistake per Circle's own guidance),
 * so $500.00 is `500_000_000n` base units.
 */

export const USDC_DECIMALS = 6;
const ATOMIC_UNITS_PER_USDC = 10 ** USDC_DECIMALS;

export function usdToUsdcAtomicUnits(amountUsd: number): bigint {
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
    throw new Error(`amountUsd must be a positive finite number, got ${amountUsd}.`);
  }
  // Round rather than truncate, so e.g. $1.2345678 (more precision than USDC
  // supports) rounds to the nearest atomic unit instead of silently losing
  // the payer's intended amount downward.
  return BigInt(Math.round(amountUsd * ATOMIC_UNITS_PER_USDC));
}

export function usdcAtomicUnitsToUsd(atomicUnits: bigint): number {
  return Number(atomicUnits) / ATOMIC_UNITS_PER_USDC;
}

export interface UsdcTransferCallArgs {
  readonly functionName: "transfer";
  readonly args: readonly [`0x${string}`, bigint];
}

/** Builds the argument tuple for a standard ERC-20 `transfer(address,uint256)` call. Pure, so it's testable without touching a real contract. */
export function buildUsdcTransferCallArgs(params: {
  readonly to: `0x${string}`;
  readonly amountUsd: number;
}): UsdcTransferCallArgs {
  return {
    functionName: "transfer",
    args: [params.to, usdToUsdcAtomicUnits(params.amountUsd)],
  };
}
