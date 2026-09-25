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
| Agent loop (LLM tool-calling) | ⏳ Not started |
| ENSv2 subname + Enhanced Access Control (role math, name encoding, `chainmail.proposal` record) | ✅ Logic built + unit tested (~99% on pure modules); `ens/client.ts` wraps real on-chain calls and needs a live Sepolia RPC + ABI verification to integration-test |
| Ledger (live draft) + folder/category sync | ⏳ Not started |
| Settlement (Sepolia USDC transfer) | ⏳ Not started |
| Magic link / payment token auth | ⏳ Not started |
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

## Development

```bash
cd chainmail
npm install
npm run typecheck
npm test              # run once
npm run test:coverage # with coverage report
npm run dev           # local dev server (once server.ts exists)
```
