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
