import { describe, expect, it } from "vitest";
import { tryHandleValidationHandshake } from "../../src/graph/webhookValidation.js";

describe("tryHandleValidationHandshake", () => {
  it("responds with the exact token when present", () => {
    const result = tryHandleValidationHandshake({ validationToken: "abc123==" });
    expect(result.isValidationRequest).toBe(true);
    if (result.isValidationRequest) {
      expect(result.status).toBe(200);
      expect(result.contentType).toBe("text/plain");
      expect(result.body).toBe("abc123==");
    }
  });

  it("preserves special characters verbatim without re-encoding", () => {
    const token = "token with spaces & symbols += /?";
    const result = tryHandleValidationHandshake({ validationToken: token });
    expect(result.isValidationRequest).toBe(true);
    if (result.isValidationRequest) {
      expect(result.body).toBe(token);
    }
  });

  it("returns isValidationRequest: false when no token is present", () => {
    const result = tryHandleValidationHandshake({});
    expect(result.isValidationRequest).toBe(false);
  });

  it("treats an empty-string token as not a validation request", () => {
    const result = tryHandleValidationHandshake({ validationToken: "" });
    expect(result.isValidationRequest).toBe(false);
  });

  it("treats a whitespace-only token as not a validation request", () => {
    const result = tryHandleValidationHandshake({ validationToken: "   " });
    expect(result.isValidationRequest).toBe(false);
  });

  it("takes the first value when validationToken is passed as an array", () => {
    const result = tryHandleValidationHandshake({ validationToken: ["first-token", "second-token"] });
    expect(result.isValidationRequest).toBe(true);
    if (result.isValidationRequest) {
      expect(result.body).toBe("first-token");
    }
  });

  it("ignores unrelated query parameters", () => {
    const result = tryHandleValidationHandshake({ foo: "bar", validationToken: "real-token" });
    expect(result.isValidationRequest).toBe(true);
    if (result.isValidationRequest) {
      expect(result.body).toBe("real-token");
    }
  });
});
