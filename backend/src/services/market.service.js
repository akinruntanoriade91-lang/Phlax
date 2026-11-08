// Read-only public market data for price previews.
//
// This module never creates a quote, deposit, transaction, or signature. It
// only reads a public ticker from a fixed provider and returns a validated
// snapshot. Prices are for display and simulated quantity calculations; they
// are not executable NEAR Intents quotes.

import {
  baseUnitsToDecimal,
  mulDivRoundHalfUp,
  parseDecimal,
} from "./quote.math.js";

const COINBASE_BASE_URL = "https://api.exchange.coinbase.com";
const LIVE_SOURCE = "coinbase";
const MOCK_SOURCE = "mock";
const INVALID_SOURCE = "invalid";

const PRICE_DECIMALS = 6;
const PRICE_SCALE = 10n ** BigInt(PRICE_DECIMALS);
const MAX_PRICE_MICROS = 1_000_000_000n * PRICE_SCALE;

const DEFAULT_TTL_MS = 15_000;
const DEFAULT_STALE_MS = 60_000;
const DEFAULT_MAX_AGE_MS = 300_000;
const REQUEST_TIMEOUT_MS = 5_000;
const MAX_FUTURE_SKEW_MS = 60_000;

const ASSETS = {
  NEAR: {
    pair: "NEAR-USD",
    referencePriceUsdMicros: 5_200_000n,
  },
  BTC: {
    pair: "BTC-USD",
    referencePriceUsdMicros: 68_500_000_000n,
  },
  ETH: {
    pair: "ETH-USD",
    referencePriceUsdMicros: 3_200_000_000n,
  },
};

// pair -> { asset, pair, priceUsdText, priceUsdMicros, observedMs, fetchedAt }
let priceCache = new Map();
let inFlight = new Map();

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function marketError(message, statusCode, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function upstreamError(message, upstreamStatus) {
  const error = marketError(message, 502, "PRICE_UPSTREAM_ERROR");
  error.upstreamStatus = upstreamStatus;
  return error;
}

export function resetMarketCacheForTests() {
  priceCache = new Map();
  inFlight = new Map();
}

export function getPriceConfig() {
  const requested = asString(process.env.PRICE_SOURCE).toLowerCase();
  const invalidSource =
    requested !== "" && requested !== MOCK_SOURCE && requested !== LIVE_SOURCE;
  const source = invalidSource
    ? INVALID_SOURCE
    : requested === LIVE_SOURCE
      ? LIVE_SOURCE
      : MOCK_SOURCE;

  const requestedFallback = asString(process.env.PRICE_FALLBACK).toLowerCase();
  const invalidFallback =
    requestedFallback !== "" &&
    requestedFallback !== "labeled-mock" &&
    requestedFallback !== "off";
  const fallback = invalidFallback
    ? "invalid"
    : requestedFallback === "off"
      ? "off"
      : "labeled-mock";

  const staleMs = positiveInteger(process.env.PRICE_STALE_MS, DEFAULT_STALE_MS);
  const maxAgeMs = Math.max(
    staleMs,
    positiveInteger(process.env.PRICE_MAX_AGE_MS, DEFAULT_MAX_AGE_MS)
  );

  return {
    source,
    invalidSource,
    fallback,
    invalidFallback,
    ttlMs: positiveInteger(process.env.PRICE_TTL_MS, DEFAULT_TTL_MS),
    staleMs,
    maxAgeMs,
  };
}

export function getPriceStatus() {
  const config = getPriceConfig();
  const provider =
    config.source === LIVE_SOURCE
      ? "Coinbase Exchange"
      : config.source === MOCK_SOURCE
        ? "local reference"
        : "invalid configuration";

  return {
    priceSource: config.source,
    provider,
    network:
      config.source === LIVE_SOURCE
        ? "public-market-data"
        : config.source === MOCK_SOURCE
          ? "local-reference"
          : "invalid-config",
    liveRequestsEnabled: config.source === LIVE_SOURCE,
    configured: !config.invalidSource && !config.invalidFallback,
    fallback: config.fallback,
    invalidSource: config.invalidSource,
    invalidFallback: config.invalidFallback,
    staleAfterMs: config.staleMs,
    maxAgeMs: config.maxAgeMs,
    pairs: Object.fromEntries(
      Object.entries(ASSETS).map(([symbol, info]) => [
        symbol,
        {
          pair: info.pair,
          lastObservedAt: priceCache.get(info.pair)
            ? new Date(priceCache.get(info.pair).observedMs).toISOString()
            : null,
        },
      ])
    ),
  };
}

export function getReferencePriceUsd(asset) {
  const info = ASSETS[asset];

  if (!info) {
    throw marketError(
      `Unsupported market-price asset: ${asset}.`,
      400,
      "INVALID_PRICE_ASSET"
    );
  }

  return baseUnitsToDecimal(info.referencePriceUsdMicros, PRICE_DECIMALS);
}

function priceToMicros(text) {
  const parsed = parseDecimal(text);

  if (!parsed) {
    throw new Error("Price is not a decimal string.");
  }

  const padded = parsed.fraction.padEnd(PRICE_DECIMALS + 1, "0");
  const kept = padded.slice(0, PRICE_DECIMALS);
  const nextDigit = padded[PRICE_DECIMALS];
  let micros = BigInt(parsed.whole) * PRICE_SCALE + BigInt(kept);

  if (nextDigit >= "5") {
    micros += 1n;
  }

  return micros;
}

function mockSnapshot(asset, now, overrides = {}) {
  const info = ASSETS[asset];
  const minute = Math.floor(now / 60_000);
  const driftBps = (minute % 9) - 4;
  const priceUsdMicros = mulDivRoundHalfUp(
    info.referencePriceUsdMicros,
    10_000 + driftBps,
    10_000
  );
  const observedAt = new Date(now).toISOString();

  return {
    asset,
    pair: info.pair,
    provider: "mock",
    priceUsdText: baseUnitsToDecimal(priceUsdMicros, PRICE_DECIMALS),
    priceUsdMicros: priceUsdMicros.toString(),
    observedAt,
    fetchedAt: observedAt,
    ageMs: 0,
    stale: false,
    fallbackReason: null,
    ...overrides,
  };
}

function toSnapshot(record, now, config) {
  const ageMs = Math.max(0, now - record.observedMs);

  return {
    asset: record.asset,
    pair: record.pair,
    provider: LIVE_SOURCE,
    priceUsdText: record.priceUsdText,
    priceUsdMicros: record.priceUsdMicros,
    observedAt: new Date(record.observedMs).toISOString(),
    fetchedAt: new Date(record.fetchedAt).toISOString(),
    ageMs,
    stale: ageMs > config.staleMs,
    fallbackReason: null,
  };
}

function validateTicker(payload, asset, pair, config, now) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw upstreamError(`Coinbase returned an unreadable ${pair} ticker.`);
  }

  if (typeof payload.price !== "string" || !parseDecimal(payload.price)) {
    throw upstreamError(`Coinbase returned an invalid ${pair} price.`);
  }

  if (typeof payload.time !== "string") {
    throw upstreamError(`Coinbase returned no ${pair} trade timestamp.`);
  }

  const observedMs = Date.parse(payload.time);

  if (!Number.isFinite(observedMs)) {
    throw upstreamError(`Coinbase returned an invalid ${pair} timestamp.`);
  }

  if (observedMs > now + MAX_FUTURE_SKEW_MS) {
    throw upstreamError(`Coinbase returned a future ${pair} timestamp.`);
  }

  let priceUsdMicros;

  try {
    priceUsdMicros = priceToMicros(payload.price);
  } catch {
    throw upstreamError(`Coinbase returned an unrepresentable ${pair} price.`);
  }

  if (priceUsdMicros <= 0n || priceUsdMicros > MAX_PRICE_MICROS) {
    throw upstreamError(`Coinbase returned an out-of-range ${pair} price.`);
  }

  const ageMs = Math.max(0, now - observedMs);

  if (ageMs > config.maxAgeMs) {
    throw upstreamError(
      `Coinbase ${pair} last trade is older than the allowed ${Math.max(
        1,
        Math.ceil(config.maxAgeMs / 1000)
      )}s window.`
    );
  }

  return {
    asset,
    pair,
    priceUsdText: baseUnitsToDecimal(priceUsdMicros, PRICE_DECIMALS),
    priceUsdMicros: priceUsdMicros.toString(),
    observedMs,
    fetchedAt: now,
  };
}

async function fetchTicker(asset, config, now) {
  const { pair } = ASSETS[asset];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${COINBASE_BASE_URL}/products/${pair}/ticker`,
      {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      }
    );
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
        `Coinbase returned HTTP ${response.status} for ${pair}.`,
        response.status
      );
    }

    return validateTicker(payload, asset, pair, config, now);
  } catch (error) {
    if (error.statusCode) {
      throw error;
    }

    if (error.name === "AbortError") {
      throw upstreamError(`Coinbase ${pair} request timed out.`);
    }

    throw upstreamError(`Could not reach Coinbase for ${pair}.`);
  } finally {
    clearTimeout(timer);
  }
}

async function getLiveSnapshot(asset, config, now) {
  const { pair } = ASSETS[asset];
  const cached = priceCache.get(pair);
  const cachedAgeMs = cached ? Math.max(0, now - cached.observedMs) : null;

  if (
    cached &&
    now - cached.fetchedAt < config.ttlMs &&
    cachedAgeMs !== null &&
    cachedAgeMs <= config.maxAgeMs
  ) {
    return toSnapshot(cached, now, config);
  }

  if (!inFlight.has(pair)) {
    const request = fetchTicker(asset, config, now)
      .then((record) => {
        priceCache.set(pair, record);
        return record;
      })
      .finally(() => {
        inFlight.delete(pair);
      });

    inFlight.set(pair, request);
  }

  try {
    const record = await inFlight.get(pair);
    return toSnapshot(record, now, config);
  } catch (error) {
    if (cached && cachedAgeMs !== null && cachedAgeMs <= config.maxAgeMs) {
      return {
        ...toSnapshot(cached, now, config),
        fallbackReason: error.message,
      };
    }

    throw error;
  }
}

export async function getMarketPrice(asset, options = {}) {
  const symbol = String(asset || "").trim().toUpperCase();
  const config = getPriceConfig();
  const now = Number.isFinite(options.now) ? options.now : Date.now();

  if (!ASSETS[symbol]) {
    throw marketError(
      `Unsupported market-price asset: ${symbol || "(missing)"}.`,
      400,
      "INVALID_PRICE_ASSET"
    );
  }

  if (config.invalidSource) {
    throw marketError(
      "Invalid PRICE_SOURCE configuration. Use mock (default) or coinbase. No market-data request was made.",
      503,
      "INVALID_PRICE_SOURCE"
    );
  }

  if (config.invalidFallback) {
    throw marketError(
      "Invalid PRICE_FALLBACK configuration. Use labeled-mock (default) or off. No market-data request was made.",
      503,
      "INVALID_PRICE_FALLBACK"
    );
  }

  if (config.source === MOCK_SOURCE) {
    return mockSnapshot(symbol, now);
  }

  try {
    return await getLiveSnapshot(symbol, config, now);
  } catch (error) {
    if (config.fallback === "off") {
      throw marketError(
        `Live market price unavailable for ${symbol}. ${error.message}`,
        503,
        "PRICE_UNAVAILABLE"
      );
    }

    return mockSnapshot(symbol, now, {
      provider: "mock-fallback",
      stale: true,
      ageMs: 0,
      fallbackReason: error.message,
    });
  }
}

export const MARKET_PRICE_SOURCES = Object.freeze({
  mock: MOCK_SOURCE,
  live: LIVE_SOURCE,
  fallback: "mock-fallback",
  invalid: INVALID_SOURCE,
});
