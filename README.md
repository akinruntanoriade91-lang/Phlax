# Phlax — NEAR DCA Prototype (Dry Run)

A **NEAR-only dry-run prototype** for a non-custodial DCA vault. This repository
is the safe MVP skeleton for NEAR Hackathon Track 01: Unstoppable DeFi (`defi`).

Cross-chain deposits, wallet connection, and transaction execution are
**roadmap items**. This version implements an optional **read-only public market
price** source and an optional **read-only 1Click dry quote** source; it never
creates a transaction or handles funds.

## What Phlax implements today

- One-page simulation dashboard with a NEAR-only DCA plan builder.
- One calculation module for weekly budget, cadence, per-run amount, and
  planned weekly spend.
- Client-side **Save strategy** action with an ID, name, creation timestamp,
  status, and an Active strategy summary. State only: no database or storage
  dependency, and a refresh clears it.
- **Run next 4 cycles** demo: one dry-run quote request produces four
  deterministic, clearly labelled simulated history rows
  (fill, fill, failed, refunded). Runs are gated to the confirmed dry-run quote
  engine.
- Quote endpoint (`POST /api/quote`) with two sources:
  - **Dry-run engine (default, `QUOTE_SOURCE=mock`):** simulated local quotes;
    no 1Click call and no deposit address.
  - **1Click dry (optional):** read-only mainnet quotes with `dry: true`
    hardcoded on the server.
- An independent, optional **read-only market price** layer (`PRICE_SOURCE`):
  - **Local reference (default):** deterministic reference prices, no external
    calls.
  - **Coinbase Exchange (optional):** public USD ticker prices for NEAR, BTC,
    and ETH. Quote targets remain NEAR-only.
- Price provenance on every dry-run quote: `priceSource`, `priceObservedAt`,
  `priceAgeMs`, and `priceStale`. A market ticker price is never presented as an
  executable NEAR Intents quote.
- A **labelled mock fallback** when the live price feed fails, or strict `503`
  errors with `PRICE_FALLBACK=off`.
- Exact fixed-point quote arithmetic (BigInt / decimal strings) for token
  decimals, expected output, minimum output, and slippage.
- Automated backend tests (`npm test`) with mocked network responses. Tests
  never contact 1Click or Coinbase.
- Deterministic **Plan assistant** (rules, not an AI model).
- Simulated trade history with fill, failed, and refunded outcomes.
- **Reset demo** action that restores the seeded plan and history.
- Header badges that report the quote-source and price-source status from
  `GET /api/quote/meta` (dry-run engine, optional 1Click dry, local reference
  price, optional Coinbase price, or unavailable).
- API responses never expose environment values, API credentials, or request
  data.

Dry-run mode is the default. The backend makes no 1Click request unless
`QUOTE_SOURCE=1click-dry` is set in local `.env`, and no market-data request
unless `PRICE_SOURCE=coinbase` is set in local `.env`.

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | Vite 8 + React 19 + plain CSS |
| Backend | Express 5 (ES modules) |
| Quote flow | Local dry-run generator by default; optional read-only Coinbase prices and 1Click dry quotes |
| Data | In-memory React state and hard-coded simulated history |

No database, contract, wallet library, or transaction library is installed.

## Provenance and baseline

- The GitHub repository was created on 2026-11-07.
- The repository history begins at commit `f7c3aef` on 2026-11-07. Every commit
  made so far falls inside the NEAR Hackathon development window that opened on
  2026-11-01.
- There is no earlier baseline tag, branch, or pre-hackathon history in this
  repository.
- Third-party libraries are exactly the ones listed in **Stack** and pinned in
  the three lockfiles (`package-lock.json`, `backend/package-lock.json`,
  `frontend/package-lock.json`). No other runtime service is required.
- The `defi` track prompt describes a cross-chain DCA vault. This repository is
  a dry-run quote and simulation prototype, not a completed vault; see
  **What Phlax does not implement yet**.

## Prerequisites

- Node.js `^20.19.0` or `>=22.12.0` (required by Vite 8)
- npm

If you are in this Windows/WSL shell and `node` is not found, use PowerShell or
CMD, or call `node.exe` explicitly. `npm` normally resolves the Windows Node
installation automatically.

## Judge quickstart (copy-paste)

This is the shortest path a judge can follow. Run everything from the repository
root. Expected output is abridged; timings and package versions will vary.

1. **Install dependencies**

   ```bash
   npm run setup
   ```

   Expected: three installs run (root, `backend/`, `frontend/`), and each ends
   with `found 0 vulnerabilities`.

2. **Run the automated tests**

   ```bash
   npm test
   ```

   Expected: `tests 42`, `pass 42`, `fail 0`. The tests use mocked network
   responses and make no 1Click or Coinbase request.

3. **Run syntax checks and a production build**

   ```bash
   npm run check
   ```

   Expected: the backend `node --check` commands print no errors, then Vite
   prints `✓ built in …` and a `dist/` summary.

4. **Start the API and web app**

   ```bash
   npm run dev
   ```

   Expected:

   ```text
   Phlax API (dry-run) running on http://localhost:5000
   Network: not connected (NEAR testnet planned) | Quote source: mock (local dry-run engine) | Price source: mock (local reference, no external calls) | Wallet: disabled in demo
   VITE v… ready in … ms
   ➜ Local: http://localhost:5173/
   ```

   Open the URL Vite prints. If port 5173 is already in use, Vite prints
   `http://localhost:5174/` instead; use that URL.

5. **Check the health endpoint**

   ```bash
   curl http://localhost:5000/api/health
   ```

   Expected (abridged):

   ```json
   {
     "success": true,
     "data": {
       "status": "ok",
       "mode": "dry-run",
       "network": "not-connected",
       "wallet": "disabled-in-demo",
       "quoteSource": {
         "source": "mock",
         "liveRequestsEnabled": false,
         "dryOnly": true
       }
     }
   }
   ```

6. **Save a strategy**

   In the web app, keep the default plan: weekly budget `100`, asset `NEAR`,
   cadence `Daily`, slippage cap `0.5`. Click **Save strategy**.

   Expected:

   - Notice: `Strategy saved: NEAR DCA · Daily · $100.00/wk. Simulated cycles use this snapshot.`
   - **Active strategy** shows an ID like `plan-…-1`, status `Active`, and the
     summary values `$100.00` weekly budget, `$14.29` per run, `Daily`,
     `0.5%` slippage cap, `USDC → NEAR`, and `7` runs per week. The summary
     labels render in uppercase.
   - History is still the 5 seeded rows.

7. **Run four cycles**

   Click **Run next 4 cycles**. The button is disabled until the header badge
   confirms `Dry-run quote engine`.

   Expected:

   - History grows from 5 to **9** rows.
   - Exactly four new rows, labelled `Simulated cycle 1 of 4 · plan-…` through
     `Simulated cycle 4 of 4 · plan-…`.
   - Statuses: **2 × Simulated fill**, **1 × Simulated failure**,
     **1 × Simulated refund**.
   - Notice: `4 simulated cycles added for NEAR DCA · Daily · $100.00/wk. No transaction was sent and no funds moved.`

8. **Reset the demo**

   Click **Reset demo**.

   Expected:

   - **Active strategy** returns to `No saved strategy yet.`
   - History returns to the 5 seeded rows (3 fill, 1 failure, 1 refund).
   - Budget returns to `100`.
   - Notice: `Demo reset. Seeded history restored; no transactions exist.`

## Setup

From the repository root:

```bash
npm run setup
cp .env.example .env   # optional; dry-run mode works without it
npm run dev
```

Then open:

- Web app: http://localhost:5173
- API health: http://localhost:5000/api/health

The Vite dev server proxies `/api/*` to `http://localhost:5000`.

### Run one side only

```bash
npm run dev:api   # Express on :5000
npm run dev:web   # Vite on :5173
```

### Verify

```bash
npm test    # backend tests with mocked network responses
npm run check
```

`npm test` runs the Node test suite in `backend/test`. It uses mocked token,
quote, and market-ticker responses, so it makes no real 1Click or Coinbase
request. `npm run check` runs Node syntax checks on the backend and a production
build of the frontend.

## Quote and price sources

### Dry-run quote engine (default)

`QUOTE_SOURCE` is unset or `mock`. Quotes are simulated locally and no 1Click
request is made. The UI labels them **Dry-run quote** and shows the source,
market-price provenance, fetched time, route, input, expected output, minimum
output, and slippage.

The dry-run engine can use either a local reference price or a real, read-only
market price. The quote `source` stays `mock` in both cases so that simulation
labels and the run-demo gate remain intact.

### Market prices (optional)

`PRICE_SOURCE` controls the price used for the simulated token quantity:

- `mock` (default): deterministic local reference prices. No network request.
- `coinbase`: public, read-only USD tickers from Coinbase Exchange. Only
  `NEAR-USD`, `BTC-USD`, and `ETH-USD` are supported, and quote targets remain
  NEAR-only.

```bash
PRICE_SOURCE=coinbase
PRICE_FALLBACK=labeled-mock   # default; or "off" for strict errors
# Optional thresholds in milliseconds:
# PRICE_TTL_MS=15000          # cache lifetime before a refresh
# PRICE_STALE_MS=60000        # flag the price as stale after this age
# PRICE_MAX_AGE_MS=300000     # hard reject a last trade older than this
```

Behavior and limits:

- The three USD pairs were verified against Coinbase's public products endpoint
  before implementation: `NEAR-USD`, `BTC-USD`, and `ETH-USD` each reported
  `status: "online"` with `trading_disabled: false`.
- Requests go only to
  `https://api.exchange.coinbase.com/products/<PAIR>/ticker`. No API key is used.
- The ticker `price` and `time` fields are strictly validated. Missing,
  malformed, non-string, non-positive, out-of-range, or future-dated values are
  rejected.
- The last-trade time must be no older than `PRICE_MAX_AGE_MS`. A trade older
  than `PRICE_STALE_MS` is still shown but flagged `priceStale: true`.
- Responses are cached for `PRICE_TTL_MS`; concurrent requests share one
  upstream call.
- If the feed fails and `PRICE_FALLBACK=labeled-mock`, the quote uses a local
  reference price with `priceSource: "mock-fallback"` and `priceStale: true`.
  The UI labels it clearly as fallback, not market data.
- If `PRICE_FALLBACK=off`, a failed feed returns `503 PRICE_UNAVAILABLE`; there
  is no silent substitution.
- Invalid `PRICE_SOURCE` or `PRICE_FALLBACK` values return `503`; they do not
  silently fall back to defaults.
- A market ticker price is **not** an executable NEAR Intents quote. It is used
  only to simulate a token quantity in dry-run mode. No wallet, signature,
  deposit, or transaction is involved.
- The UI shows the price source and last-trade timestamp for each quote. The
  health and meta endpoints expose non-secret price-source status.

### 1Click dry quotes (optional)

1Click is **mainnet-only**; there is no testnet version. Dry-run mode remains
the safe default. To enable the optional read-only dry source, set these values in
your local `.env` and restart the API:

```bash
QUOTE_SOURCE=1click-dry
ONECLICK_DRY_RECIPIENT=<your-own-public-recipient-address>
ONECLICK_DRY_REFUND_TO=<your-own-public-refund-address>

# Optional backend-only credential. Sent as X-API-Key, never to the browser.
ONECLICK_API_KEY=<your-own-partner-jwt>
```

`ONECLICK_JWT` is also accepted as a legacy backend-only alternative and is sent
as `Authorization: Bearer`. Prefer `ONECLICK_API_KEY`.

The recipient and refund addresses are required **only to shape the dry quote
request**. They are public routing metadata: they do not connect a wallet, prove
ownership, authorize a transaction, or require a private key or seed phrase.

Safety properties of this mode:

- The server hardcodes `dry: true`; the browser cannot send `dry`, `dryRun`, or
  deposit-related fields.
- The server rejects client payloads containing those fields and rejects local
  configuration that tries to disable dry mode or enable transactions.
- Requests go only to `GET /v0/tokens` and `POST /v0/quote` on
  `https://1click.chaindefuser.com`.
- `/v0/deposit/submit` is never called.
- `depositAddress` is never requested, stored, or displayed.
- No wallet, signing, contract, or transaction code exists.
- Missing recipient/refund configuration returns a clear `503` error and makes
  no 1Click request. There is no silent fallback to mock data.
- A failed live quote returns an error; it never substitutes mock data.
- An invalid `QUOTE_SOURCE` value returns `503`; it does not silently fall back
  to mock quotes.
- `ONECLICK_API_KEY` and `ONECLICK_JWT` stay in the backend environment only.

Upstream responses are validated against the documented 1Click OpenAPI
contract before the UI labels a quote as live:

- The top-level response must be
  `{ correlationId, timestamp, signature, quoteRequest, quote }`.
- The echoed `quoteRequest` must confirm `dry: true` and match the outgoing
  swap type, assets, amount, slippage, recipient, and refund fields.
- The `quote` must contain the documented raw and formatted amount fields and a
  valid `timeEstimate`.
- Dry quotes containing `depositAddress`, `depositMemo`,
  `chainDepositAddresses`, `deadline`, or `timeWhenInactive` are rejected.
- Unknown top-level or quote fields, transaction data, and malformed values fail
  closed.
- Signature presence and type are validated. Cryptographic signature
  verification is not implemented because the official SDK/public key setup is
  outside this prototype.
- `amountOutUsd` is contract-required but never used for calculations.

Quote arithmetic uses exact decimal and BigInt base-unit helpers, not floating
point. Raw token amounts are kept as integer strings; human-readable values are
derived from those raw units and rounded only for presentation. Minimum output
is floored after applying the user's slippage cap. NEAR may appear in the 1Click
token list as `wNEAR` (`nep141:wrap.near`); both symbols are accepted.

## API

### `GET /api/health`

Returns dry-run mode, network status (`not-connected`), planned NEAR
configuration, a non-secret `quoteSource` status block, and a non-secret
`priceSource` status block:

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "mode": "dry-run",
    "network": "not-connected",
    "externalCalls": "disabled",
    "quoteSource": {
      "source": "mock",
      "network": "local-mock",
      "liveRequestsEnabled": false,
      "configured": true,
      "dryOnly": true,
      "missingConfiguration": []
    },
    "priceSource": {
      "priceSource": "mock",
      "provider": "local reference",
      "network": "local-reference",
      "liveRequestsEnabled": false,
      "configured": true,
      "fallback": "labeled-mock"
    }
  }
}
```

The health response also reports `externalCalls` as `disabled`,
`public-market-data-only`, or `1click-dry-quote-only`.

### `GET /api/quote/meta`

Returns the supported quote asset (NEAR only), quote limits, the same non-secret
`quoteSource` status, and a `market` block with `priceSource`, provider,
fallback mode, thresholds, and per-pair `lastObservedAt`.

### `POST /api/quote`

Request:

```json
{
  "amountUsd": 14.29,
  "asset": "NEAR",
  "slippageBps": 50
}
```

The request accepts no `dry`, `dryRun`, `depositAddress`, `depositMemo`,
`chainDepositAddresses`, `depositSubmit`, `timeWhenInactive`, or price/fallback
fields such as `priceUsd`, `priceSource`, or `fallback`. Any of those keys is
rejected with `400`; the server alone decides the price source.

Dry-run response (abridged):

```json
{
  "success": true,
  "data": {
    "quoteId": "mock-...",
    "source": "mock",
    "dryRun": true,
    "network": "not-connected",
    "asset": "NEAR",
    "amountUsd": "14.29",
    "feeUsd": "0.04",
    "netUsd": "14.25",
    "priceUsd": "5.20208",
    "priceSource": "coinbase",
    "priceObservedAt": "...",
    "priceAgeMs": 1200,
    "priceStale": false,
    "assetAmount": "2.738...",
    "amountOut": "2738...",
    "amountOutFormatted": "2.738...",
    "slippageBps": 50,
    "minAssetAmount": "2.724...",
    "minAmountOut": "2724...",
    "minAmountOutFormatted": "2.724...",
    "createdAt": "...",
    "expiresAt": "..."
  }
}
```

1Click dry response (abridged):

```json
{
  "success": true,
  "data": {
    "quoteId": "...",
    "source": "1click-dry",
    "dryRun": true,
    "network": "mainnet",
    "asset": "NEAR",
    "originAsset": {
      "symbol": "USDC",
      "assetId": "nep141:...",
      "decimals": 6
    },
    "destinationAsset": {
      "symbol": "NEAR",
      "tokenSymbol": "WNEAR",
      "assetId": "nep141:wrap.near",
      "decimals": 24
    },
    "amountIn": "14290000",
    "amountInFormatted": "14.29",
    "amountOut": "2740384615384615384615384",
    "amountOutFormatted": "2.740384615384615384615384",
    "minAmountOut": "2726682692307692307692308",
    "minAmountOutFormatted": "2.726682692307692307692308",
    "slippageBps": 50,
    "timeEstimate": 120,
    "fetchedAt": "..."
  }
}
```

Live responses never contain a `depositAddress`, request payload, recipient,
refund address, API key, or JWT.

## Project structure

```text
.
├── AGENTS.md                  agent instructions and safety constraints
├── backend/
│   ├── src/
│   │   ├── server.js          Express app, health, CORS, error handling
│   │   ├── routes/quote.routes.js
│   │   └── services/
│   │       ├── quote.service.js       local dry-run quote generator
│   │       ├── quote.limits.js        shared validation and limits
│   │       ├── quote.math.js          exact decimal / BigInt quote math
│   │       ├── market.service.js      optional read-only Coinbase prices
│   │       └── oneclick.service.js    optional read-only 1Click dry quotes
│   └── test/                  mocked-network automated tests
├── frontend/
│   └── src/
│       ├── App.jsx            dashboard state and quote flow
│       ├── components/        plan form, wallet placeholder, quote, history,
│       │                      plan assistant, roadmap
│       ├── data/mock.js       NEAR asset, cadences, simulated history
│       └── lib/
│           ├── format.js      display formatting
│           └── plan.js        single source of truth for DCA math, validation,
│                              and deterministic suggestions
├── scripts/dev.js             runs backend + frontend together
├── .env.example
└── package.json
```

## Safety boundaries

- Demo mode is **NEAR-only, dry-run, and not connected to a wallet**.
- The dry-run quote engine is the default. With `PRICE_SOURCE=mock` and
  `QUOTE_SOURCE=mock`, no external calls are made.
- The optional market-price source is **public, read-only, and keyless**. It
  only reads Coinbase USD tickers. A ticker price is not an executable quote.
- The optional 1Click source is **mainnet-only and read-only**. It requests dry
  quotes only.
- 1Click dry quotes require public recipient/refund addresses only to shape the
  request. They do not connect a wallet or permit a transaction.
- There is no transaction execution, deposit address, deposit submission,
  custody, or signing code.
- Quote amounts use exact fixed-point arithmetic. Raw base units are kept
  internally; formatting happens only for display.
- Upstream 1Click responses must pass the documented dry-quote contract and are
  rejected if they contain deposit or transaction data.
- Start with **NEAR-only deposits** if deposits are ever added; cross-chain is a
  later stretch goal.
- The Plan assistant may suggest strategy parameters only. Do not silently
  apply or execute anything.
- Users set and approve spending, timing, asset, and slippage constraints.
- Never ask for a private key, seed phrase, or wallet signature in this
  prototype.
- Keep secrets in local `.env` only; commit `.env.example`, never `.env`.

## Known limitations

- Saved strategies and added history rows live in React state only. A page
  refresh resets them to the seeded demo state.
- Only one active strategy exists at a time; saving again replaces it. There is
  no strategy list, open, or delete flow.
- The four-cycle run demo uses fixed outcomes and a single dry-run quote. It is
  not execution, scheduling, or proof that any trade occurred.
- 1Click responses only have their signature presence/type checked.
  Cryptographic signature verification is not implemented.
- The response allowlist is based on the published OpenAPI schema. A future
  1Click field will be rejected until the allowlist is updated deliberately.
- The live source supports the NEAR-only DCA route (USDC on NEAR to NEAR/wNEAR).
- Market prices are best-effort public ticker data. NEAR trades can be
  intermittent, so a ticker may briefly be flagged stale. Coinbase's public
  rate limit applies; the service caches for 15 seconds and caps concurrent
  requests, but it is not a production market-data system.
- BTC and ETH have market prices but are not selectable quote targets yet.
- There is no persistence, authentication, or rate limiting on the local API;
  it is a prototype.

## Demo post and screenshots

No public demo post, video, or screenshots exist in this repository yet.

- Demo post (X): _not published yet_
- Demo video: _not recorded yet_
- Screenshots: _not added yet_

When the post is published, it should state that the project was built at NEAR
HACKATHON and tag `@NEARProtocol` and `#NEARHackathon`. Replace the placeholders
with the real links only after they exist.

## What Phlax does not implement yet

Not implemented in this repository:

- Wallet connection, account display, or signatures.
- USDC deposits, custody, or fund movement.
- Trade execution, settlement, or transaction submission.
- A scheduler or interval runner; the plan form and **Run next 4 cycles** are
  manual demo actions.
- Real quote status tracking. `FAILED` and `REFUNDED` appear only as simulated
  history labels.
- BTC or ETH quote targets; only NEAR is selectable. BTC/ETH prices are
  display-only market data.
- Cross-chain deposits or settlement.
- A NEAR contract or Chain Signatures.
- Persistence, authentication, or rate limiting. The API is local-only.

Ordered next milestones:

1. Connect a NEAR wallet and display the account ID.
2. Add opt-in transaction execution and status tracking after a separate safety
   review.
3. Track real quote statuses, including FAILED and REFUNDED.
4. Add cross-chain deposits only after the NEAR-only flow works.
