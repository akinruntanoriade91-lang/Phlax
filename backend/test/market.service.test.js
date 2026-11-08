import test from "node:test";
import assert from "node:assert/strict";
import {
  getMarketPrice,
  getPriceConfig,
  getPriceStatus,
  resetMarketCacheForTests,
} from "../src/services/market.service.js";

const ENV_KEYS = [
  "PRICE_SOURCE",
  "PRICE_FALLBACK",
  "PRICE_TTL_MS",
  "PRICE_STALE_MS",
  "PRICE_MAX_AGE_MS",
];

function setEnvironment(values) {
  const previous = new Map();

  for (const key of ENV_KEYS) {
    previous.set(key, process.env[key]);

    if (values[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = values[key];
    }
  }

  resetMarketCacheForTests();

  return () => {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }

    resetMarketCacheForTests();
  };
}

function tickerResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof payload === "string" ? payload : JSON.stringify(payload)),
  };
}

function mockFetch(handler) {
  const original = globalThis.fetch;
  let calls = 0;

  globalThis.fetch = async (url, options) => {
    calls += 1;
    return handler(url, options, calls);
  };

  return {
    calls: () => calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

function validTicker(now, price = "5.250000") {
  return {
    price,
    time: new Date(now - 1_000).toISOString(),
  };
}

test("default mock source makes zero network calls", async () => {
  const restoreEnv = setEnvironment({
    PRICE_SOURCE: undefined,
    PRICE_FALLBACK: undefined,
  });
  const network = mockFetch(() => {
    throw new Error("Network must not be used in mock mode.");
  });

  try {
    const price = await getMarketPrice("NEAR");

    assert.equal(price.provider, "mock");
    assert.equal(price.pair, "NEAR-USD");
    assert.equal(price.stale, false);
    assert.equal(typeof price.priceUsdText, "string");
    assert.match(price.priceUsdText, /^\d+(\.\d{1,6})?$/);
    assert.equal(network.calls(), 0);
  } finally {
    network.restore();
    restoreEnv();
  }
});

test("unsupported assets are rejected without a network call", async () => {
  const restoreEnv = setEnvironment({ PRICE_SOURCE: "coinbase" });
  const network = mockFetch(() => {
    throw new Error("Network must not be used for an unsupported asset.");
  });

  try {
    await assert.rejects(() => getMarketPrice("DOGE"), (error) => {
      assert.equal(error.statusCode, 400);
      assert.equal(error.code, "INVALID_PRICE_ASSET");
      return true;
    });
    assert.equal(network.calls(), 0);
  } finally {
    network.restore();
    restoreEnv();
  }
});

test("invalid PRICE_SOURCE is rejected instead of falling back", async () => {
  const restoreEnv = setEnvironment({ PRICE_SOURCE: "kraken" });
  const network = mockFetch(() => {
    throw new Error("Network must not be used with invalid configuration.");
  });

  try {
    const config = getPriceConfig();

    assert.equal(config.invalidSource, true);

    await assert.rejects(() => getMarketPrice("NEAR"), (error) => {
      assert.equal(error.statusCode, 503);
      assert.equal(error.code, "INVALID_PRICE_SOURCE");
      return true;
    });
    assert.equal(network.calls(), 0);
  } finally {
    network.restore();
    restoreEnv();
  }
});

test("invalid PRICE_FALLBACK is rejected instead of being ignored", async () => {
  const restoreEnv = setEnvironment({
    PRICE_SOURCE: "coinbase",
    PRICE_FALLBACK: "silent-mock",
  });
  const network = mockFetch(() => {
    throw new Error("Network must not be used with invalid configuration.");
  });

  try {
    await assert.rejects(() => getMarketPrice("NEAR"), (error) => {
      assert.equal(error.statusCode, 503);
      assert.equal(error.code, "INVALID_PRICE_FALLBACK");
      return true;
    });
    assert.equal(network.calls(), 0);
  } finally {
    network.restore();
    restoreEnv();
  }
});

test("Coinbase ticker is validated and exposed with provenance", async () => {
  const now = Date.now();
  const restoreEnv = setEnvironment({
    PRICE_SOURCE: "coinbase",
    PRICE_FALLBACK: "off",
  });
  const network = mockFetch((url) => {
    assert.equal(
      url,
      "https://api.exchange.coinbase.com/products/NEAR-USD/ticker"
    );

    return tickerResponse(validTicker(now));
  });

  try {
    const price = await getMarketPrice("NEAR", { now });

    assert.equal(price.provider, "coinbase");
    assert.equal(price.pair, "NEAR-USD");
    assert.equal(price.priceUsdText, "5.25");
    assert.equal(price.priceUsdMicros, "5250000");
    assert.equal(price.stale, false);
    assert.equal(price.ageMs, 1_000);
    assert.equal(network.calls(), 1);

    const status = getPriceStatus();

    assert.equal(status.priceSource, "coinbase");
    assert.equal(status.liveRequestsEnabled, true);
    assert.equal(status.pairs.NEAR.pair, "NEAR-USD");
    assert.equal(status.pairs.NEAR.lastObservedAt, new Date(now - 1_000).toISOString());
  } finally {
    network.restore();
    restoreEnv();
  }
});

test("BTC and ETH use their verified USD pairs", async () => {
  const now = Date.now();
  const restoreEnv = setEnvironment({
    PRICE_SOURCE: "coinbase",
    PRICE_FALLBACK: "off",
  });
  const requested = [];
  const network = mockFetch((url) => {
    requested.push(url);

    return tickerResponse(validTicker(now, url.includes("BTC") ? "68000.00" : "3200.00"));
  });

  try {
    const bitcoin = await getMarketPrice("BTC", { now });
    const ether = await getMarketPrice("ETH", { now });

    assert.equal(bitcoin.pair, "BTC-USD");
    assert.equal(bitcoin.priceUsdText, "68000");
    assert.equal(ether.pair, "ETH-USD");
    assert.equal(ether.priceUsdText, "3200");
    assert.deepEqual(requested, [
      "https://api.exchange.coinbase.com/products/BTC-USD/ticker",
      "https://api.exchange.coinbase.com/products/ETH-USD/ticker",
    ]);
  } finally {
    network.restore();
    restoreEnv();
  }
});

test("cached prices are reused inside the TTL window", async () => {
  const now = Date.now();
  const restoreEnv = setEnvironment({
    PRICE_SOURCE: "coinbase",
    PRICE_FALLBACK: "off",
    PRICE_TTL_MS: "15000",
  });
  const network = mockFetch(() => tickerResponse(validTicker(now)));

  try {
    const first = await getMarketPrice("NEAR", { now });
    const second = await getMarketPrice("NEAR", { now: now + 5_000 });

    assert.equal(network.calls(), 1);
    assert.equal(first.priceUsdText, second.priceUsdText);
    assert.equal(second.ageMs, 6_000);
  } finally {
    network.restore();
    restoreEnv();
  }
});

test("concurrent requests share a single upstream call", async () => {
  const now = Date.now();
  const restoreEnv = setEnvironment({
    PRICE_SOURCE: "coinbase",
    PRICE_FALLBACK: "off",
  });
  const network = mockFetch(async () => {
    await new Promise((resolve) => setImmediate(resolve));
    return tickerResponse(validTicker(now));
  });

  try {
    const [first, second] = await Promise.all([
      getMarketPrice("NEAR", { now }),
      getMarketPrice("NEAR", { now }),
    ]);

    assert.equal(network.calls(), 1);
    assert.equal(first.priceUsdText, second.priceUsdText);
  } finally {
    network.restore();
    restoreEnv();
  }
});

test("prices older than the stale threshold are flagged but still usable", async () => {
  const now = Date.now();
  const restoreEnv = setEnvironment({
    PRICE_SOURCE: "coinbase",
    PRICE_FALLBACK: "off",
    PRICE_STALE_MS: "2000",
    PRICE_MAX_AGE_MS: "60000",
  });
  const network = mockFetch(() =>
    tickerResponse({
      price: "5.250000",
      time: new Date(now - 10_000).toISOString(),
    })
  );

  try {
    const price = await getMarketPrice("NEAR", { now });

    assert.equal(price.provider, "coinbase");
    assert.equal(price.stale, true);
    assert.equal(price.ageMs, 10_000);
  } finally {
    network.restore();
    restoreEnv();
  }
});

test("trades older than the hard maximum are rejected", async () => {
  const now = Date.now();
  const restoreEnv = setEnvironment({
    PRICE_SOURCE: "coinbase",
    PRICE_FALLBACK: "off",
    PRICE_STALE_MS: "2000",
    PRICE_MAX_AGE_MS: "10000",
  });
  const network = mockFetch(() =>
    tickerResponse({
      price: "5.250000",
      time: new Date(now - 60_000).toISOString(),
    })
  );

  try {
    await assert.rejects(() => getMarketPrice("NEAR", { now }), (error) => {
      assert.equal(error.statusCode, 503);
      assert.equal(error.code, "PRICE_UNAVAILABLE");
      return true;
    });
  } finally {
    network.restore();
    restoreEnv();
  }
});

test("malformed tickers fail closed instead of being guessed", async () => {
  const now = Date.now();
  const payloads = [
    null,
    [],
    { time: new Date(now).toISOString() },
    { price: 5.25, time: new Date(now).toISOString() },
    { price: "not-a-number", time: new Date(now).toISOString() },
    { price: "-1", time: new Date(now).toISOString() },
    { price: "0", time: new Date(now).toISOString() },
    { price: "5.25" },
    { price: "5.25", time: "not-a-date" },
    {
      price: "5.25",
      time: new Date(now + 10 * 60_000).toISOString(),
    },
  ];

  for (const payload of payloads) {
    const restoreEnv = setEnvironment({
      PRICE_SOURCE: "coinbase",
      PRICE_FALLBACK: "off",
    });
    const network = mockFetch(() => tickerResponse(payload));

    try {
      await assert.rejects(() => getMarketPrice("NEAR", { now }), (error) => {
        assert.equal(error.statusCode, 503, JSON.stringify(payload));
        assert.equal(error.code, "PRICE_UNAVAILABLE");
        return true;
      });
    } finally {
      network.restore();
      restoreEnv();
    }
  }
});

test("unreadable payloads and HTTP failures are rejected", async () => {
  const now = Date.now();
  const responses = [
    () => tickerResponse("<html>not json</html>"),
    () => tickerResponse({ message: "rate limited" }, 429),
    () => tickerResponse({ message: "unavailable" }, 503),
  ];

  for (const response of responses) {
    const restoreEnv = setEnvironment({
      PRICE_SOURCE: "coinbase",
      PRICE_FALLBACK: "off",
    });
    const network = mockFetch(response);

    try {
      await assert.rejects(() => getMarketPrice("NEAR", { now }), (error) => {
        assert.equal(error.statusCode, 503);
        assert.equal(error.code, "PRICE_UNAVAILABLE");
        return true;
      });
    } finally {
      network.restore();
      restoreEnv();
    }
  }
});

test("failed live prices fall back to a clearly labelled mock", async () => {
  const now = Date.now();
  const restoreEnv = setEnvironment({
    PRICE_SOURCE: "coinbase",
    PRICE_FALLBACK: "labeled-mock",
  });
  const network = mockFetch(() => tickerResponse({ message: "down" }, 503));

  try {
    const price = await getMarketPrice("NEAR", { now });

    assert.equal(price.provider, "mock-fallback");
    assert.equal(price.stale, true);
    assert.match(price.fallbackReason, /HTTP 503/);
    assert.match(price.priceUsdText, /^\d+(\.\d{1,6})?$/);
  } finally {
    network.restore();
    restoreEnv();
  }
});

test("strict fallback turns live failures into PRICE_UNAVAILABLE", async () => {
  const now = Date.now();
  const restoreEnv = setEnvironment({
    PRICE_SOURCE: "coinbase",
    PRICE_FALLBACK: "off",
  });
  const network = mockFetch(() => {
    throw new Error("socket hang up");
  });

  try {
    await assert.rejects(() => getMarketPrice("NEAR", { now }), (error) => {
      assert.equal(error.statusCode, 503);
      assert.equal(error.code, "PRICE_UNAVAILABLE");
      return true;
    });
  } finally {
    network.restore();
    restoreEnv();
  }
});

test("a recently cached price survives a transient later failure", async () => {
  const now = Date.now();
  const restoreEnv = setEnvironment({
    PRICE_SOURCE: "coinbase",
    PRICE_FALLBACK: "off",
    PRICE_TTL_MS: "1",
  });
  let fail = false;
  const network = mockFetch(() => {
    if (fail) {
      throw new Error("socket hang up");
    }

    return tickerResponse(validTicker(now));
  });

  try {
    await getMarketPrice("NEAR", { now });
    fail = true;
    const price = await getMarketPrice("NEAR", { now: now + 5_000 });

    assert.equal(network.calls(), 2);
    assert.equal(price.provider, "coinbase");
    assert.match(price.fallbackReason, /Could not reach Coinbase/);
    assert.equal(price.stale, false);
  } finally {
    network.restore();
    restoreEnv();
  }
});
