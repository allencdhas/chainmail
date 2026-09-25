# ChainMail — Product Requirements Document

Sep 25, 2026 · @Allen

## Overview

ChainMail is an AI agent that lives inside a freelancer's email inbox. It turns a plain-language request — "bill Alex $500," or a forwarded invoice PDF — into a stablecoin payment, with no wallet setup, no separate dashboard, and no crypto knowledge required from either the payee or the payer. Transaction status is tracked entirely through color-coded folders and categories inside the same inbox, and a single pinned email acts as the running ledger.

One-liner: **stablecoin invoicing for freelancers, sent, received, and tracked entirely by email — with AI parsing the request and guarding the payment.**

## Problem

Freelancers and contractors with international clients lose real money and time to legacy payment rails. PayPal is unavailable or degraded across large parts of Africa, South Asia, and Latin America — exactly where remote/freelance work is growing fastest. Wire transfers cost $25–$50 and take 3–5 business days, with additional holds for compliance review.

Stablecoins solve the cost and speed problem — instant settlement, near-zero fees — but the existing crypto-invoicing category (BitPay, CoinGate, StableInvoicing, Payyd) is **dashboard-first**: every tool requires the payee to log into a separate web app to create an invoice. Email is used only as a delivery channel for a payment link, never as the interface itself.

Two gaps remain open:

- No product makes email the *trigger* for a transaction — only the *delivery channel*.
- No product applies AI to catch invoice fraud or duplicate billing before money moves — a well-documented attack vector (business email compromise) that a plain payment-link tool does nothing to prevent.

## Target Users

| Persona | Role | Needs |
| --- | --- | --- |
| The Payee | Freelancer / contractor with cross-border clients | Get paid fast and cheap, without learning wallet mechanics; bill one-off work and recurring retainers; see payment status without hunting through the inbox |
| The Payer | Client, often non-crypto-native | Pay a plain-looking invoice email without ever seeing the words "wallet," "gas," or "blockchain" |

The product must work end-to-end even if the Payer never creates an account, installs a wallet extension, or learns any crypto terminology.

## Solution

1. The Payee (freelancer) emails ChainMail in plain language — "bill Alex $500 for the logo work" — or forwards an invoice.
2. The AI agent parses this into a structured invoice and confirms with the Payee via a plain-language email and magic link, before anything is sent to the client.
3. Once approved, ChainMail emails the Payer (client) a clean, PayPal-style payment request — "Pay $500" — with no crypto terminology anywhere in it.
4. The Payer pays through a familiar fiat on-ramp (card or bank) and never needs a wallet of their own; funds are converted to USDC behind the scenes.
5. If it's the Payee's first payment, a wallet is created for them automatically the moment funds are about to land — or, if they already have one, they connect it instead via WalletConnect. Either way, ChainMail never shows a seed phrase.
6. Funds settle in testnet USDC on Sepolia, resolved to the Payee's human-readable ENS subname (`alex.chainmail.eth`) rather than a raw address.
7. Status updates automatically through the Payee's inbox — filed into a color-tagged folder, and reflected in a single pinned ledger email.

## Core User Flows

**Flow 1 — First payment, new Payee wallet (the claim flow)** Payee emails intent → agent parses and confirms with the Payee → Payee approves via magic link → payment request emailed to the Payer → Payer pays via card/bank (fiat on-ramp) → if the Payee has no wallet yet, one is created automatically at settlement, or connected via WalletConnect if they already have one → funds settle → both parties get a receipt email → ledger updates.

**Flow 2 — Repeat payment, existing Payee wallet** Same as Flow 1, but no wallet-creation step — funds settle directly into the Payee's existing wallet, and the agent checks the request against recent history for duplicates before sending the confirmation.

**Flow 3 — Recurring invoice** Payee emails a standing instruction once — "bill Client X $500 on the 1st of every month" — agent creates a recurring rule → scheduler fires on the due date → same confirm-and-settle lifecycle runs automatically → Payee is notified, not asked to re-trigger it each cycle.

**Flow 4 — Status check (the inbox-as-dashboard flow)** At any point, the Payee opens their inbox: transaction emails are already color-coded and filed into status folders (Pending / Settling / Settled / Flagged / Recurring). Opening the single pinned ledger email shows every transaction, its state, and running totals — no login, no separate app.

## Functional Requirements

| Priority | Requirement |
| --- | --- |
| P0 | Parse a natural-language or forwarded-invoice email into a structured payment intent (recipient, amount, memo) |
| P0 | Send a plain-language confirmation email before any transaction executes |
| P0 | Authorize execution via a magic link, not a raw email reply |
| P0 | Generate a non-custodial, email-derived wallet on first use, with no seed phrase shown |
| P0 | Execute a USDC transfer on Sepolia testnet |
| P0 | Resolve wallet addresses to ENSv2 subnames (`user.chainmail.eth`) for display in all emails |
| P0 | File each transaction email into a status folder and apply a matching color category via Microsoft Graph API |
| P0 | Maintain one pinned, continuously-updated ledger email showing all transactions and running totals |
| P1 | Detect likely duplicate invoices against a user's recent history and flag before confirmation |
| P1 | Support recurring/standing invoice instructions on a schedule |
| P1 | Enforce a policy layer: per-transaction cap, daily cap, required second confirmation above a threshold |
| P1 | Delegate the AI agent its own ENS subname with scoped permissions via Enhanced Access Control |
| P2 | Monthly digest email summarizing received/pending amounts |
| P2 | Claim flow for a brand-new Payer who has never received a ChainMail invoice before |
| P1 | Support WalletConnect as an alternative to auto-created wallets, for Payees who already hold one |

P0 = required for a working hackathon demo. P1 = strongly differentiating, build if time allows. P2 = nice-to-have, cut first under time pressure.

## System Architecture

**1. Email Ingestion Service** — A Microsoft Graph API push subscription (webhook) on the user's Outlook mailbox fires on new mail, rather than polling. This is event-driven by design, deliberately improving on the 10-second polling loop used by comparable projects (see Prior Art in Risks).

**2. Agent Loop (multi-step tool-calling)** — For each incoming email, the agent reasons across several turns rather than one classification call: parse intent → call `check_duplicate` → observe the result → decide whether to flag or continue → call `check_policy_limits` (read-only) → compose the confirmation via `create_invoice` → return. Each run still starts and finishes within one email's handling — it is not a standing background process. Persistence and autonomy live elsewhere in the system: in the Scheduler (below) and in the agent's own ENS-delegated identity (see ENS Integration), not in this loop.

**3. Policy / Guardrail Engine** — A deterministic rules layer sitting underneath the LLM's proposal: per-transaction cap, daily cap, required second confirmation above a threshold, and a blocklist. The AI proposes, the policy engine gates, the user's magic-link click authorizes — three independent checks before any money moves.

**4. Wallet Layer** — The Payee's wallet is created the first time they use ChainMail. By default, a wallet address is derived deterministically from `(their verified email + a server-held salt)`, so nothing needs to be generated ahead of time and no seed phrase is ever shown. A Payee who already holds a wallet can connect it instead via **WalletConnect**, in which case ChainMail never touches their keys at all. The Payer never needs a wallet of any kind — they pay through a fiat on-ramp (card/bank), converted to USDC server-side. All settlement uses USDC on Ethereum Sepolia testnet, funded via Circle's public testnet faucet.

**5. ENS Identity Layer** — A parent name (`chainmail.eth`) registered on ENSv2 (Sepolia). Each user's derived wallet resolves to a subname (`alex.chainmail.eth`) via wildcard resolution. The AI agent acting on a user's behalf gets its own subname (`agent.alex.chainmail.eth`) with scoped, delegated rights via Enhanced Access Control — e.g. "can propose payments, cannot execute above $500 without owner confirmation."

**6. Ledger & Status Layer** — A lightweight database is the source of truth for every transaction and its state. That state is mirrored, not duplicated, into the inbox itself: transaction emails are moved into status folders and tagged with matching Outlook categories, and a single pinned email is updated in place (via Graph API) to reflect current totals — the "dashboard" lives entirely inside the mailbox.

**7. Scheduler** — A cron-style job checks all users' recurring-invoice rules and fires due ones; the same job (or a parallel one) sends the periodic digest email.

**8. Confirmation / Auth** — A single shared backend serves all users; nothing is deployed per-user. Confirmation of any money-moving action happens through an authenticated magic link tied to the wallet layer, never through trusting the raw text of a reply email (which is spoofable).

## Transaction Lifecycle

Every transaction moves through five explicit states. Each state change triggers a short status email and moves the message into the matching folder with the matching color category.

| State | Folder | Category color | Trigger |
| --- | --- | --- | --- |
| Pending Confirmation | `ChainMail/Pending Confirmation` | 🟡 Yellow | Intent parsed, awaiting magic-link approval |
| Settling | `ChainMail/Settling` | 🔵 Blue | Approved, transaction submitted on-chain |
| Settled | `ChainMail/Settled` | 🟢 Green | Transaction confirmed on Sepolia |
| Flagged | `ChainMail/Flagged` | 🔴 Red | Duplicate or fraud risk detected before confirmation |
| Recurring | `ChainMail/Recurring` | 🟣 Purple | Standing instruction created; fires future Pending Confirmation events |

The pinned ledger email is updated in place at every state change, so opening it always shows current totals — it is never stale.

## ENS Integration (ENSv2, Sepolia)

ENS is used as the identity layer, not a cosmetic add-on — it is load-bearing in two places:

**User identity.** ChainMail registers a parent name (`chainmail.eth`) on ENSv2. Every user's deterministically-derived wallet resolves to a subname off that parent (`alex.chainmail.eth`) via wildcard resolution, so no invoice, confirmation, or ledger entry ever shows a raw `0x...` address to a non-crypto payer.

**Agent identity and permissions.** Each user's AI agent gets its own subname (`agent.alex.chainmail.eth`), distinct from the user's own. ENSv2's Enhanced Access Control — the shared, role-based permission system behind both registries and resolvers — is used to delegate the agent only specific, limited rights: it can propose and parse payments, but cannot execute above a threshold without the owner's own confirmation. This turns the policy/guardrail layer from an app-level database check into an actual on-chain permission structure, directly answering ENS's own bounty prompt ("agents as namespaces, each with their own identity and permissions").

**Qualification checklist (from the ENSv2 track requirements):**

- Built on ENSv2 (Sepolia) — yes, both the registry hierarchy and Enhanced Access Control are core to the product, not cosmetic.
- Functional demo, no hard-coded values — live subname resolution and live delegated-permission checks required at demo time.
- Public GitHub repo + live demo link required at submission.

## Curvegrid — Best AI Agent Project ($1,000)

Curvegrid's track explicitly lists example ideas that closely match this product's design:

| Their example idea | ChainMail's equivalent |
| --- | --- |
| "Stablecoin Payment Agent — manage invoices, initiate stablecoin payments, track settlement" | The core loop: email → parsed intent → USDC payment → tracked lifecycle |
| "Policy-Aware Transaction Agent — propose or execute transactions while respecting rules such as spending limits, approved counterparties, or required human approvals" | The Policy/Guardrail Engine + magic-link confirmation |
| "Portfolio Intelligence Agent — let users ask natural-language questions about holdings, transactions..." | The pinned ledger email + natural-language parsing of requests |

The multi-step agent loop (see System Architecture) is a direct match for their "Policy-Aware Transaction Agent" example: the agent reasons and proposes across several tool calls, a separate deterministic policy layer decides, and only an authenticated confirmation executes — the exact pattern their track is judging for.

Use of Curvegrid's MultiBaas platform is explicitly **not required** for this prize. Judging is based on idea and technical execution via a GitHub repository with a README that includes: a one-sentence project summary, a note on MultiBaas usage (optional — can state "not used"), a short team intro, clear setup/testing instructions.

No architecture change is required to qualify — the submission is the same build, submitted to this track alongside ENS.

## Security & Guardrails

**Three independent checks before any money moves:**

1. The AI proposes a transaction from parsed intent — it never executes directly.
2. The Policy Engine gates it against deterministic rules: per-transaction cap, daily cap, mandatory second confirmation above a threshold, blocklist for flagged addresses.
3. The user authorizes execution via an authenticated magic link tied to their wallet — never by trusting the plain text of an email reply, which is trivially spoofable.

**Duplicate / fraud detection.** Before confirming any payment, the agent checks the request against the user's recent transaction history (same recipient, same or similar amount, short time window) and flags likely duplicates for explicit review rather than auto-sending. This directly targets business email compromise — the real-world attack where a spoofed email tries to redirect or duplicate a payment — and is a strong, judge-legible live-demo moment: show one clean payment and one flagged duplicate/suspicious request side by side.

**Custody model.** ChainMail never holds user funds or private keys in a shared custodial account. A first-time Payee gets a wallet created via deterministic derivation (email + a server-held salt) — the hackathon-scope tradeoff called out in Risks below. A Payee who already has a wallet can connect it directly via WalletConnect instead, which removes that tradeoff entirely for them. The Payer never holds a ChainMail wallet at all.

## Tech Stack

| Layer | Choice |
| --- | --- |
| Email / inbox | Microsoft Outlook + Microsoft Graph API (webhooks, folders, categories, message updates) |
| Intent parsing | LLM with a multi-step tool-calling agent loop (e.g. Claude or GPT), per inbound email |
| Chain | Ethereum Sepolia testnet |
| Asset | USDC (Circle testnet faucet) |
| Identity | ENSv2 (Sepolia) — Permissioned Registry, wildcard resolution, Enhanced Access Control |
| Wallet | Deterministically derived per user (email + salt); non-custodial |
| Backend | Single shared service (not per-user), Node.js/TypeScript or Python |
| Persistence | Lightweight database (e.g. Postgres/Supabase) as source of truth for transaction state |
| Scheduling | Cron-style job for recurring invoices and digest emails |
| Auth | Magic-link confirmation tied to the wallet layer |
| Wallet connection | WalletConnect, for Payees bringing an existing wallet |

## Out of Scope (Hackathon Build)

- Real mainnet funds or production-grade custody — testnet only
- Multi-chain support — Sepolia only, to keep ENSv2 and the wallet layer on one network
- Gmail / other inbox providers — Outlook/Microsoft Graph only, since folders + categories as separate objects are what the status-dashboard design depends on
- Mobile app or standalone web UI — the inbox is the entire interface
- KYC/compliance tooling, tax reporting, invoicing for non-freelancer use cases
- Third-party payment-screening integrations (e.g. Intercepta) — fraud/duplicate detection is hand-built for this scope
- Security audit of the deterministic wallet-derivation scheme — flagged as a risk, not solved, in this build

## Success Metrics & Demo Script

**Demo beats (live, \~4 minutes):**

1. Send a plain-English email — "bill alex@... $500 for the logo work" — from the Payee's inbox.
2. Show the AI's confirmation reply and click the magic link to approve.
3. Show the invoice email landing in the Payer's inbox and click "Claim" — wallet + ENS subname created live.
4. Show the payment settle on a Sepolia block explorer, resolved to `alex.chainmail.eth`.
5. Switch to the Payee's inbox: the transaction email is already filed and color-tagged; open the pinned ledger email to show the running total updated in place.
6. Send a second, near-duplicate request — show it get flagged red instead of silently sent.
7. Show the ENS Enhanced Access Control permission check: the agent's subname can propose but cannot execute above the cap without the owner's own confirmation.

**What "done" looks like for judging:** a working end-to-end flow across both tracks' qualification requirements — functional, not hard-coded, with a public GitHub repo, README, and live demo link for each.

## Risks & Open Questions

| Risk | Notes |
| --- | --- |
| Deterministic wallet derivation is a security tradeoff for auto-created wallets | Address is derivable from email + a server-held salt for a first-time Payee — no seed phrase to lose, but no key rotation and a single point of failure if the salt leaks. A Payee who connects an existing wallet via WalletConnect avoids this tradeoff entirely; it remains a real limitation for the auto-created path in this hackathon scope. |
| Graph API webhook subscriptions expire and must be renewed | Needs a renewal job; a missed renewal silently stops new-mail detection. |
| LLM parsing errors on ambiguous emails | A misread amount or recipient is the worst-case failure. Mitigated by the plain-language confirmation step and policy caps, but not eliminated. |
| ENSv2 is Sepolia-only for now | Ties the whole stack to one testnet; fine for the hackathon, a real constraint if extending post-event. |
| Prior art exists in this space | WalletSheets (ETHGlobal Trifecta winner) uses a similar "familiar office tool as wallet" pattern via Google Sheets; several crypto-invoicing tools (BitPay, CoinGate) already exist. Differentiation is the email-as-trigger design and the fraud/duplicate-detection layer — be prepared to name this explicitly to judges rather than claim the space is unprecedented. |
| Judging weight between the two tracks is unconfirmed | Building the ENS integration as genuinely load-bearing (not cosmetic) is required either way, since ENS's qualification criteria explicitly check for that. |
