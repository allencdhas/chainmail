import { describe, expect, it } from "vitest";
import { EnvValidationError, loadEnv } from "../../src/config/env.js";

const VALID_ENV = {
  WALLET_DERIVATION_SALT: "a-server-salt-that-is-at-least-32-chars-long",
  GRAPH_TENANT_ID: "tenant-123",
  GRAPH_CLIENT_ID: "client-123",
  GRAPH_CLIENT_SECRET: "secret-123",
  GRAPH_MAILBOX_USER_ID: "alex@chainmail-hackathon.onmicrosoft.com",
  GRAPH_NOTIFICATION_URL: "https://chainmail.example.com/webhooks/graph",
  GRAPH_WEBHOOK_CLIENT_STATE: "a-shared-webhook-secret",
  ENS_PARENT_NAME: "chainmail.eth",
  ENS_SEPOLIA_RPC_URL: "https://sepolia.example.com/rpc",
  ENS_OWNER_PRIVATE_KEY: `0x${"1".repeat(64)}`,
  TREASURY_PRIVATE_KEY: `0x${"2".repeat(64)}`,
  MAGIC_LINK_JWT_SECRET: "a-jwt-signing-secret-at-least-32-chars",
  PORT: "3000",
};

describe("loadEnv", () => {
  it("parses a fully valid environment", () => {
    const env = loadEnv(VALID_ENV as NodeJS.ProcessEnv);
    expect(env.GRAPH_TENANT_ID).toBe("tenant-123");
    expect(env.PORT).toBe(3000);
  });

  it("defaults PORT to 3000 when omitted", () => {
    const { PORT, ...rest } = VALID_ENV;
    const env = loadEnv(rest as NodeJS.ProcessEnv);
    expect(env.PORT).toBe(3000);
  });

  it("coerces a numeric PORT string", () => {
    const env = loadEnv({ ...VALID_ENV, PORT: "8080" } as NodeJS.ProcessEnv);
    expect(env.PORT).toBe(8080);
  });

  it("throws EnvValidationError with a descriptive message when a field is missing", () => {
    const { GRAPH_TENANT_ID, ...rest } = VALID_ENV;
    expect(() => loadEnv(rest as NodeJS.ProcessEnv)).toThrow(EnvValidationError);
    try {
      loadEnv(rest as NodeJS.ProcessEnv);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(EnvValidationError);
      expect((err as EnvValidationError).message).toContain("GRAPH_TENANT_ID");
    }
  });

  it("rejects a wallet salt shorter than 32 characters", () => {
    expect(() =>
      loadEnv({ ...VALID_ENV, WALLET_DERIVATION_SALT: "too-short" } as NodeJS.ProcessEnv),
    ).toThrow(EnvValidationError);
  });

  it("rejects a non-URL GRAPH_NOTIFICATION_URL", () => {
    expect(() =>
      loadEnv({ ...VALID_ENV, GRAPH_NOTIFICATION_URL: "not-a-url" } as NodeJS.ProcessEnv),
    ).toThrow(EnvValidationError);
  });

  it("rejects a webhook client state shorter than 16 characters", () => {
    expect(() =>
      loadEnv({ ...VALID_ENV, GRAPH_WEBHOOK_CLIENT_STATE: "short" } as NodeJS.ProcessEnv),
    ).toThrow(EnvValidationError);
  });

  it("rejects a non-URL ENS_SEPOLIA_RPC_URL", () => {
    expect(() =>
      loadEnv({ ...VALID_ENV, ENS_SEPOLIA_RPC_URL: "not-a-url" } as NodeJS.ProcessEnv),
    ).toThrow(EnvValidationError);
  });

  it("rejects a malformed ENS_OWNER_PRIVATE_KEY", () => {
    for (const bad of ["0xdeadbeef", "not-hex-at-all", "1".repeat(64)]) {
      expect(() =>
        loadEnv({ ...VALID_ENV, ENS_OWNER_PRIVATE_KEY: bad } as NodeJS.ProcessEnv),
      ).toThrow(EnvValidationError);
    }
  });

  it("rejects a malformed TREASURY_PRIVATE_KEY", () => {
    expect(() =>
      loadEnv({ ...VALID_ENV, TREASURY_PRIVATE_KEY: "not-hex" } as NodeJS.ProcessEnv),
    ).toThrow(EnvValidationError);
  });

  it("rejects a MAGIC_LINK_JWT_SECRET shorter than 32 characters", () => {
    expect(() =>
      loadEnv({ ...VALID_ENV, MAGIC_LINK_JWT_SECRET: "too-short" } as NodeJS.ProcessEnv),
    ).toThrow(EnvValidationError);
  });

  it("rejects a missing ENS_PARENT_NAME", () => {
    const { ENS_PARENT_NAME, ...rest } = VALID_ENV;
    expect(() => loadEnv(rest as NodeJS.ProcessEnv)).toThrow(EnvValidationError);
  });

  it("rejects a non-positive PORT", () => {
    expect(() => loadEnv({ ...VALID_ENV, PORT: "0" } as NodeJS.ProcessEnv)).toThrow(
      EnvValidationError,
    );
    expect(() => loadEnv({ ...VALID_ENV, PORT: "-5" } as NodeJS.ProcessEnv)).toThrow(
      EnvValidationError,
    );
  });

  it("collects multiple issues in a single error", () => {
    try {
      loadEnv({} as NodeJS.ProcessEnv);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(EnvValidationError);
      expect((err as EnvValidationError).issues.length).toBeGreaterThan(1);
    }
  });
});
