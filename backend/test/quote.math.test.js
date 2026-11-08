import test from "node:test";
import assert from "node:assert/strict";
import {
  applySlippage,
  baseUnitsToDecimal,
  centsToUsdText,
  decimalToBaseUnits,
  decimalToCents,
} from "../src/services/quote.math.js";
import { createMockQuote } from "../src/services/quote.service.js";

test("converts decimal token amounts to exact base units", () => {
  assert.equal(decimalToBaseUnits("14.29", 6), "14290000");
  assert.equal(decimalToBaseUnits("0.000001", 6), "1");
  assert.equal(decimalToBaseUnits("1", 24), "1000000000000000000000000");
  assert.equal(
    decimalToBaseUnits("123456789012.34567890123456789", 18),
    "123456789012345678901234567890"
  );
});

test("rejects token precision that cannot be represented exactly", () => {
  assert.throws(
    () => decimalToBaseUnits("0.0000001", 6),
    /more than 6 decimal places/
  );
});

test("converts large base-unit amounts back to exact decimal strings", () => {
  assert.equal(baseUnitsToDecimal("1000000000000000000000000", 24), "1");
  assert.equal(
    baseUnitsToDecimal("123456789012345678901234567890", 18),
    "123456789012.34567890123456789"
  );
  assert.equal(
    baseUnitsToDecimal("2740384615384615384615384", 24),
    "2.740384615384615384615384"
  );
});

test("normalizes USD input to exact cents without floating point", () => {
  assert.equal(decimalToCents("14.29"), 1429n);
  assert.equal(decimalToCents("14.285"), 1429n);
  assert.equal(decimalToCents("0.004"), 0n);
  assert.equal(decimalToCents("0.005"), 1n);
  assert.equal(centsToUsdText(1429n), "14.29");
  assert.equal(centsToUsdText(1420n), "14.20");
});

test("applies slippage with floor rounding to protect the minimum output", () => {
  assert.equal(applySlippage("1000000", 50), "995000");
  assert.equal(applySlippage("1000000", 10), "999000");
  assert.equal(
    applySlippage("123456789012345678901234567890", 125),
    (
      (123456789012345678901234567890n * (10_000n - 125n)) /
      10_000n
    ).toString()
  );
  assert.throws(() => applySlippage("1000000", 10_001), /between 0 and 10000/);
});

test("mock quote derives minimum output from precise raw output", async () => {
  const quote = await createMockQuote({
    amountUsd: "14.29",
    asset: "NEAR",
    slippageBps: 50,
  });

  assert.equal(typeof quote.amountOut, "string");
  assert.equal(typeof quote.minAmountOut, "string");
  assert.equal(quote.amountOutFormatted, baseUnitsToDecimal(quote.amountOut, 24));
  assert.equal(
    quote.minAmountOutFormatted,
    baseUnitsToDecimal(quote.minAmountOut, 24)
  );
  assert.equal(quote.minAmountOut, applySlippage(quote.amountOut, 50));
  assert.equal(quote.amountUsd, "14.29");
  assert.equal(quote.feeUsd, "0.04");
  assert.equal(quote.netUsd, "14.25");
});
