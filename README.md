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
| Microsoft Graph webhook ingestion | ⏳ Not started |
| Agent loop (LLM tool-calling) | ⏳ Not started |
| ENSv2 subname + Enhanced Access Control | ⏳ Not started |
| Ledger (live draft) + folder/category sync | ⏳ Not started |
| Settlement (Sepolia USDC transfer) | ⏳ Not started |
| Magic link / payment token auth | ⏳ Not started |
| Mocked fiat checkout | ⏳ Not started |

## Custody model — read before touching the wallet module

The default wallet is derived deterministically from `keccak256(email + serverSalt)`.
Because the server holds `serverSalt`, it can always re-derive the private key. This is
an **app-managed test wallet**, not a non-custodial one — "non-custodial" is reserved for
the (optional) WalletConnect-connected path.

## Development

```bash
cd chainmail
npm install
npm run typecheck
npm test              # run once
npm run test:coverage # with coverage report
npm run dev           # local dev server (once server.ts exists)
```
