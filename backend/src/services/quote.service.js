import {
  MAX_AMOUNT_USD,
  MAX_SLIPPAGE_BPS,
  MIN_AMOUNT_USD,
  MIN_SLIPPAGE_BPS,
  validateQuoteInput,
} from "./quote.limits.js";
import { getQuoteSourceStatus } from "./oneclick.service.js";
import {
  getMarketPrice,
  getPriceStatus,
  getReferencePriceUsd,
} from "./market.service.js";
import {
  applySlippage,
  baseUnitsToDecimal,
  centsToUsdText,
  mulDivRoundHalfUp,
} from "./quote.math.js";

// Quote targets stay NEAR-only in this phase. The market service can read
// prices for NEAR, BTC, and ETH, but only NEAR is selectable for a quote.
const QUOTE_ASSETS = {
  NEAR: {
    name: "NEAR Protocol",
    decimals: 24,
  },
};

const FEE_BPS = 30n;
const QUOTE_TTL_MS = 60_000;

function priceWarnings(price) {
  const warnings = [];

  if (price.provider === "coinbase") {
    warnings.push(
      `Market price: Coinbase Exchange ${price.pair} last trade at ${price.observedAt}.`
    );

    if (price.stale) {
      warnings.push(
        `Market price is stale (${Math.max(
          1,
          Math.round(price.ageMs / 1000)
        )}s old).`
      );
    }

    warnings.push(
      "A market price is not an executable NEAR Intents quote. The token quantity is simulated."
    );
  } else if (price.provider === "mock-fallback") {
    warnings.push(
      "Live market price unavailable; using the local reference price. This is not market data."
    );
    warnings.push(
      "The token quantity is simulated and is not an executable NEAR Intents quote."
    );
  } else {
    warnings.push(
      "Mock reference price generated locally. No live market data was used."
    );
    warnings.push(
      "The token quantity is simulated and is not an executable NEAR Intents quote."
    );
  }

  return warnings;
}

export function getQuoteMeta() {
  const quoteSource = getQuoteSourceStatus();

  return {
    mode: "dry-run",
    source: quoteSource.source,
    network: quoteSource.network,
    nearNetworkPlanned: process.env.NEAR_NETWORK || "testnet",
    quoteSource,
    market: getPriceStatus(),
    assets: Object.entries(QUOTE_ASSETS).map(([symbol, info]) => ({
      symbol,
      name: info.name,
      referencePriceUsd: getReferencePriceUsd(symbol),
    })),
    limits: {
      minAmountUsd: MIN_AMOUNT_USD,
      maxAmountUsd: MAX_AMOUNT_USD,
      minSlippageBps: MIN_SLIPPAGE_BPS,
      maxSlippageBps: MAX_SLIPPAGE_BPS,
    },
  };
}

export async function createMockQuote(input = {}) {
  const { amountUsd, amountUsdCents, asset, slippageBps } =
    validateQuoteInput(input);
  const assetInfo = QUOTE_ASSETS[asset];
  const price = await getMarketPrice(asset);
  const priceUsdMicros = BigInt(price.priceUsdMicros);
  const amountCents = BigInt(amountUsdCents);
  const feeCents = mulDivRoundHalfUp(amountCents, FEE_BPS, 10_000n);
  const netCents = amountCents - feeCents;

  // USD value -> token base units:
  // (netCents / 100) / (priceMicros / 10^6) * 10^decimals
  const outputBaseUnits =
    (netCents * 10n ** BigInt(4 + assetInfo.decimals)) / priceUsdMicros;
  const minOutputBaseUnits = BigInt(
    applySlippage(outputBaseUnits, slippageBps)
  );
  const assetAmount = baseUnitsToDecimal(
    outputBaseUnits,
    assetInfo.decimals
  );
  const minAssetAmount = baseUnitsToDecimal(
    minOutputBaseUnits,
    assetInfo.decimals
  );
  const createdAt = new Date();

  return {
    quoteId: `mock-${createdAt.getTime().toString(36)}-${asset.toLowerCase()}`,
    source: "mock",
    dryRun: true,
    network: "not-connected",
    nearNetworkPlanned: process.env.NEAR_NETWORK || "testnet",
    asset,
    assetName: assetInfo.name,
    amountUsd,
    amountUsdCents,
    feeUsd: centsToUsdText(feeCents),
    netUsd: centsToUsdText(netCents),
    priceUsd: price.priceUsdText,
    priceSource: price.provider,
    priceObservedAt: price.observedAt,
    priceAgeMs: price.ageMs,
    priceStale: price.stale,
    assetAmount,
    amountOut: outputBaseUnits.toString(),
    amountOutFormatted: assetAmount,
    slippageBps,
    minAssetAmount,
    minAmountOut: minOutputBaseUnits.toString(),
    minAmountOutFormatted: minAssetAmount,
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + QUOTE_TTL_MS).toISOString(),
    warnings: [
      "Dry-run quote generated locally. No 1Click API call was made.",
      ...priceWarnings(price),
      "No funds can move in dry-run mode.",
    ],
  };
}
