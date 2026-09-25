import { describe, expect, it } from "vitest";
import { buildEmailUserMessage, buildSystemPrompt } from "../../src/agent/prompts.js";

describe("buildSystemPrompt", () => {
  const prompt = buildSystemPrompt();

  it("instructs the agent to only propose, never execute", () => {
    expect(prompt).toMatch(/never execute a payment/i);
  });

  it("mentions all three tools by name", () => {
    expect(prompt).toContain("check_duplicate");
    expect(prompt).toContain("check_policy_limits");
    expect(prompt).toContain("create_invoice");
  });

  it("instructs skipping create_invoice when a duplicate is found", () => {
    expect(prompt).toMatch(/do not call create_invoice/i);
  });

  it("prohibits claiming a payment has been sent", () => {
    expect(prompt).toMatch(/never claim a payment has been sent/i);
  });
});

describe("buildEmailUserMessage", () => {
  it("includes the from address, subject, and body", () => {
    const message = buildEmailUserMessage({
      from: "alex@example.com",
      subject: "bill alex $500",
      body: "please bill client@example.com $500 for the logo work",
    });

    expect(message).toContain("alex@example.com");
    expect(message).toContain("bill alex $500");
    expect(message).toContain("please bill client@example.com $500 for the logo work");
  });

  it("places the body after the headers", () => {
    const message = buildEmailUserMessage({ from: "a@x.com", subject: "S", body: "BODYTEXT" });
    expect(message.indexOf("BODYTEXT")).toBeGreaterThan(message.indexOf("S"));
  });
});
