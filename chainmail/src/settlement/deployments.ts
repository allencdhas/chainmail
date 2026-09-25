/**
 * Circle-issued USDC on Ethereum Sepolia testnet. Sourced from Circle's
 * developer docs (developers.circle.com/stablecoins/usdc-contract-addresses
 * and the Circle skill's EVM testnet quick-reference table), fetched
 * 2026-09-25. This is the canonical Circle-issued token — never a bridged
 * variant (USDbC/USDC.e) — and always 6 decimals.
 */
export const SEPOLIA_USDC = {
  chainId: 11_155_111,
  address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  decimals: 6,
} as const;
