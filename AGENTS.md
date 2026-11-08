# AI Trading Vault — Project Instructions

## Repository state
- MVP skeleton exists: Vite + React frontend, Express quote backend, dry-run dashboard, simulated history.
- UI must describe only implemented behavior. Wallet connection, custody, deposits, execution, and cross-chain support are roadmap items until explicitly approved.
- Optional read-only market prices are implemented for NEAR, BTC, and ETH from public Coinbase Exchange USD tickers. Local reference prices are the default; no market-data request is made unless `PRICE_SOURCE=coinbase`.
- Optional read-only 1Click dry quotes are implemented and mainnet-only. Dry-run mode is the default. `dry: true` is hardcoded server-side; the app never requests a deposit address, calls deposit submit, or executes a transaction.
- Market prices are display and simulation inputs only. A ticker price is never presented as an executable NEAR Intents quote, and quote targets remain NEAR-only.
- 1Click responses are validated against the documented OpenAPI dry-quote contract; deposit, expiry, transaction, unknown, or malformed fields fail closed.
- Market ticker responses are validated for exact pair, positive price, parseable last-trade time, future skew, and maximum age. Failures use a clearly labelled mock fallback or a strict 503; they never masquerade as live data.
- Quote arithmetic uses decimal strings and BigInt base units. Raw amounts stay precise; `amountOutUsd` is never used for calculations.
- Automated backend tests use mocked network responses. No test makes a real 1Click or Coinbase request.
- No wallet libraries, database, or transaction code is wired yet. Keep it that way until explicitly approved.

## Commands (from repo root)
- `npm run setup` — install backend and frontend dependencies.
- `npm run dev` — start API on :5000 and web on :5173.
- `npm run dev:api` / `npm run dev:web` — run one side only.
- `npm test` — backend automated tests with mocked network responses. No real 1Click or Coinbase request is made.
- `npm run check` — backend syntax checks + frontend production build. Run both `npm test` and `npm run check` before declaring work complete.
- Health check: `GET http://localhost:5000/api/health`.

## Layout
- `frontend/` — Vite + React dashboard. Calls relative `/api/*`; Vite proxies to `localhost:5000`.
- `backend/src/services/quote.service.js` — deterministic local mock quotes and quote meta.
- `backend/src/services/quote.math.js` — exact decimal/BigInt helpers for conversions, slippage, and display-only pricing.
- `backend/src/services/market.service.js` — optional read-only Coinbase ticker prices; fixed USD pairs, strict validation, cache, staleness, and labelled fallback.
- `backend/src/services/oneclick.service.js` — optional read-only 1Click dry quotes; env validation and strict response allowlisting.
- `backend/test/` — automated tests with mocked network responses, including `market.service.test.js`.
- `frontend/src/lib/plan.js` — single source of truth for DCA math, validation, and deterministic plan suggestions. Not an LLM.
- No static serving in Express; the frontend must run through Vite.

## Safety / scope (hard requirements)
- Demo is dry-run and NEAR-only; no wallet connection exists yet.
- Market prices are public, read-only, and keyless. Only `NEAR-USD`, `BTC-USD`, and `ETH-USD` may be requested. Do not add trading, order, deposit, or authenticated Coinbase endpoints.
- NEAR testnet wallet connection is planned, not implemented.
- 1Click is mainnet-only and dry-only here. Never accept `dry` from the client, never call deposit submit, and never display a deposit address.
- Never accept `priceUsd`, `priceSource`, `priceObservedAt`, `fallback`, or similar price fields from the client. The server alone selects the price source.
- Keep `PRICE_SOURCE=mock` as the default. `PRICE_SOURCE=coinbase` must only read public tickers. Never use `amountOutUsd` for calculations.
- Reject an invalid `QUOTE_SOURCE`, `PRICE_SOURCE`, or `PRICE_FALLBACK` instead of silently falling back to a default.
- Market-price fallback must be labelled. `PRICE_FALLBACK=labeled-mock` is the default; `PRICE_FALLBACK=off` must return an error. Never hide a failed live feed behind mock data.
- Validate live responses against the documented OpenAPI shape. Reject deposit fields, expiry fields, transaction data, unknown fields, and malformed amounts.
- Use exact decimal/BigInt arithmetic for token conversions, expected output, minimum output, and slippage. Never use `amountOutUsd` for calculations. Market prices are converted from validated decimal strings and BigInt micros, not floats.
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
Current demo: NEAR-only dry-run. Local reference prices and dry-run quotes are the default; optional read-only Coinbase prices cover NEAR, BTC, and ETH, and optional read-only 1Click dry quotes are mainnet-only. Wallet, execution, custody, deposits, and cross-chain support are roadmap items.
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
