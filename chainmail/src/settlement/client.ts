import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hash,
  type TransactionReceipt,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { SEPOLIA_USDC } from "./deployments.js";
import { usdToUsdcAtomicUnits } from "./usdcTransfer.js";

/**
 * INTEGRATION-ONLY MODULE — not covered by unit tests, for the same reason
 * as every other `client.ts` in this repo: it sends a real on-chain
 * transaction and cannot be meaningfully unit tested without a live Sepolia
 * RPC endpoint. All logic that CAN be tested in isolation (USD/USDC unit
 * conversion, the settlement-time policy re-check) lives in
 * `usdcTransfer.ts` and `evaluateSettlement.ts` with full unit test
 * coverage; this file only wires that logic to the real network.
 *
 * Unlike `ens/client.ts`, the ABI here is the standard ERC-20
 * `transfer`/`balanceOf` interface — not a project-specific contract — so
 * there is materially less ABI-mismatch risk. Still confirm the treasury
 * wallet is funded (via faucet.circle.com, 20 USDC/2h per address) before
 * the demo.
 */

const ERC20_TRANSFER_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export class SettlementClient {
  private constructor(
    private readonly publicClient: ReturnType<typeof createPublicClient>,
    private readonly walletClient: ReturnType<typeof createWalletClient>,
    private readonly treasuryAddress: Address,
  ) {}

  static create(rpcUrl: string, treasuryPrivateKey: `0x${string}`): SettlementClient {
    const account = privateKeyToAccount(treasuryPrivateKey);
    const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
    const walletClient = createWalletClient({ account, chain: sepolia, transport: http(rpcUrl) });
    return new SettlementClient(publicClient, walletClient, account.address);
  }

  async getTreasuryUsdcBalance(): Promise<bigint> {
    return this.publicClient.readContract({
      address: SEPOLIA_USDC.address,
      abi: ERC20_TRANSFER_ABI,
      functionName: "balanceOf",
      args: [this.treasuryAddress],
    });
  }

  /** Submits the transfer and returns immediately with the transaction hash — does not wait for confirmation. */
  async transferUsdc(to: Address, amountUsd: number): Promise<Hash> {
    const amountAtomic = usdToUsdcAtomicUnits(amountUsd);
    return this.walletClient.writeContract({
      address: SEPOLIA_USDC.address,
      abi: ERC20_TRANSFER_ABI,
      functionName: "transfer",
      args: [to, amountAtomic],
      chain: sepolia,
      account: this.walletClient.account!,
    });
  }

  async waitForConfirmation(hash: Hash): Promise<TransactionReceipt> {
    return this.publicClient.waitForTransactionReceipt({ hash });
  }
}
