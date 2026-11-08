# AI Trading Vault — Project Instructions

## Repository state
- MVP skeleton exists: Vite + React frontend, Express quote backend, dry-run dashboard, simulated history.
- UI must describe only implemented behavior. Wallet connection, custody, deposits, execution, and cross-chain support are roadmap items until explicitly approved.
- Optional read-only 1Click dry quotes are implemented and mainnet-only. Mock mode is the default. `dry: true` is hardcoded server-side; the app never requests a deposit address, calls deposit submit, or executes a transaction.
- 1Click responses are validated against the documented OpenAPI dry-quote contract; deposit, expiry, transaction, unknown, or malformed fields fail closed.
- Quote arithmetic uses decimal strings and BigInt base units. Raw amounts stay precise; `amountOutUsd` is never used for calculations.
- Automated backend tests use mocked network responses. No test makes a real 1Click request.
- No wallet libraries, database, or transaction code is wired yet. Keep it that way until explicitly approved.

## Commands (from repo root)
- `npm run setup` — install backend and frontend dependencies.
- `npm run dev` — start API on :5000 and web on :5173.
- `npm run dev:api` / `npm run dev:web` — run one side only.
- `npm test` — backend automated tests with mocked network responses. No real 1Click request is made.
- `npm run check` — backend syntax checks + frontend production build. Run both `npm test` and `npm run check` before declaring work complete.
- Health check: `GET http://localhost:5000/api/health`.

## Layout
- `frontend/` — Vite + React dashboard. Calls relative `/api/*`; Vite proxies to `localhost:5000`.
- `backend/src/services/quote.service.js` — deterministic local mock quotes and quote meta.
- `backend/src/services/quote.math.js` — exact decimal/BigInt helpers for conversions, slippage, and display-only pricing.
- `backend/src/services/oneclick.service.js` — optional read-only 1Click dry quotes; env validation and strict response allowlisting.
- `backend/test/` — automated tests with mocked network responses.
- `frontend/src/lib/plan.js` — single source of truth for DCA math, validation, and deterministic plan suggestions. Not an LLM.
- No static serving in Express; the frontend must run through Vite.

## Safety / scope (hard requirements)
- Demo is dry-run and NEAR-only; no wallet connection exists yet.
- NEAR testnet wallet connection is planned, not implemented.
- 1Click is mainnet-only and dry-only here. Never accept `dry` from the client, never call deposit submit, and never display a deposit address.
- Reject an invalid `QUOTE_SOURCE` instead of silently falling back to mock.
- Validate live responses against the documented OpenAPI shape. Reject deposit fields, expiry fields, transaction data, unknown fields, and malformed amounts.
- Use exact decimal/BigInt arithmetic for token conversions, expected output, minimum output, and slippage. Never use `amountOutUsd` for calculations.
- Send `ONECLICK_API_KEY` as `X-API-Key`; keep credentials backend-only and never return them to the client.
- Validate signature presence/type only. Do not claim cryptographic signature verification.
- Start with NEAR-only deposits when deposits exist; cross-chain is a later stretch.
- The AI may suggest parameters only; v1 suggestions are rule-based.
- Users set and approve all spending, timing, asset, and slippage constraints.
- Never request private keys or seed phrases. Never execute unapproved trades.
- Before adding a wallet connection, quote execution, or any transaction, stop and get explicit user approval.
- Default to dry-run when the environment is unclear. Never silently fall back from a failed live quote to mock data.

## Product
Vision: a non-custodial AI copilot for DCA vaults on NEAR, with cross-chain support later.
Current demo: NEAR-only dry-run. Mock quotes are the default; optional read-only 1Click dry quotes are mainnet-only. Wallet, execution, custody, deposits, and cross-chain support are roadmap items.
Track 01: Unstoppable DeFi (`defi`).

## MVP target
- Wallet connection
- USDC deposits from supported chains
- Target assets: BTC, ETH, NEAR
- DCA schedule, per-trade budget, slippage cap, risk controls
- NEAR Intents / 1Click quotes, execution, status tracking
- Dry-run mode with real quotes and no fund movement
- Clear failed and refunded states
- Dashboard showing fund location and trade history

## Engineering
- Keep secrets in local `.env` only; commit `.env.example`, never `.env`.
- Make small, focused commits.
- Reuse existing patterns; do not change unrelated files.
- Run `npm test` and `npm run check` before declaring work complete.
- If `node` is missing in this WSL shell, `npm` works through Windows, or use `node.exe`; see README.
