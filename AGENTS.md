# AI Trading Vault — Project Instructions

## Product
Build a non-custodial AI copilot for cross-chain DCA vaults on NEAR.

## Hackathon track
NEAR Hackathon Track 01: Unstoppable DeFi (`defi`).

## MVP
- Wallet connection
- USDC deposits from supported chains
- Target assets: BTC, ETH, and NEAR
- DCA schedule, per-trade budget, slippage cap, and risk controls
- NEAR Intents / 1Click quotes, execution, and status tracking
- Dry-run mode with real quotes and no fund movement
- Clear failed and refunded states
- Dashboard showing fund location and trade history

## Safety
- The AI may suggest strategy parameters only.
- Users set and approve all spending, timing, asset, and slippage constraints.
- Never execute unrestricted or unapproved trades.
- Default to dry-run when the transaction environment is unclear.

## Engineering
- Keep secrets in local environment files only.
- Make small, focused commits.
- Before editing, inspect existing code and reuse project patterns.
- Run relevant checks before declaring work complete.
- Do not change unrelated files.
