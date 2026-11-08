import test from "node:test";
import assert from "node:assert/strict";
import {
  createOneClickDryQuote,
  resetOneClickTokenCacheForTests,
} from "../src/services/oneclick.service.js";

const USDC = {
  assetId: "nep141:usdc.near",
  decimals: 6,
  blockchain: "near",
  symbol: "USDC",
  name: "USD Coin",
};

const WNEAR = {
  assetId: "nep141:wrap.near",
  decimals: 24,
  blockchain: "near",
  symbol: "wNEAR",
  name: "Wrapped NEAR",
};

const REQUEST = {
  amountUsd: 14.29,
  asset: "NEAR",
  slippageBps: 50,
};

const ENV_KEYS = [
  "QUOTE_SOURCE",
  "ONECLICK_DRY_RECIPIENT",
  "ONECLICK_DRY_REFUND_TO",
  "ONECLICK_API_KEY",
  "ONECLICK_JWT",
  "ONECLICK_DRY",
  "ONECLICK_ALLOW_TRANSACTIONS",
];

const LIVE_ENV = {
  QUOTE_SOURCE: "1click-dry",
  ONECLICK_DRY_RECIPIENT: "recipient.near",
  ONECLICK_DRY_REFUND_TO: "refund.near",
  ONECLICK_API_KEY: undefined,
  ONECLICK_JWT: undefined,
  ONECLICK_DRY: undefined,
  ONECLICK_ALLOW_TRANSACTIONS: undefined,
};

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

  return () => {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
}

function makeQuoteRequest(overrides = {}) {
  return {
    dry: true,
    swapType: "EXACT_INPUT",
    slippageTolerance: 50,
    originAsset: USDC.assetId,
    depositType: "ORIGIN_CHAIN",
    destinationAsset: WNEAR.assetId,
    amount: "14290000",
    refundTo: "refund.near",
    refundType: "ORIGIN_CHAIN",
    recipient: "recipient.near",
    recipientType: "DESTINATION_CHAIN",
    deadline: "2026-11-07T00:05:00.000Z",
    ...overrides,
  };
}

function makeQuote(overrides = {}) {
  return {
    amountIn: "14290000",
    amountInFormatted: "14.29",
    amountInUsd: "14.29",
    minAmountIn: "14218550",
    amountOut: "2740384615384615384615384",
    amountOutFormatted: "2.740384615384615384615384",
    amountOutUsd: "14.25",
    minAmountOut: "2726682692307692307692308",
    timeEstimate: 120,
    ...overrides,
  };
}

function makeResponse({ quoteRequest = {}, quote = {}, topLevel = {} } = {}) {
  return {
    correlationId: "corr-123",
    timestamp: "2026-11-07T00:00:00.000Z",
    signature: "signed-quote",
    quoteRequest: makeQuoteRequest(quoteRequest),
    quote: makeQuote(quote),
    ...topLevel,
  };
}

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(payload);
    },
  };
}

function stubOneClickFetch({
  quotePayload = makeResponse(),
  quoteStatus = 200,
  tokens = [USDC, WNEAR],
} = {}) {
  const original = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    calls.push({ href, options });

    if (href.endsWith("/v0/tokens")) {
      return jsonResponse(tokens);
    }

    if (href.endsWith("/v0/quote")) {
      if (quoteStatus >= 400) {
        return jsonResponse({ message: "upstream failure" }, quoteStatus);
      }

      return jsonResponse(quotePayload);
    }

    throw new Error(`Unexpected test URL: ${href}`);
  };

  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

async function withLiveQuote(options, run) {
  const restoreEnv = setEnvironment(LIVE_ENV);
  resetOneClickTokenCacheForTests();
  const network = stubOneClickFetch(options);

  try {
    return await run(network);
  } finally {
    network.restore();
    restoreEnv();
  }
}

test("valid dry quote is normalized from raw base units", async () => {
  await withLiveQuote({}, async (network) => {
    const quote = await createOneClickDryQuote(REQUEST);

    assert.equal(quote.source, "1click-dry");
    assert.equal(quote.dryRun, true);
    assert.equal(quote.network, "mainnet");
    assert.equal(quote.amountUsd, "14.29");
    assert.equal(quote.amountIn, "14290000");
    assert.equal(quote.amountInFormatted, "14.29");
    assert.equal(quote.amountOut, "2740384615384615384615384");
    assert.equal(quote.amountOutFormatted, "2.740384615384615384615384");
    assert.equal(quote.minAmountOut, "2726682692307692307692308");
    assert.equal(quote.minAmountOutFormatted, "2.726682692307692307692308");
    assert.equal(quote.slippageBps, 50);
    assert.equal(quote.timeEstimate, 120);
    assert.ok(quote.fetchedAt);
    assert.equal(JSON.stringify(quote).includes("depositAddress"), false);

    const quoteCall = network.calls.find((call) =>
      call.href.endsWith("/v0/quote")
    );
    const body = JSON.parse(quoteCall.options.body);

    assert.equal(body.dry, true);
    assert.equal(body.recipient, "recipient.near");
    assert.equal(body.refundTo, "refund.near");
    assert.equal(body.originAsset, USDC.assetId);
    assert.equal(body.destinationAsset, WNEAR.assetId);
    assert.equal("depositAddress" in body, false);
  });
});

test("NEAR lookup accepts the documented wNEAR token representation", async () => {
  await withLiveQuote({ tokens: [USDC, WNEAR] }, async () => {
    const quote = await createOneClickDryQuote(REQUEST);

    assert.equal(quote.destinationAsset.symbol, "NEAR");
    assert.equal(quote.destinationAsset.tokenSymbol, "WNEAR");
    assert.equal(quote.destinationAsset.assetId, "nep141:wrap.near");
  });
});

test("ONECLICK_API_KEY is sent as X-API-Key, never as a response field", async () => {
  const restoreEnv = setEnvironment({
    ...LIVE_ENV,
    ONECLICK_API_KEY: "test-api-key",
  });
  resetOneClickTokenCacheForTests();
  const network = stubOneClickFetch();

  try {
    const quote = await createOneClickDryQuote(REQUEST);
    const quoteCall = network.calls.find((call) =>
      call.href.endsWith("/v0/quote")
    );

    assert.equal(quoteCall.options.headers["X-API-Key"], "test-api-key");
    assert.equal("Authorization" in quoteCall.options.headers, false);
    assert.equal(JSON.stringify(quote).includes("test-api-key"), false);
  } finally {
    network.restore();
    restoreEnv();
  }
});

test("live API failures are surfaced without mock fallback", async () => {
  await withLiveQuote({ quoteStatus: 500 }, async () => {
    await assert.rejects(
      () => createOneClickDryQuote(REQUEST),
      (error) =>
        error.statusCode === 502 &&
        error.code === "ONECLICK_UPSTREAM_ERROR"
    );
  });
});

test("a flat or unvalidated upstream response is rejected", async () => {
  await withLiveQuote({ quotePayload: makeQuote() }, async () => {
    await assert.rejects(
      () => createOneClickDryQuote(REQUEST),
      (error) =>
        error.statusCode === 502 &&
        error.code === "ONECLICK_UPSTREAM_ERROR"
    );
  });
});

test("a response missing a contract-required quote field is rejected", async () => {
  const payload = makeResponse();

  delete payload.quote.amountOutUsd;

  await withLiveQuote({ quotePayload: payload }, async () => {
    await assert.rejects(
      () => createOneClickDryQuote(REQUEST),
      (error) =>
        error.statusCode === 502 &&
        error.code === "ONECLICK_UPSTREAM_ERROR"
    );
  });
});

test("deposit and expiry fields are rejected in a dry quote", async () => {
  const forbiddenFields = [
    ["depositAddress", "0xnot-allowed"],
    ["depositMemo", "12345"],
    ["chainDepositAddresses", []],
    ["deadline", "2026-11-07T00:05:00.000Z"],
    ["timeWhenInactive", "2026-11-07T00:04:00.000Z"],
  ];

  for (const [field, value] of forbiddenFields) {
    resetOneClickTokenCacheForTests();
    const network = stubOneClickFetch({
      quotePayload: makeResponse({ quote: { [field]: value } }),
    });
    const restoreEnv = setEnvironment(LIVE_ENV);

    try {
      await assert.rejects(
        () => createOneClickDryQuote(REQUEST),
        (error) =>
          error.statusCode === 502 &&
          error.code === "ONECLICK_UPSTREAM_ERROR",
        `Expected ${field} to be rejected`
      );
    } finally {
      network.restore();
      restoreEnv();
    }
  }
});

test("transaction data and unknown fields are rejected", async () => {
  await withLiveQuote(
    {
      quotePayload: makeResponse({
        topLevel: { transactionHash: "0xnot-allowed" },
      }),
    },
    async () => {
      await assert.rejects(
        () => createOneClickDryQuote(REQUEST),
        (error) =>
          error.statusCode === 502 &&
          error.code === "ONECLICK_UPSTREAM_ERROR"
      );
    }
  );
});

test("a response that does not echo dry:true is rejected", async () => {
  await withLiveQuote(
    { quotePayload: makeResponse({ quoteRequest: { dry: false } }) },
    async () => {
      await assert.rejects(
        () => createOneClickDryQuote(REQUEST),
        (error) =>
          error.statusCode === 502 &&
          error.code === "ONECLICK_UPSTREAM_ERROR"
      );
    }
  );
});

test("a response whose input amount differs from the request is rejected", async () => {
  await withLiveQuote(
    { quotePayload: makeResponse({ quote: { amountIn: "14290001" } }) },
    async () => {
      await assert.rejects(
        () => createOneClickDryQuote(REQUEST),
        (error) =>
          error.statusCode === 502 &&
          error.code === "ONECLICK_UPSTREAM_ERROR"
      );
    }
  );
});
