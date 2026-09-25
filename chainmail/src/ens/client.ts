import { createPublicClient, createWalletClient, http, type Address, type Hash } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import type { Env } from "../config/env.js";
import { ENS_V2_SEPOLIA } from "./deployments.js";
import type { AuthorizeProposalTextRoleRequest } from "./proposalRecord.js";
import { PROPOSAL_TEXT_KEY } from "./proposalRecord.js";

/**
 * INTEGRATION-ONLY MODULE — not covered by unit tests, mirroring
 * `graph/client.ts`'s status for the same reason: this wraps real on-chain
 * calls against a beta testnet deployment and cannot be meaningfully unit
 * tested without either a live Sepolia RPC endpoint or reimplementing a
 * chain simulator — neither is worth the cost here. All logic that CAN be
 * tested in isolation (role-bitmap math, DNS name encoding, subname/label
 * derivation, proposal-record schema, request-argument builders) lives in
 * sibling files with full unit test coverage; this file only wires that
 * logic to the real network.
 *
 * ⚠ ABI CAVEAT: the ABI fragments below are inferred from documented
 * function signatures (docs.ens.domains/ensv2/permissioned-resolver) and
 * have NOT been checked against the live deployed ABI. Per ENS's own
 * readiness docs, ENSv2 write-path libraries are preview-quality and the
 * Sepolia deployment is an active beta. Before relying on this in a demo:
 *   1. Fetch the actual PermissionedResolver ABI (Etherscan or the
 *      contracts-v2 repo) for the address the target subname's resolver
 *      actually uses (each subname gets its own resolver instance).
 *   2. Diff it against `PERMISSIONED_RESOLVER_ABI` below and correct any
 *      mismatches before the first real transaction.
 *   3. Re-check `deployments.ts` addresses the same day as the demo.
 */

const PERMISSIONED_RESOLVER_ABI = [
  {
    type: "function",
    name: "authorizeTextRoles",
    stateMutability: "nonpayable",
    inputs: [
      { name: "toName", type: "bytes" },
      { name: "key", type: "string" },
      { name: "account", type: "address" },
      { name: "grant", type: "bool" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "setText",
    stateMutability: "nonpayable",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" },
      { name: "value", type: "string" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "text",
    stateMutability: "view",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" },
    ],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

export function createEnsPublicClient(rpcUrl: string) {
  return createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
}

export function createEnsWalletClient(rpcUrl: string, ownerPrivateKey: `0x${string}`) {
  const account = privateKeyToAccount(ownerPrivateKey);
  return createWalletClient({ account, chain: sepolia, transport: http(rpcUrl) });
}

export class EnsWriteClient {
  constructor(
    private readonly publicClient: ReturnType<typeof createEnsPublicClient>,
    private readonly walletClient: ReturnType<typeof createEnsWalletClient>,
  ) {}

  static fromEnv(env: Pick<Env, "ENS_SEPOLIA_RPC_URL" | "ENS_OWNER_PRIVATE_KEY">): EnsWriteClient {
    return new EnsWriteClient(
      createEnsPublicClient(env.ENS_SEPOLIA_RPC_URL),
      createEnsWalletClient(env.ENS_SEPOLIA_RPC_URL, env.ENS_OWNER_PRIVATE_KEY as `0x${string}`),
    );
  }

  /**
   * Grants (or revokes) the narrowly-scoped ROLE_SET_TEXT permission for the
   * `chainmail.proposal` key on the given resolver, per the corrected ENS
   * Integration design (see proposalRecord.ts doc comment) — never used to
   * gate spending, only this one text record.
   */
  async authorizeProposalTextRole(
    resolverAddress: Address,
    request: AuthorizeProposalTextRoleRequest,
  ): Promise<Hash> {
    return this.walletClient.writeContract({
      address: resolverAddress,
      abi: PERMISSIONED_RESOLVER_ABI,
      functionName: "authorizeTextRoles",
      args: [request.toName, request.key, request.account, request.grant],
      chain: sepolia,
    });
  }

  async setProposalTextRecord(
    resolverAddress: Address,
    node: `0x${string}`,
    value: string,
  ): Promise<Hash> {
    return this.walletClient.writeContract({
      address: resolverAddress,
      abi: PERMISSIONED_RESOLVER_ABI,
      functionName: "setText",
      args: [node, PROPOSAL_TEXT_KEY, value],
      chain: sepolia,
    });
  }

  async readProposalTextRecord(resolverAddress: Address, node: `0x${string}`): Promise<string> {
    return this.publicClient.readContract({
      address: resolverAddress,
      abi: PERMISSIONED_RESOLVER_ABI,
      functionName: "text",
      args: [node, PROPOSAL_TEXT_KEY],
    });
  }
}

/** Re-exported so callers only need to import from this one integration module. */
export { ENS_V2_SEPOLIA };
