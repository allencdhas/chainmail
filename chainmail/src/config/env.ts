import { z } from "zod";

/**
 * Zod-validated environment loading. `loadEnv` takes an explicit source
 * object (defaulting to `process.env`) so it stays a pure, unit-testable
 * function rather than a hidden global-state read.
 */
const envSchema = z.object({
  // --- Wallet ---
  WALLET_DERIVATION_SALT: z
    .string()
    .min(32, "WALLET_DERIVATION_SALT must be at least 32 characters"),

  // --- Microsoft Graph / Azure AD ---
  GRAPH_TENANT_ID: z.string().min(1),
  GRAPH_CLIENT_ID: z.string().min(1),
  GRAPH_CLIENT_SECRET: z.string().min(1),
  /** The mailbox this app acts on, e.g. a UPN or object id (application permissions use /users/{id}, never /me). */
  GRAPH_MAILBOX_USER_ID: z.string().min(1),
  /** Public HTTPS URL Graph will POST change notifications to. */
  GRAPH_NOTIFICATION_URL: z.string().url(),
  /** Shared secret Graph echoes back on every notification; used to authenticate payloads. */
  GRAPH_WEBHOOK_CLIENT_STATE: z.string().min(16),

  // --- ENSv2 (Sepolia) ---
  /** The registered parent name, e.g. "chainmail.eth". */
  ENS_PARENT_NAME: z.string().min(1),
  /** Sepolia JSON-RPC endpoint used for both reads and writes. */
  ENS_SEPOLIA_RPC_URL: z.string().url(),
  /** Private key of the EOA that owns ENS_PARENT_NAME and can call authorize*Roles. Testnet only. */
  ENS_OWNER_PRIVATE_KEY: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/, "ENS_OWNER_PRIVATE_KEY must be a 0x-prefixed 32-byte hex string"),

  // --- Settlement (Sepolia USDC) ---
  /** Private key of the pre-funded treasury wallet that sends USDC to Payees at settlement. Testnet only. */
  TREASURY_PRIVATE_KEY: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/, "TREASURY_PRIVATE_KEY must be a 0x-prefixed 32-byte hex string"),

  // --- Auth (magic link / payment tokens) ---
  MAGIC_LINK_JWT_SECRET: z.string().min(32),

  PORT: z.coerce.number().int().positive().default(3000),
});

export type Env = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {
  constructor(public readonly issues: z.ZodIssue[]) {
    super(
      `Invalid environment configuration:\n${issues
        .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join("\n")}`,
    );
    this.name = "EnvValidationError";
  }
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new EnvValidationError(result.error.issues);
  }
  return result.data;
}
