import { validateQuoteInput } from "./quote.limits.js";
import {
  baseUnitsToDecimal,
  decimalToBaseUnits,
  effectivePriceUsd,
  parseDecimal,
} from "./quote.math.js";

const ONECLICK_BASE_URL = "https://1click.chaindefuser.com";
const LIVE_SOURCE = "1click-dry";
const MOCK_SOURCE = "mock";
const INVALID_SOURCE = "invalid";
const TOKEN_CACHE_TTL_MS = 10 * 60_000;
const REQUEST_TIMEOUT_MS = 15_000;

// This integration is dry-only by construction. No environment variable can
// turn it into a transaction request.
const DRY_ONLY = true;

const SWAP_TYPE = "EXACT_INPUT";
const DEPOSIT_TYPE = "ORIGIN_CHAIN";
const REFUND_TYPE = "ORIGIN_CHAIN";
const RECIPIENT_TYPE = "DESTINATION_CHAIN";

const TOP_LEVEL_RESPONSE_KEYS = new Set([
  "correlationId",
  "timestamp",
  "signature",
  "quoteRequest",
  "quote",
]);

// Documented Quote schema fields. Unknown fields fail closed so new
// transaction or deposit metadata cannot slip through silently.
const QUOTE_RESPONSE_KEYS = new Set([
  "depositAddress",
  "depositMemo",
  "chainDepositAddresses",
  "amountIn",
  "amountInFormatted",
  "amountInUsd",
  "minAmountIn",
  "amountOut",
  "amountOutFormatted",
  "amountOutUsd",
  "minAmountOut",
  "deadline",
  "timeWhenInactive",
  "timeEstimate",
  "virtualChainRecipient",
  "virtualChainRefundRecipient",
  "customRecipientMsg",
  "refundFee",
  "withdrawFee",
]);

// A dry quote must not contain these fields according to the QuoteRequest
// `dry` contract. `deadline` is allowed on the echoed request itself.
const DRY_FORBIDDEN_QUOTE_KEYS = new Set([
  "depositAddress",
  "depositMemo",
  "chainDepositAddresses",
  "deadline",
  "timeWhenInactive",
]);

const FORBIDDEN_DEPOSIT_KEYS = new Set([
  "depositaddress",
  "depositmemo",
  "depositsubmit",
  "chaindepositaddresses",
]);

const FORBIDDEN_TRANSACTION_KEYS = new Set([
  "transaction",
  "transactions",
  "transactionhash",
  "txhash",
  "signeddata",
  "signedtransaction",
  "intenthashes",
]);

const TOKEN_SYMBOL_ALIASES = {
  NEAR: ["NEAR", "WNEAR"],
};

let tokenCache = {
  fetchedAt: 0,
  tokens: [],
};

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isEnabledFlag(value) {
  return ["true", "1", "yes"].includes(asString(value).toLowerCase());
}

function isDisabledFlag(value) {
  return ["false", "0", "no"].includes(asString(value).toLowerCase());
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeKey(key) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findForbiddenKey(value, forbiddenKeys, seen = new Set()) {
  if (!value || typeof value !== "object") return null;
  if (seen.has(value)) return null;

  seen.add(value);

  for (const [key, child] of Object.entries(value)) {
    if (forbiddenKeys.has(normalizeKey(key))) {
      return key;
    }

    const nested = findForbiddenKey(child, forbiddenKeys, seen);

    if (nested) return nested;
  }

  return null;
}

export function resetOneClickTokenCacheForTests() {
  tokenCache = { fetchedAt: 0, tokens: [] };
}

export function getQuoteSourceConfig() {
  const requestedSource = asString(process.env.QUOTE_SOURCE).toLowerCase();
  const invalidSource =
    requestedSource !== "" &&
    requestedSource !== MOCK_SOURCE &&
    requestedSource !== LIVE_SOURCE;
  const source = invalidSource
    ? INVALID_SOURCE
    : requestedSource === LIVE_SOURCE
      ? LIVE_SOURCE
      : MOCK_SOURCE;
  const recipient = asString(process.env.ONECLICK_DRY_RECIPIENT);
  const refundTo = asString(process.env.ONECLICK_DRY_REFUND_TO);
  const missingConfiguration = [];

  if (source === LIVE_SOURCE) {
    if (!recipient) missingConfiguration.push("ONECLICK_DRY_RECIPIENT");
    if (!refundTo) missingConfiguration.push("ONECLICK_DRY_REFUND_TO");
  }

  const dryDisabled =
    source === LIVE_SOURCE && isDisabledFlag(process.env.ONECLICK_DRY);
  const transactionOverrideDetected =
    source === LIVE_SOURCE &&
    isEnabledFlag(process.env.ONECLICK_ALLOW_TRANSACTIONS);

  return {
    source,
    network:
      source === LIVE_SOURCE
        ? "mainnet"
        : source === MOCK_SOURCE
          ? "local-mock"
          : "invalid-config",
    liveRequestsEnabled: source === LIVE_SOURCE,
    configured:
      source === MOCK_SOURCE
        ? true
        : source === LIVE_SOURCE
          ? missingConfiguration.length === 0 &&
            !dryDisabled &&
            !transactionOverrideDetected
          : false,
    dryOnly: DRY_ONLY,
    dryDisabled,
    transactionOverrideDetected,
    invalidSource,
    missingConfiguration,
    recipient,
    refundTo,
  };
}

export function getQuoteSourceStatus() {
  const config = getQuoteSourceConfig();

  return {
    source: config.source,
    network: config.network,
    liveRequestsEnabled: config.liveRequestsEnabled,
    configured: config.configured,
    dryOnly: config.dryOnly,
    invalidSource: config.invalidSource,
    missingConfiguration: config.missingConfiguration,
    transactionOverridesRejected: config.transactionOverrideDetected,
  };
}

function configurationError(
  errors,
  message = "Live 1Click dry quotes are not configured. No 1Click request was made."
) {
  const error = new Error(message);
  error.statusCode = 503;
  error.code = "QUOTE_SOURCE_NOT_CONFIGURED";
  error.errors = errors;
  return error;
}

function upstreamError(message, status) {
  const error = new Error(message);
  error.statusCode = 502;
  error.code = "ONECLICK_UPSTREAM_ERROR";
  error.upstreamStatus = status;
  return error;
}

function invalidResponseError(detail) {
  return upstreamError(
    `1Click returned an unexpected response: ${detail}. No transaction was created.`
  );
}

function assertDryConfiguration() {
  const config = getQuoteSourceConfig();

  if (config.invalidSource) {
    throw configurationError(
      [
        "QUOTE_SOURCE must be unset, mock, or 1click-dry. No 1Click request was made.",
      ],
      "Invalid QUOTE_SOURCE configuration. No 1Click request was made."
    );
  }

  if (!config.liveRequestsEnabled) {
    return config;
  }

  const errors = [];

  if (config.missingConfiguration.length > 0) {
    errors.push(
      `Set ${config.missingConfiguration.join(" and ")} in your local .env before enabling 1Click dry quotes.`
    );
  }

  if (config.dryDisabled) {
    errors.push(
      "ONECLICK_DRY cannot disable dry mode. dry:true is hardcoded in the server."
    );
  }

  if (config.transactionOverrideDetected) {
    errors.push(
      "Transaction overrides are not supported. This integration can only request dry quotes."
    );
  }

  if (errors.length > 0) {
    throw configurationError(errors);
  }

  return config;
}

function authHeaders() {
  const apiKey = asString(process.env.ONECLICK_API_KEY);

  if (apiKey) {
    return { "X-API-Key": apiKey };
  }

  const legacyJwt = asString(process.env.ONECLICK_JWT);

  return legacyJwt ? { Authorization: `Bearer ${legacyJwt}` } : {};
}

async function fetchJson(url, options = {}) {
  const { auth = false, ...requestOptions } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...requestOptions,
      headers: {
        Accept: "application/json",
        ...(auth ? authHeaders() : {}),
        ...(requestOptions.headers || {}),
      },
      signal: controller.signal,
    });
    const text = await response.text();
    let payload = null;

    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
    }

    if (!response.ok) {
      throw upstreamError(
        `1Click returned HTTP ${response.status}. No transaction was created.`,
        response.status
      );
    }

    if (!payload) {
      throw upstreamError(
        "1Click returned an unreadable response. No transaction was created."
      );
    }

    return payload;
  } catch (error) {
    if (error.statusCode) {
      throw error;
    }

    if (error.name === "AbortError") {
      throw upstreamError(
        "1Click did not respond in time. No transaction was created."
      );
    }

    throw upstreamError(
      "Could not reach 1Click. No transaction was created."
    );
  } finally {
    clearTimeout(timer);
  }
}

function normalizeToken(token = {}) {
  return {
    assetId: asString(token.assetId) || asString(token.id),
    symbol: asString(token.symbol).toUpperCase(),
    name: asString(token.name) || asString(token.symbol),
    decimals: Number.isInteger(token.decimals) ? token.decimals : null,
    blockchain: asString(token.blockchain).toLowerCase(),
    contractAddress: asString(token.contractAddress),
  };
}

function pickToken(tokens, symbol) {
  const requested = symbol.toUpperCase();
  const aliases = TOKEN_SYMBOL_ALIASES[requested] || [requested];
  const matches = tokens
    .map(normalizeToken)
    .filter(
      (token) =>
        token.assetId &&
        token.decimals !== null &&
        token.decimals >= 0 &&
        token.blockchain === "near" &&
        aliases.includes(token.symbol)
    );

  if (requested === "NEAR") {
    return (
      matches.find(
        (token) =>
          token.assetId === "nep141:wrap.near" ||
          token.contractAddress === "wrap.near" ||
          token.symbol === "WNEAR"
      ) ||
      matches[0] ||
      null
    );
  }

  return matches[0] || null;
}

async function getTokens() {
  const now = Date.now();

  if (
    tokenCache.tokens.length > 0 &&
    now - tokenCache.fetchedAt < TOKEN_CACHE_TTL_MS
  ) {
    return tokenCache.tokens;
  }

  const payload = await fetchJson(`${ONECLICK_BASE_URL}/v0/tokens`);

  if (!Array.isArray(payload)) {
    throw upstreamError(
      "1Click returned an unexpected token list. No transaction was created."
    );
  }

  tokenCache = { fetchedAt: now, tokens: payload };
  return payload;
}

function assertString(value, label) {
  if (!asString(value)) {
    throw invalidResponseError(`${label} is missing or invalid`);
  }

  return value;
}

function assertIntegerString(value, label) {
  const text = typeof value === "string" ? value.trim() : "";

  if (!/^\d+$/.test(text)) {
    throw invalidResponseError(`${label} is not an integer amount`);
  }

  return text;
}

function assertDecimalString(value, label) {
  if (typeof value !== "string" || !parseDecimal(value)) {
    throw invalidResponseError(`${label} is not a decimal amount`);
  }

  return value;
}

function assertDateString(value, label) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw invalidResponseError(`${label} is not a valid timestamp`);
  }

  return value;
}

function assertPlainObject(value, label) {
  if (!isPlainObject(value)) {
    throw invalidResponseError(`${label} is missing or invalid`);
  }

  return value;
}

function assertNoForbiddenResponseData(payload) {
  const depositKey = findForbiddenKey(payload, FORBIDDEN_DEPOSIT_KEYS);

  if (depositKey) {
    throw invalidResponseError(
      "the dry quote contained deposit data, which is never accepted"
    );
  }

  const transactionKey = findForbiddenKey(payload, FORBIDDEN_TRANSACTION_KEYS);

  if (transactionKey) {
    throw invalidResponseError(
      "the response contained transaction data, which is never accepted"
    );
  }
}

function assertNoUnknownKeys(object, allowedKeys, label) {
  const unexpected = Object.keys(object).filter((key) => !allowedKeys.has(key));

  if (unexpected.length > 0) {
    throw invalidResponseError(`${label} contained unexpected fields`);
  }
}

function validateEchoedRequest(quoteRequest, context) {
  assertPlainObject(quoteRequest, "quoteRequest");

  if (quoteRequest.dry !== true) {
    throw invalidResponseError(
      "the response did not confirm dry:true, so it was rejected"
    );
  }

  assertDateString(quoteRequest.deadline, "quoteRequest.deadline");

  const expectedFields = {
    swapType: SWAP_TYPE,
    slippageTolerance: context.slippageBps,
    originAsset: context.origin.assetId,
    depositType: DEPOSIT_TYPE,
    destinationAsset: context.destination.assetId,
    amount: context.amount,
    refundTo: context.refundTo,
    refundType: REFUND_TYPE,
    recipient: context.recipient,
    recipientType: RECIPIENT_TYPE,
  };

  for (const [field, expected] of Object.entries(expectedFields)) {
    if (quoteRequest[field] !== expected) {
      throw invalidResponseError(
        `quoteRequest.${field} did not match the outgoing request`
      );
    }
  }
}

function normalizeQuoteResponse(payload, context) {
  assertPlainObject(payload, "response");
  assertNoForbiddenResponseData(payload);
  assertNoUnknownKeys(payload, TOP_LEVEL_RESPONSE_KEYS, "response");

  const correlationId = assertString(
    payload.correlationId,
    "correlationId"
  );
  assertDateString(payload.timestamp, "timestamp");
  assertString(payload.signature, "signature");
  validateEchoedRequest(payload.quoteRequest, context);

  const quote = assertPlainObject(payload.quote, "quote");
  const forbiddenQuoteKey = Object.keys(quote).find((key) =>
    DRY_FORBIDDEN_QUOTE_KEYS.has(key)
  );

  if (forbiddenQuoteKey) {
    throw invalidResponseError(
      `the dry quote contained ${forbiddenQuoteKey}, which is never accepted`
    );
  }

  assertNoUnknownKeys(quote, QUOTE_RESPONSE_KEYS, "quote");

  const amountIn = assertIntegerString(quote.amountIn, "quote.amountIn");
  const minAmountIn = assertIntegerString(
    quote.minAmountIn,
    "quote.minAmountIn"
  );
  const amountOut = assertIntegerString(quote.amountOut, "quote.amountOut");
  const minAmountOut = assertIntegerString(
    quote.minAmountOut,
    "quote.minAmountOut"
  );

  assertDecimalString(quote.amountInFormatted, "quote.amountInFormatted");
  assertDecimalString(quote.amountOutFormatted, "quote.amountOutFormatted");
  // Contract-required but never used for calculations.
  assertDecimalString(quote.amountInUsd, "quote.amountInUsd");
  assertDecimalString(quote.amountOutUsd, "quote.amountOutUsd");

  if (
    typeof quote.timeEstimate !== "number" ||
    !Number.isFinite(quote.timeEstimate) ||
    quote.timeEstimate < 0
  ) {
    throw invalidResponseError("quote.timeEstimate is not a valid duration");
  }

  if (BigInt(amountIn) !== BigInt(context.amount)) {
    throw invalidResponseError(
      "quote.amountIn did not match the requested input amount"
    );
  }

  if (BigInt(amountIn) <= 0n || BigInt(minAmountIn) <= 0n) {
    throw invalidResponseError("quote input amounts must be positive");
  }

  if (BigInt(minAmountIn) > BigInt(amountIn)) {
    throw invalidResponseError(
      "quote.minAmountIn was greater than the requested input amount"
    );
  }

  if (BigInt(amountOut) <= 0n || BigInt(minAmountOut) <= 0n) {
    throw invalidResponseError("quote output amounts must be positive");
  }

  if (BigInt(minAmountOut) > BigInt(amountOut)) {
    throw invalidResponseError(
      "quote.minAmountOut was greater than quote.amountOut"
    );
  }

  // Derive presentation amounts from the raw base units, not from the
  // upstream formatted or USD strings.
  const amountInFormatted = baseUnitsToDecimal(
    amountIn,
    context.origin.decimals
  );
  const amountOutFormatted = baseUnitsToDecimal(
    amountOut,
    context.destination.decimals
  );
  const minAmountOutFormatted = baseUnitsToDecimal(
    minAmountOut,
    context.destination.decimals
  );
  const priceUsd = effectivePriceUsd(
    context.amountUsdCents,
    amountOut,
    context.destination.decimals
  );

  return {
    quoteId: correlationId,
    source: LIVE_SOURCE,
    dryRun: true,
    network: "mainnet",
    nearNetworkPlanned: process.env.NEAR_NETWORK || "testnet",
    asset: context.asset,
    assetName: context.assetName,
    amountUsd: context.amountUsd,
    amountUsdCents: context.amountUsdCents,
    feeUsd: null,
    priceUsd,
    assetAmount: amountOutFormatted,
    amountOut,
    amountOutFormatted,
    slippageBps: context.slippageBps,
    minAssetAmount: minAmountOutFormatted,
    minAmountOut,
    minAmountOutFormatted,
    originAsset: {
      symbol: context.origin.symbol,
      name: context.origin.name,
      assetId: context.origin.assetId,
      decimals: context.origin.decimals,
    },
    destinationAsset: {
      symbol: context.asset,
      tokenSymbol: context.destination.symbol,
      name: context.destination.name,
      assetId: context.destination.assetId,
      decimals: context.destination.decimals,
    },
    amountIn,
    amountInFormatted,
    timeEstimate: quote.timeEstimate,
    fetchedAt: new Date().toISOString(),
    warnings: [
      "Live 1Click dry quote — mainnet market data, no transaction.",
      "Read-only request. No deposit address was requested, stored, or displayed.",
      "No wallet, signature, or funds were used.",
    ],
  };
}

export async function createOneClickDryQuote(input = {}) {
  const config = assertDryConfiguration();
  const validated = validateQuoteInput(input);
  const { amountUsd, amountUsdCents, asset, slippageBps } = validated;
  const tokens = await getTokens();
  const origin = pickToken(tokens, "USDC");
  const destination = pickToken(tokens, asset);

  if (!origin) {
    throw upstreamError(
      "1Click token metadata did not include USDC on NEAR. No transaction was created."
    );
  }

  if (!destination) {
    throw upstreamError(
      `1Click token metadata did not include ${asset} on NEAR. No transaction was created.`
    );
  }

  let amount;

  try {
    amount = decimalToBaseUnits(amountUsd, origin.decimals);
  } catch {
    const error = new Error("Invalid quote request");
    error.statusCode = 400;
    error.errors = [
      "amountUsd has more precision than the origin token supports.",
    ];
    throw error;
  }

  const deadline = new Date(Date.now() + 5 * 60_000).toISOString();
  const quoteRequest = {
    dry: DRY_ONLY,
    swapType: SWAP_TYPE,
    slippageTolerance: slippageBps,
    originAsset: origin.assetId,
    depositType: DEPOSIT_TYPE,
    destinationAsset: destination.assetId,
    amount,
    refundTo: config.refundTo,
    refundType: REFUND_TYPE,
    recipient: config.recipient,
    recipientType: RECIPIENT_TYPE,
    deadline,
  };

  // Defense in depth: the outgoing request can never become a transaction.
  if (quoteRequest.dry !== true || "depositAddress" in quoteRequest) {
    throw configurationError([
      "Only dry quote requests are allowed. No transaction was created.",
    ]);
  }

  const payload = await fetchJson(`${ONECLICK_BASE_URL}/v0/quote`, {
    method: "POST",
    auth: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(quoteRequest),
  });

  return normalizeQuoteResponse(payload, {
    amount,
    amountUsd,
    amountUsdCents,
    asset,
    assetName: destination.name,
    slippageBps,
    origin,
    destination,
    recipient: config.recipient,
    refundTo: config.refundTo,
  });
}
