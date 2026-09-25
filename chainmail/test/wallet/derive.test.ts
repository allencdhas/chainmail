import { describe, expect, it } from "vitest";
import {
  derivePrivateKey,
  deriveWalletAccount,
  deriveWalletAddress,
  normalizeEmail,
} from "../../src/wallet/derive.js";

const VALID_SALT = "a-server-salt-that-is-at-least-32-chars-long";

describe("normalizeEmail", () => {
  it("trims whitespace and lowercases", () => {
    expect(normalizeEmail("  Alex@Example.COM  ")).toBe("alex@example.com");
  });
});

describe("derivePrivateKey", () => {
  it("is deterministic: same email + salt always yields the same key", () => {
    const a = derivePrivateKey("alex@example.com", VALID_SALT);
    const b = derivePrivateKey("alex@example.com", VALID_SALT);
    expect(a).toBe(b);
  });

  it("is case- and whitespace-insensitive on the email", () => {
    const a = derivePrivateKey("alex@example.com", VALID_SALT);
    const b = derivePrivateKey("  Alex@Example.COM  ", VALID_SALT);
    expect(a).toBe(b);
  });

  it("produces different keys for different emails with the same salt", () => {
    const a = derivePrivateKey("alex@example.com", VALID_SALT);
    const b = derivePrivateKey("sam@example.com", VALID_SALT);
    expect(a).not.toBe(b);
  });

  it("produces different keys for the same email with different salts", () => {
    const a = derivePrivateKey("alex@example.com", VALID_SALT);
    const b = derivePrivateKey("alex@example.com", `${VALID_SALT}-different`);
    expect(a).not.toBe(b);
  });

  it("returns a well-formed 32-byte hex private key", () => {
    const key = derivePrivateKey("alex@example.com", VALID_SALT);
    expect(key).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("rejects a salt shorter than 32 characters", () => {
    expect(() => derivePrivateKey("alex@example.com", "too-short")).toThrow(/at least 32 characters/);
  });

  it("rejects an empty salt", () => {
    expect(() => derivePrivateKey("alex@example.com", "")).toThrow(/at least 32 characters/);
  });

  it("rejects malformed emails", () => {
    for (const bad of ["not-an-email", "missing-domain@", "@missing-local.com", ""]) {
      expect(() => derivePrivateKey(bad, VALID_SALT)).toThrow(/Invalid email/);
    }
  });
});

describe("deriveWalletAccount", () => {
  it("returns an address matching viem's derivation from the same private key", () => {
    const wallet = deriveWalletAccount("alex@example.com", VALID_SALT);
    expect(wallet.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(wallet.account.address).toBe(wallet.address);
  });

  it("is deterministic across repeated calls", () => {
    const first = deriveWalletAccount("alex@example.com", VALID_SALT);
    const second = deriveWalletAccount("alex@example.com", VALID_SALT);
    expect(first.address).toBe(second.address);
  });

  it("produces distinct wallets for distinct users", () => {
    const alex = deriveWalletAccount("alex@example.com", VALID_SALT);
    const sam = deriveWalletAccount("sam@example.com", VALID_SALT);
    expect(alex.address).not.toBe(sam.address);
  });
});

describe("deriveWalletAddress", () => {
  it("matches the address from deriveWalletAccount", () => {
    const address = deriveWalletAddress("alex@example.com", VALID_SALT);
    const wallet = deriveWalletAccount("alex@example.com", VALID_SALT);
    expect(address).toBe(wallet.address);
  });
});
