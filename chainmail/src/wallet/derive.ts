import { keccak256, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { AppManagedWallet } from "./types.js";

const MIN_SALT_LENGTH = 32;
const DERIVATION_DOMAIN = "chainmail:wallet:v1";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function assertValidSalt(serverSalt: string): void {
  if (typeof serverSalt !== "string" || serverSalt.length < MIN_SALT_LENGTH) {
    throw new Error(
      `serverSalt must be a string of at least ${MIN_SALT_LENGTH} characters to provide adequate entropy.`,
    );
  }
}

function assertValidEmail(email: string): string {
  const normalized = normalizeEmail(email);
  if (!EMAIL_PATTERN.test(normalized)) {
    throw new Error(`Invalid email for wallet derivation: "${email}"`);
  }
  return normalized;
}

/**
 * Deterministically derives a private key from a verified email + server
 * salt. Same (email, salt) pair always yields the same key — this is what
 * lets ChainMail "create" a wallet on demand without persisting a raw key.
 *
 * See `AppManagedWallet` doc comment for the custody tradeoff this implies.
 */
export function derivePrivateKey(email: string, serverSalt: string): `0x${string}` {
  assertValidSalt(serverSalt);
  const normalizedEmail = assertValidEmail(email);
  const material = `${DERIVATION_DOMAIN}:${normalizedEmail}:${serverSalt}`;
  return keccak256(toBytes(material));
}

/**
 * Derives the full viem account (address + signing capability) on demand.
 * Never persist the returned account's private key material; regenerate it
 * from (email, salt) whenever it's needed instead.
 */
export function deriveWalletAccount(email: string, serverSalt: string): AppManagedWallet {
  const privateKey = derivePrivateKey(email, serverSalt);
  const account = privateKeyToAccount(privateKey);
  return { address: account.address, account };
}

/** Convenience helper when only the address is needed (e.g. ENS resolution). */
export function deriveWalletAddress(email: string, serverSalt: string): `0x${string}` {
  return deriveWalletAccount(email, serverSalt).address;
}
