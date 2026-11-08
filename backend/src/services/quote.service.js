import {
  MAX_AMOUNT_USD,
  MAX_SLIPPAGE_BPS,
  MIN_AMOUNT_USD,
  MIN_SLIPPAGE_BPS,
  validateQuoteInput,
} from "./quote.limits.js";
import { getQuoteSourceStatus } from "./oneclick.service.js";
import {
  applySlippage,
  baseUnitsToDecimal,
  centsToUsdText,
  mulDivRoundHalfUp,
} from "./quote.math.js";

const ASSET_PRICES = {
  NEAR: {
    name: "NEAR Protocol",
    priceUsd: 5.2,
    priceUsdMicros: 5_200_000n,
    decimals: 24,
  },
};

const FEE_BPS = 30n;
const QUOTE_TTL_MS = 60_000;

function mockPrice(asset) {
  const minute = Math.floor(Date.now() / 60_000);
  const driftBps = (minute % 9) - 4;
  const priceUsdMicros = mulDivRoundHalfUp(
    ASSET_PRICES[asset].priceUsdMicros,
    10_000 + driftBps,
    10_000
  );

  return {
    priceUsdMicros,
    priceUsdText: baseUnitsToDecimal(priceUsdMicros, 6),
  };
}

export function getQuoteMeta() {
  const quoteSource = getQuoteSourceStatus();

  return {
    mode: "dry-run",
    source: quoteSource.source,
    network: quoteSource.network,
    nearNetworkPlanned: process.env.NEAR_NETWORK || "testnet",
    quoteSource,
    assets: Object.entries(ASSET_PRICES).map(([symbol, info]) => ({
      symbol,
      name: info.name,
      referencePriceUsd: info.priceUsd,
    })),
    limits: {
      minAmountUsd: MIN_AMOUNT_USD,
      maxAmountUsd: MAX_AMOUNT_USD,
      minSlippageBps: MIN_SLIPPAGE_BPS,
      maxSlippageBps: MAX_SLIPPAGE_BPS,
    },
  };
}

export function createMockQuote(input = {}) {
  const { amountUsd, amountUsdCents, asset, slippageBps } =
    validateQuoteInput(input);
  const assetInfo = ASSET_PRICES[asset];
  const { priceUsdMicros, priceUsdText } = mockPrice(asset);
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
    priceUsd: priceUsdText,
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
      "Mock quote generated locally. No 1Click API call was made.",
      "No funds can move in dry-run mode.",
    ],
  };
}
