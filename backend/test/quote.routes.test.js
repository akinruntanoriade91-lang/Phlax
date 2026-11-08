import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import express from "express";
import quoteRoutes from "../src/routes/quote.routes.js";
import { resetMarketCacheForTests } from "../src/services/market.service.js";

const ENV_KEYS = [
  "QUOTE_SOURCE",
  "ONECLICK_DRY_RECIPIENT",
  "ONECLICK_DRY_REFUND_TO",
  "ONECLICK_API_KEY",
  "ONECLICK_JWT",
  "ONECLICK_DRY",
  "ONECLICK_ALLOW_TRANSACTIONS",
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

async function withServer(callback) {
  const app = express();
  app.use(express.json());
  app.use("/api/quote", quoteRoutes);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();

  try {
    return await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function postQuote(baseUrl, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const request = http.request(
      `${baseUrl}/api/quote`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (response) => {
        let text = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          text += chunk;
        });
        response.on("end", () => {
          resolve({
            status: response.statusCode,
            body: text ? JSON.parse(text) : null,
          });
        });
      }
    );

    request.on("error", reject);
    request.end(payload);
  });
}

function failIfNetworkIsUsed() {
  const original = globalThis.fetch;
  let calls = 0;

  globalThis.fetch = async () => {
    calls += 1;
    throw new Error("Unexpected network request during test.");
  };

  return {
    calls: () => calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

function mockTicker(payloadForUrl) {
  const original = globalThis.fetch;
  let calls = 0;

  globalThis.fetch = async (url) => {
    calls += 1;
    const payload = payloadForUrl(url);

    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(payload),
    };
  };

  return {
    calls: () => calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

const VALID_REQUEST = {
  amountUsd: 14.29,
  asset: "NEAR",
  slippageBps: 50,
};

test("mock mode is used when QUOTE_SOURCE is absent", async () => {
  const restoreEnv = setEnvironment({
    QUOTE_SOURCE: undefined,
    ONECLICK_DRY_RECIPIENT: undefined,
    ONECLICK_DRY_REFUND_TO: undefined,
  });
  const network = failIfNetworkIsUsed();

  try {
    await withServer(async (baseUrl) => {
      const response = await postQuote(baseUrl, VALID_REQUEST);

      assert.equal(response.status, 201);
      assert.equal(response.body.data.source, "mock");
      assert.equal(response.body.data.dryRun, true);
      assert.equal(response.body.data.priceSource, "mock");
      assert.equal(typeof response.body.data.priceObservedAt, "string");
      assert.equal(response.body.data.priceStale, false);
      assert.equal(network.calls(), 0);
    });
  } finally {
    network.restore();
    restoreEnv();
  }
});

test("mock mode is used when QUOTE_SOURCE=mock", async () => {
  const restoreEnv = setEnvironment({ QUOTE_SOURCE: "mock" });
  const network = failIfNetworkIsUsed();

  try {
    await withServer(async (baseUrl) => {
      const response = await postQuote(baseUrl, VALID_REQUEST);

      assert.equal(response.status, 201);
      assert.equal(response.body.data.source, "mock");
      assert.equal(network.calls(), 0);
    });
  } finally {
    network.restore();
    restoreEnv();
  }
});

test("invalid QUOTE_SOURCE configuration is rejected without a network call", async () => {
  const restoreEnv = setEnvironment({ QUOTE_SOURCE: "live" });
  const network = failIfNetworkIsUsed();

  try {
    await withServer(async (baseUrl) => {
      const response = await postQuote(baseUrl, VALID_REQUEST);

      assert.equal(response.status, 503);
      assert.equal(response.body.code, "INVALID_QUOTE_SOURCE");
      assert.equal(network.calls(), 0);
    });
  } finally {
    network.restore();
    restoreEnv();
  }
});

test("client-supplied dry:false is rejected", async () => {
  const restoreEnv = setEnvironment({ QUOTE_SOURCE: "mock" });
  const network = failIfNetworkIsUsed();

  try {
    await withServer(async (baseUrl) => {
      const response = await postQuote(baseUrl, {
        ...VALID_REQUEST,
        dry: false,
      });

      assert.equal(response.status, 400);
      assert.match(response.body.message, /dry/i);
      assert.equal(network.calls(), 0);
    });
  } finally {
    network.restore();
    restoreEnv();
  }
});

test("missing recipient or refund configuration fails without a network call", async () => {
  const restoreEnv = setEnvironment({
    QUOTE_SOURCE: "1click-dry",
    ONECLICK_DRY_RECIPIENT: undefined,
    ONECLICK_DRY_REFUND_TO: undefined,
  });
  const network = failIfNetworkIsUsed();

  try {
    await withServer(async (baseUrl) => {
      const response = await postQuote(baseUrl, VALID_REQUEST);

      assert.equal(response.status, 503);
      assert.equal(response.body.code, "QUOTE_SOURCE_NOT_CONFIGURED");
      assert.equal(network.calls(), 0);
    });
  } finally {
    network.restore();
    restoreEnv();
  }
});

test("live market prices are labelled while the quote stays simulated", async () => {
  const restoreEnv = setEnvironment({
    QUOTE_SOURCE: "mock",
    PRICE_SOURCE: "coinbase",
    PRICE_FALLBACK: "off",
  });
  const observedAt = new Date(Date.now() - 1_000).toISOString();
  const network = mockTicker(() => ({ price: "5.250000", time: observedAt }));

  try {
    await withServer(async (baseUrl) => {
      const response = await postQuote(baseUrl, VALID_REQUEST);
      const quote = response.body.data;

      assert.equal(response.status, 201);
      assert.equal(quote.source, "mock");
      assert.equal(quote.dryRun, true);
      assert.equal(quote.priceSource, "coinbase");
      assert.equal(quote.priceObservedAt, observedAt);
      assert.equal(quote.priceStale, false);
      assert.equal(quote.priceUsd, "5.25");
      assert.ok(
        quote.warnings.some((warning) =>
          warning.includes("not an executable NEAR Intents quote")
        )
      );
      assert.equal(network.calls(), 1);
    });
  } finally {
    network.restore();
    restoreEnv();
  }
});

test("a failed live price is labelled as mock fallback", async () => {
  const restoreEnv = setEnvironment({
    QUOTE_SOURCE: "mock",
    PRICE_SOURCE: "coinbase",
    PRICE_FALLBACK: "labeled-mock",
  });
  const network = failIfNetworkIsUsed();

  try {
    await withServer(async (baseUrl) => {
      const response = await postQuote(baseUrl, VALID_REQUEST);
      const quote = response.body.data;

      assert.equal(response.status, 201);
      assert.equal(quote.source, "mock");
      assert.equal(quote.priceSource, "mock-fallback");
      assert.equal(quote.priceStale, true);
      assert.ok(
        quote.warnings.some((warning) =>
          warning.includes("not market data")
        )
      );
      assert.equal(network.calls(), 1);
    });
  } finally {
    network.restore();
    restoreEnv();
  }
});

test("strict fallback returns 503 instead of mock prices", async () => {
  const restoreEnv = setEnvironment({
    QUOTE_SOURCE: "mock",
    PRICE_SOURCE: "coinbase",
    PRICE_FALLBACK: "off",
  });
  const network = failIfNetworkIsUsed();

  try {
    await withServer(async (baseUrl) => {
      const response = await postQuote(baseUrl, VALID_REQUEST);

      assert.equal(response.status, 503);
      assert.equal(response.body.code, "PRICE_UNAVAILABLE");
      assert.equal(network.calls(), 1);
    });
  } finally {
    network.restore();
    restoreEnv();
  }
});

test("invalid PRICE_SOURCE is rejected without a network call", async () => {
  const restoreEnv = setEnvironment({
    QUOTE_SOURCE: "mock",
    PRICE_SOURCE: "coingecko",
  });
  const network = failIfNetworkIsUsed();

  try {
    await withServer(async (baseUrl) => {
      const response = await postQuote(baseUrl, VALID_REQUEST);

      assert.equal(response.status, 503);
      assert.equal(response.body.code, "INVALID_PRICE_SOURCE");
      assert.equal(network.calls(), 0);
    });
  } finally {
    network.restore();
    restoreEnv();
  }
});

test("invalid PRICE_FALLBACK is rejected without a network call", async () => {
  const restoreEnv = setEnvironment({
    QUOTE_SOURCE: "mock",
    PRICE_SOURCE: "coinbase",
    PRICE_FALLBACK: "always",
  });
  const network = failIfNetworkIsUsed();

  try {
    await withServer(async (baseUrl) => {
      const response = await postQuote(baseUrl, VALID_REQUEST);

      assert.equal(response.status, 503);
      assert.equal(response.body.code, "INVALID_PRICE_FALLBACK");
      assert.equal(network.calls(), 0);
    });
  } finally {
    network.restore();
    restoreEnv();
  }
});

test("client-supplied price values are rejected", async () => {
  const restoreEnv = setEnvironment({ QUOTE_SOURCE: "mock" });
  const network = failIfNetworkIsUsed();

  try {
    await withServer(async (baseUrl) => {
      const cases = [
        { priceUsd: 1 },
        { priceSource: "coinbase" },
        { marketPrice: "1" },
        { nested: { fallback: "off" } },
      ];

      for (const extra of cases) {
        const response = await postQuote(baseUrl, {
          ...VALID_REQUEST,
          ...extra,
        });

        assert.equal(response.status, 400);
        assert.match(response.body.message, /not accepted from the client/);
      }

      assert.equal(network.calls(), 0);
    });
  } finally {
    network.restore();
    restoreEnv();
  }
});
