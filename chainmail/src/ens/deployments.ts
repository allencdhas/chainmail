/**
 * ENSv2 Sepolia (beta) contract addresses, sourced from
 * docs.ens.domains/learn/deployments (fetched 2026-09-25).
 *
 * ENSv2 on Sepolia is an active beta — that same docs page notes at least
 * one temporary re-pointing of the Universal Resolver during this hackathon
 * window. RE-VERIFY every address here against that page immediately before
 * the demo, not just once during development.
 */
export const ENS_V2_SEPOLIA = {
  chainId: 11_155_111,
  ethRegistrar: "0xa88553f454b77203b0d036a05c894d555eaaa2cc",
  ethRegistry: "0xbdc85dd5b15d7ecb354cd7cb6f2c50b4f2c4f0e2",
  universalResolverV2: "0x4a1817d13e9cf196f471725176355c1234b63c70",
  publicEntrypointUniversalResolver: "0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe",
  userRegistryImpl: "0x624a25d67b59d587752ebec8dded8827dae52050",
  verifiableFactory: "0x10dc6333cdfe1fcef624c6e0a8221b91804cd7ef",
} as const;

const ADDRESS_KEYS = [
  "ethRegistrar",
  "ethRegistry",
  "universalResolverV2",
  "publicEntrypointUniversalResolver",
  "userRegistryImpl",
  "verifiableFactory",
] as const satisfies readonly (keyof typeof ENS_V2_SEPOLIA)[];

export function ensV2SepoliaAddressEntries(): ReadonlyArray<
  readonly [(typeof ADDRESS_KEYS)[number], string]
> {
  return ADDRESS_KEYS.map((key) => [key, ENS_V2_SEPOLIA[key]] as const);
}
