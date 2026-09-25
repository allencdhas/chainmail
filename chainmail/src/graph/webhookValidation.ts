/**
 * Handles the Graph subscription-creation validation handshake.
 *
 * When a subscription is created or renewed, Microsoft Graph sends a POST to
 * `notificationUrl` with `?validationToken=<token>` in the query string and
 * an empty body. The endpoint must respond within 10 seconds with:
 *   - HTTP 200
 *   - Content-Type: text/plain
 *   - Body: the *plain text*, URL-decoded validation token, verbatim
 *
 * Returning an encoded token, a non-200 status, or a non-text/plain content
 * type all cause subscription creation to fail.
 *
 * This function is framework-agnostic: pass whatever query-parameter map
 * your HTTP layer parsed (Express's `req.query` already URL-decodes values,
 * so no further decoding is applied here).
 */

export interface ValidationHandshakeResponse {
  readonly isValidationRequest: true;
  readonly status: 200;
  readonly contentType: "text/plain";
  readonly body: string;
}

export interface NotAValidationRequest {
  readonly isValidationRequest: false;
}

export type ValidationHandshakeResult = ValidationHandshakeResponse | NotAValidationRequest;

type QueryValue = string | readonly string[] | undefined;

function extractSingleValue(value: QueryValue): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return typeof value === "string" ? value : undefined;
}

export function tryHandleValidationHandshake(
  query: Readonly<Record<string, QueryValue>>,
): ValidationHandshakeResult {
  const rawToken = extractSingleValue(query["validationToken"]);

  if (!rawToken || rawToken.trim().length === 0) {
    return { isValidationRequest: false };
  }

  return {
    isValidationRequest: true,
    status: 200,
    contentType: "text/plain",
    // Echoed verbatim (not trimmed) — Graph requires the exact token back.
    body: rawToken,
  };
}
