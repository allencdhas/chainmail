import type { PrivateKeyAccount } from "viem/accounts";

/**
 * CUSTODY MODEL — read before use elsewhere in the codebase.
 *
 * This wallet is derived from `keccak256(email + serverSalt)`. Because the
 * server holds `serverSalt`, the server can always re-derive the private key
 * and sign on the wallet's behalf. That makes this an **app-managed test
 * wallet**, not a non-custodial wallet — do not describe it as non-custodial
 * in docs, UI copy, or demo scripts. "Non-custodial" is reserved exclusively
 * for the WalletConnect-connected path, where ChainMail never touches keys.
 */
export interface AppManagedWallet {
  readonly address: `0x${string}`;
  readonly account: PrivateKeyAccount;
}
