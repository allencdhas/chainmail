# ChainMail

AI agent that lives in a freelancer's Outlook inbox, turning plain-language billing
requests into USDC payments on Sepolia — with status tracked entirely through inbox
folders/categories and a live ledger draft.

Built for ETHGlobal Tokyo 2026, targeting the **ENSv2** and **Curvegrid Best AI Agent
Project** tracks.

See [`ChainMail — PRD.md`](./ChainMail%20—%20PRD.md) for the full product spec and
[`create-a-plan-based-expressive-duckling.md`](./create-a-plan-based-expressive-duckling.md)
for the build plan.

## Status

Building module by module, with unit tests written and passing before each module is
integrated or pushed.

| Module | Status |
| --- | --- |
| Policy engine (per-tx cap, daily cap, second-confirmation threshold, blocklist) | ✅ Built, 100% line coverage |
| Deterministic wallet derivation (app-managed test wallet) | ✅ Built, 100% line coverage |
| Microsoft Graph webhook ingestion (validation handshake, notification auth/dedupe, subscription lifecycle) | ✅ Logic built + unit tested (100% on pure modules); `graph/client.ts` wraps the real SDK and needs a live Azure AD tenant to integration-test |
| Agent loop (LLM tool-calling: check_duplicate → check_policy_limits → create_invoice) | ✅ Logic built + unit tested (100% on the loop itself, ~99% overall); `agent/anthropicClient.ts` wraps the real SDK and needs an API key to integration-test |
| ENSv2 subname + Enhanced Access Control (role math, name encoding, `chainmail.proposal` record) | ✅ Logic built + unit tested (~99% on pure modules); `ens/client.ts` wraps real on-chain calls and needs a live Sepolia RPC + ABI verification to integration-test |
| Ledger (live draft) + folder/category sync | ✅ Logic built + unit tested (100% on all pure modules); `ledger/graphSync.ts` orchestrates the real folder/category/draft Graph calls and needs a live mailbox to integration-test |
| Magic link / payment token auth (confirm_invoice + authorize_payment JWTs, single-use enforcement) | ✅ Built + unit tested, 100% line coverage — no integration-only split needed, JWT signing/verification has no network dependency |
| Settlement (Sepolia USDC transfer) | ✅ Logic built + unit tested (100% on `usdcTransfer.ts`/`evaluateSettlement.ts`); `settlement/client.ts` sends the real on-chain transfer and needs a live Sepolia RPC + funded treasury to integration-test |
| Mocked fiat checkout | ⏳ Not started |

## Custody model — read before touching the wallet module

The default wallet is derived deterministically from `keccak256(email + serverSalt)`.
Because the server holds `serverSalt`, it can always re-derive the private key. This is
an **app-managed test wallet**, not a non-custodial one — "non-custodial" is reserved for
the (optional) WalletConnect-connected path.

## Microsoft Graph webhook integration notes

- Application-permission auth (client-credentials flow) — every Graph call targets
  `/users/{mailboxUserId}/...`, never `/me/...`.
- Outlook message subscriptions max out at **10,080 minutes (7 days)** for basic
  notifications, or **1,440 minutes (1 day)** if `includeResourceData` is used. This repo
  defaults to basic notifications and re-fetches the full message on each notification,
  since rich notifications cost a much shorter subscription lifetime for little benefit
  here.
- The webhook route must always respond within Graph's 3-second window — 202 Accepted if
  queued, 200 if processed inline, 5xx to explicitly request a retry. `clientState`
  mismatches and unknown `subscriptionId`s are rejected but the HTTP response must still
  succeed (never leak validation failures via the status code).
- Notifications are deduplicated, since Graph retries for up to 4 hours and duplicate
  subscriptions can double-deliver. See the caveat in `graph/notifications.ts` about the
  in-memory store's limits before deploying anywhere long-lived.

## ENSv2 Enhanced Access Control — scope correction

Per the feasibility review, Enhanced Access Control governs **ENS registry/resolver
writes only** — it has no relationship to USDC transfers, and a raw ERC-20 send never
consults it. The agent's delegated identity (`agent.<user>.chainmail.eth`) is granted
exactly one real, narrow permission: `ROLE_SET_TEXT` scoped to the single
`chainmail.proposal` text key on its own resolver (via `authorizeTextRoles`, not a
name-level grant). This gives an honest, on-chain-auditable "the agent can only ever
write this one record" story. **The actual spending gate remains the deterministic
policy engine** (`policy/engine.ts`) plus the magic-link / pay-click authorizations — see
`ens/proposalRecord.ts` for the full rationale.

Role bitmap values in `ens/ensRoleConstants.ts` are sourced from ENS's own docs, each
annotated with what was directly confirmed vs. inferred from the documented "4-bit nybble
+ paired admin role" pattern. `ROLE_SET_ADDR`/`ROLE_SET_DATA` are intentionally left
undefined rather than guessed. `ens/client.ts` (the real on-chain write path) is
integration-test-only and flags exactly what must be re-verified against the live
Sepolia deployment before the demo — ENSv2 Sepolia is an active beta and contract
addresses have already been temporarily re-pointed once during this hackathon window.

## Agent loop notes

`agent/loop.ts` implements the PRD's multi-step tool-calling pattern (parse intent →
`check_duplicate` → observe → `check_policy_limits` → `create_invoice` → return) against a
vendor-agnostic `LlmClient` interface modeled on Anthropic's Messages API shape
(system prompt, message list of content blocks, tool_use/tool_result blocks, a stop
reason). This means the entire loop — multi-turn tool execution, error surfacing back to
the LLM, unknown-tool handling, max-turn protection — is unit tested against a scripted
fake client with zero network dependency; `agent/anthropicClient.ts` is the thin,
integration-test-only translation to the real SDK.

`check_policy_limits` inside the loop is advisory to the LLM's own reasoning only. Per the
PRD's Security & Guardrails section, the authoritative policy check happens again,
independently, via `policy/engine.ts` directly at settlement time — the loop's tool call is
never trusted as the actual gate.

## Ledger — corrected design

Per the feasibility review's first blocker: a **sent** Outlook message's body can only be
PATCHed while `isDraft: true` — Graph has no "pin" API for mail at all (only for Teams
chat). The ledger is therefore one persistent **draft** message living in `ChainMail/Ledger`,
fully re-rendered and PATCHed in place on every transaction state change — never sent.
Each individual transaction email is still filed into its state's folder and tagged with a
matching color category (that part of the original design was always valid, since
`categories`/`flag` remain updatable on sent messages regardless of draft status).

- `ledger/stateMapping.ts` — direct encoding of the PRD's Transaction Lifecycle table
  (5 states → folder path → category name/color).
- `ledger/folderSync.ts` — plans the move + category patch for a state transition, always
  stripping any stale ChainMail category from a prior state while preserving unrelated
  user categories untouched.
- `ledger/ledgerRenderer.ts` — renders the ledger draft's HTML body from scratch on every
  update, with totals broken out by state and full HTML-escaping of user-supplied fields.
- `ledger/categoryColors.ts` — maps our color keywords to Graph's `masterCategories` preset
  enum; flagged as best-effort (not independently re-verified against fetched docs this
  session) since a wrong swatch is cosmetic, not functional.
- `ledger/graphSync.ts` — integration-only orchestration of the real folder/category/draft
  Graph calls, idempotent by design (checks for existing folders/categories by name before
  creating).

## Magic link / payment token auth — corrected sequence

Per the corrected flow (fixing the approval/payment conflation blocker from the original
build plan): the **Payee's** magic link only confirms the AI's parsed proposal and triggers
sending the invoice to the Payer — it never moves funds. A second, separate one-time link is
issued to the **Payer**; only that link's "Pay" click triggers settlement.

- `auth/tokens.ts` — two non-interchangeable JWT purposes, `confirm_invoice` (15 min TTL) and
  `authorize_payment` (24h TTL, with `recipient`/`amountUsd` bound at issue time). Purpose is
  checked explicitly — a confirm token can never be used as a payment token or vice versa.
  Tokens use explicit `iat`/`exp` claims and jsonwebtoken's `clockTimestamp` verify option, so
  every expiry edge case is exactly reproducible in tests with no fake timers. Single-use is
  enforced via a `ConsumedTokenStore` (in-memory here; needs a DB unique-constraint on `jti`
  for real concurrent-request safety). No integration-only split was needed for this module —
  JWT signing/verification has no network dependency, so it's 100% unit tested directly.
- `settlement/evaluateSettlement.ts` — the **authoritative, settlement-time** policy re-check,
  run immediately before transferring funds. Never trusts a proposal-time pass, since other
  transactions may have landed in the (up to 24h) gap before the Payer clicks Pay — this is
  directly unit tested against that exact race scenario.
- `settlement/usdcTransfer.ts` — USD-to-USDC atomic-unit conversion (6 decimals, rounds rather
  than truncates) and the ERC-20 `transfer` call-argument builder.
- `settlement/client.ts` — integration-only viem wrapper for the real transfer. Uses the
  standard ERC-20 interface (materially lower ABI-mismatch risk than the ENS module's
  project-specific contracts), targeting Circle's Sepolia USDC
  (`0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`).

## Development

```bash
cd chainmail
npm install
npm run typecheck
npm test              # run once
npm run test:coverage # with coverage report
npm run dev           # local dev server (once server.ts exists)
```
