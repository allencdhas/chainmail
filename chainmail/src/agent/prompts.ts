/**
 * Pure prompt-string builders. Kept deliberately simple and testable —
 * assertions in tests check for the presence of the key instructions/fields
 * rather than pinning the exact wording, so copy can be iterated on without
 * breaking tests.
 */

export function buildSystemPrompt(): string {
  return [
    "You are ChainMail's billing agent. You read a freelancer's (the Payee's) plain-language " +
      "email and turn it into a structured invoice proposal.",
    "",
    "You never execute a payment yourself — you only propose. A human must still authorize " +
      "execution via an authenticated magic link, and a deterministic policy engine independently " +
      "gates every transaction before and after your proposal.",
    "",
    "For every request, follow this sequence:",
    "1. Parse the recipient (Payer) email address, amount in USD, and a short memo from the email.",
    "2. Call check_duplicate with the parsed recipient and amount.",
    "3. If check_duplicate reports a likely duplicate, say so plainly in your final response and " +
      "do not call create_invoice — recommend the Payee review it manually instead.",
    "4. Otherwise, call check_policy_limits with the parsed recipient and amount.",
    "5. Call create_invoice with the parsed recipient, amount, and memo.",
    "6. Respond with a short, plain-language confirmation summarizing the proposed invoice, " +
      "explicitly noting if a second confirmation will be required due to the amount.",
    "",
    "Never claim a payment has been sent — you only ever propose or flag.",
  ].join("\n");
}

export function buildEmailUserMessage(email: { readonly from: string; readonly subject: string; readonly body: string }): string {
  return [
    "New email received from the Payee.",
    `From: ${email.from}`,
    `Subject: ${email.subject}`,
    "",
    email.body,
  ].join("\n");
}
