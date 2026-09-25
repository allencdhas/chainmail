# ChainMail — 2-Day Solo Hackathon Build Plan (ETHGlobal Tokyo 2026)

## Context

This is a brand-new, empty repository — only the PRD (`ChainMail — PRD.md`) exists. ChainMail is an AI agent that lives in a freelancer's Outlook inbox, turning plain-language billing requests into USDC payments on Sepolia, with status tracked entirely through inbox folders/categories and a pinned ledger email. It's being built solo in ~2 days for ETHGlobal Tokyo 2026, targeting two prize tracks: **ENSv2** (identity + Enhanced Access Control must be genuinely load-bearing, not cosmetic) and **Curvegrid's Best AI Agent Project** (policy-aware transaction agent pattern). All external infra (Azure AD app, ENS name, Circle faucet funds, WalletConnect/Reown project) starts from zero.

Given the 2-day solo constraint, the plan is ruthless: P0 only as the real target, front-loading the riskiest/least-certain integrations (Microsoft Graph webhooks, ENSv2 Enhanced Access Control tooling — confirmed live via a 2026-09-15 hackathon-clean Sepolia redeploy in `ensjs`) so failures surface early with time left to adapt, and pushing all polish to the very end as the first thing to cut. One P0 item (the fiat on-ramp) is deliberately scoped down to a mocked checkout button, since real card-processor integration is multi-day work even in sandbox mode — everything downstream of that click (wallet creation, ENS registration, on-chain settlement, folder/category updates, ledger) stays fully real.

Research confirmed as current: `ensjs` (Sepolia config) now points at a fresh ENSv2 deployment made for this exact hackathon window; ENSv2's Enhanced Access Control is a live role-bitmap permission system; Microsoft Graph mail webhook subscriptions expire in ~3 days max (renewal job needed even within 2 days of building/demoing); Circle's testnet faucet gives 20 USDC/2hr per address; WalletConnect has rebranded to Reown (`cloud.reown.com`, `@reown/appkit`).

## Project Structure

**Single Node.js/TypeScript service, not a monorepo.** No solo 2-day build benefits from package/workspace boundaries — that's pure overhead. One Express app, one deploy target, one Postgres (Supabase-hosted, zero local DB setup), organized by module:

```
chainmail/
  src/
    server.ts                 # entrypoint: mounts routes, starts cron
    config/env.ts              # zod-validated env loading
    graph/
      client.ts                 # Graph SDK client, app-only auth via MSAL/@azure/identity
      webhook.ts                 # subscription create/renew + notification receiver route
      mailActions.ts             # move message, set category, sendMail, patch pinned message
      subscriptionRenewal.ts     # cron-driven renewal (subscriptions expire ~3 days max)
    agent/
      loop.ts                    # Anthropic SDK multi-turn tool-calling loop
      tools.ts                   # check_duplicate, check_policy_limits, create_invoice
      prompts.ts
    policy/engine.ts             # per-tx cap, daily cap, threshold 2nd-confirm, blocklist
    wallet/
      derive.ts                  # deterministic derivation: keccak256/HMAC(email, server salt)
      viemClient.ts               # viem wallet/public clients, Sepolia transport
      walletconnect.ts            # Reown AppKit session handling (P1, optional)
    ens/
      client.ts                   # ensjs v5 client wired to Sepolia ENSv2 deployment
      registerSubname.ts          # alex.chainmail.eth registration/resolution
      agentSubname.ts              # agent.alex.chainmail.eth + Enhanced Access Control roles
    ledger/
      db.ts, schema.ts             # Postgres (Drizzle or plain pg): users, transactions, recurring_rules
      pinnedLedger.ts               # renders + patches the pinned ledger email body
    auth/magicLink.ts, routes.ts   # JWT-based magic link issue/verify; /confirm/:token, /claim/:token
    onramp/fakeCheckout.ts         # P0 fallback: styled fake "Pay" page triggering real settlement
    scheduler/cron.ts              # node-cron: recurring invoices, subscription renewal
  .env.example
  package.json / tsconfig.json
```

Runs as one process (`tsx watch src/server.ts` in dev), deployed to Render/Railway/Fly for a stable public HTTPS URL (required for the Graph webhook validation handshake).

## Library Choices

| Piece | Choice | Why |
|---|---|---|
| Server | Express | webhook receiver + magic-link routes + fake checkout page |
| Microsoft Graph | `@microsoft/microsoft-graph-client` + `@azure/identity` (`ClientSecretCredential`) | app-only auth avoids per-user OAuth refresh complexity |
| LLM / agent loop | `@anthropic-ai/sdk`, Claude, native tool-use | matches PRD's multi-step tool-calling loop; no agent framework needed for a single-file loop |
| Ethereum | **viem** (not ethers) | ensjs v5 is built on viem; faster to write correctly under time pressure |
| ENS | `@ensdomains/ensjs` (v5 preview) targeting its Sepolia config | points at the 2026-09-15 hackathon-clean ENSv2 Sepolia redeploy — built for exactly this moment; fall back to raw viem `readContract`/`writeContract` against ENSv2 contract addresses (docs.ens.domains/learn/deployments) only if ensjs's write path breaks |
| WalletConnect | `@reown/appkit` + `@reown/appkit-adapter-wagmi` + `wagmi` + viem | WalletConnect rebranded to Reown; P1/optional, set up early since trivial |
| Database | Supabase (hosted Postgres) + Drizzle or plain `pg` | zero local setup, dashboard for live debugging |
| Cron | `node-cron` | in-process, no separate worker needed |
| Magic link | Custom signed JWT (`jsonwebtoken`), short TTL, embedded in URL | satisfies "authenticated link, not raw reply text" without a full auth system |
| Fiat on-ramp | **Mocked for P0**: styled `/pay/:token` page, "Pay $500" button triggers real server-side USDC transfer from a pre-funded treasury wallet | real Stripe/Circle Payments sandbox still requires KYB steps — out of realistic 2-day scope |
| USDC funding | Manual Circle faucet claim (faucet.circle.com) into 1-2 treasury addresses, pre-demo | no practical automation API; treat as a setup step, not a runtime call |

## Build Sequence (risk-first, ~2 days)

**Day 1 AM — infra + skeleton (~4h)**
1. Azure AD app registration (see Infra Setup below) — confirm Graph script can list messages. Highest-leverage first task.
2. Register `chainmail.eth` on Sepolia via app.ens.domains (needs Sepolia ETH from a faucet first).
3. Supabase project + `users`/`transactions`/`recurring_rules` schema, first migration.
4. Express skeleton with health check, deployed immediately to Render/Railway (get the public HTTPS URL before writing business logic).
5. Circle faucet claim to a treasury address (20 USDC/2h cooldown — claim again as needed).
6. Reown Cloud project creation (5 min, do now, P1 but trivial).

**Day 1 PM — email ingestion + agent loop (~5h) — RISK ZONE 1**
7. Graph webhook subscription on Inbox messages + validation-token handshake route. Budget real debugging time: notification payload has no body (must re-fetch via Graph), app-only auth means calling `/users/{id}/...` not `/me/...` everywhere.
8. Fetch full message on notification; extract subject/body/from.
9. Agent loop (Anthropic tool-use): parse intent → `check_duplicate` (vs. Postgres history) → `check_policy_limits` (stub today, flesh out Day 2 PM) → `create_invoice`.
10. Send confirmation email via Graph `sendMail` with embedded magic link.
11. **Checkpoint**: plain-English email → confirmation email with working magic link. If not working, simplify the agent loop before losing more time.

**Day 2 AM — wallet/ENS + settlement (~5h) — RISK ZONE 2**
12. Deterministic wallet derivation (`keccak256`/HMAC of email + server salt → viem `privateKeyToAccount`); never persist raw private key, regenerate on demand.
13. ENSv2 subname registration via ensjs (`alex.chainmail.eth` → derived address); test both resolution directions. Have the raw-viem fallback path sketched in case ensjs's write API is unstable (it's preview-quality).
14. Agent subname (`agent.alex.chainmail.eth`) + Enhanced Access Control role grant ("propose" yes, "execute above threshold" no) — **treat as effectively P0**, not P1: it's the ENS track's explicit qualification bar and the single most differentiating claim in the PRD.
15. Settlement: on magic-link confirm, Settling → real USDC ERC-20 transfer (treasury → payee address) via viem on Sepolia → wait for confirmation → Settled → receipt emails with Etherscan link + ENS name.
16. **Checkpoint**: full happy path, email → confirm → fake-pay click → real on-chain USDC transfer visible on Sepolia Etherscan, resolved via ENS name. If EAC isn't working, timebox one more hour, then fall back to a minimal-but-still-real on-chain role/text-record check — never a hardcoded boolean (fails ENS's "no hard-coded values" bar).

**Day 2 PM — policy engine + folders/ledger + demo polish (~5h) — RISK ZONE 3**
17. Policy engine: per-tx cap, daily cap, threshold second-confirmation, blocklist — pure deterministic functions, enforced independently at both proposal and settlement time (never trust the LLM's tool call as the actual gate).
18. Status folders/categories via Graph: create 5 folders + matching colored categories once at startup; on each state transition, move message + patch categories.
19. Pinned ledger email: sent once, message ID stored, body patched in place via Graph on every state change.
20. Duplicate/fraud demo moment: second near-duplicate email → flagged red, distinct confirmation framing — mostly wiring once 9 and 18 exist.
21. Recurring invoices — only if 1-20 are solid with 2+ hours to spare; scope down hard if attempted (single daily cron check, no cron-expression parsing).
22. Demo polish: clean PayPal-style email templates (no crypto words for the Payer), rehearse the 7-beat script twice, pre-stage both test mailboxes, pre-fund treasury, have Etherscan tab ready, record a fallback video.

## Infra Setup Steps (Day 1)

**Azure AD app registration:**
1. portal.azure.com → App registrations → New (`chainmail-hackathon`). Prefer a free Microsoft 365 Developer Program tenant over a personal Outlook.com account (fewer Graph limitations).
2. Certificates & secrets → new client secret, save immediately.
3. API permissions → **Application permissions**: `Mail.Read`, `Mail.ReadWrite`, `Mail.Send`, `MailboxSettings.ReadWrite`, `User.Read.All` → Grant admin consent.
4. Application permissions mean calling `/users/{mailbox-id}/...`, never `/me/...` — build this in from the start.
5. `.env`: `tenantId`, `clientId`, `clientSecret`.

**ENS on Sepolia:**
1. Sepolia ETH from any faucet (Alchemy/Google Cloud Web3/QuickNode).
2. Register `chainmail.eth` on Sepolia via app.ens.domains (switch network first).
3. Install `@ensdomains/ensjs` (latest v5 preview) + `viem`; verify it's targeting the current Sepolia ENSv2 deployment (check docs.ens.domains/learn/deployments at build time).

**Circle faucet:** faucet.circle.com, Sepolia network, claim to treasury address(es); 20 USDC/2h cooldown per address.

**Reown:** cloud.reown.com → create project → copy Project ID into `.env`.

## Scope Calls

- **P1 attempted only if ahead of schedule**: WalletConnect (safe to cut, doesn't block demo narrative), recurring invoices (cut unless 2+ hrs spare).
- **Fold into P0, don't treat as optional**: policy engine's threshold second-confirmation (cheap once engine exists, core to the security narrative both tracks judge).
- **Elevate from P1 to effectively-P0**: agent ENS subname + Enhanced Access Control — it's the ENS track's named qualification bar.
- **Cut entirely**: monthly digest, new-Payer onboarding claim flow (P2, PRD already flags these).
- **Fiat on-ramp**: mock the card-entry UI only; everything after the click stays real. Say so explicitly to judges rather than pretending it's real.
- **Never fake**: Graph webhook + folder/category API (core differentiator vs. polling, and vs. Gmail), deterministic wallet creation, ENS resolution, on-chain settlement, ENS Enhanced Access Control role check.

## Demo Script (7 beats, map to PRD)

| Beat | Real or mocked |
|---|---|
| 1. Plain-English email | Real |
| 2. AI confirmation + magic link | Real |
| 3. Payer invoice + "Pay" click | Mocked checkout UI only; real settlement triggered |
| 4. Sepolia settlement, ENS resolution | Real — must not be faked (ENS track checks this) |
| 5. Folder/category filing + pinned ledger update | Real |
| 6. Duplicate flagged red | Real |
| 7. ENS Enhanced Access Control permission check | Real — must not be faked; minimum acceptable fallback is a real on-chain role grant checked via a cached (not per-request) read, never a database-only flag |

Explicitly tell judges the fiat leg is simulated (name Stripe/Circle Payments as the intended production path) and that deterministic wallet derivation is a known custody tradeoff (per the PRD's own Risks section) — naming both proactively reads as engineering judgment, not an oversight.

## Verification

- Day 1 PM checkpoint: send a real email to the test Outlook mailbox, confirm webhook fires, agent parses it, confirmation email with magic link arrives.
- Day 2 AM checkpoint: click magic link → fake pay → check Sepolia Etherscan for the real USDC transfer → resolve the payee address via ENS (ensjs `getAddressRecord` or the ENS app) and confirm it matches.
- Day 2 PM: trigger a near-duplicate invoice request, confirm it lands in the Flagged/red folder instead of sending; open the pinned ledger email and confirm totals update in place after each transaction.
- Before demo: full dry run of all 7 script beats end-to-end, twice, on the actual mailboxes/wallets that will be used live.
