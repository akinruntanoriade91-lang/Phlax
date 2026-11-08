import { centsToUsdText, decimalToCents } from "./quote.math.js";

export const MIN_AMOUNT_USD = 5;
export const MAX_AMOUNT_USD = 25000;
export const MIN_SLIPPAGE_BPS = 10;
export const MAX_SLIPPAGE_BPS = 500;
export const SUPPORTED_ASSET = "NEAR";

const MIN_AMOUNT_CENTS = BigInt(MIN_AMOUNT_USD) * 100n;
const MAX_AMOUNT_CENTS = BigInt(MAX_AMOUNT_USD) * 100n;

export function validateQuoteInput(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const errors = [];
  let amountCents = null;

  try {
    amountCents = decimalToCents(source.amountUsd);
  } catch {
    amountCents = null;
  }

  const asset = String(source.asset || "").trim().toUpperCase();
  const slippageBps = Number(source.slippageBps);

  if (
    amountCents === null ||
    amountCents < MIN_AMOUNT_CENTS ||
    amountCents > MAX_AMOUNT_CENTS
  ) {
    errors.push(
      `amountUsd must be between ${MIN_AMOUNT_USD} and ${MAX_AMOUNT_USD}.`
    );
  }

  if (asset !== SUPPORTED_ASSET) {
    errors.push("asset must be NEAR in this prototype.");
  }

  if (
    !Number.isInteger(slippageBps) ||
    slippageBps < MIN_SLIPPAGE_BPS ||
    slippageBps > MAX_SLIPPAGE_BPS
  ) {
    errors.push(
      `slippageBps must be an integer between ${MIN_SLIPPAGE_BPS} and ${MAX_SLIPPAGE_BPS}.`
    );
  }

  if (errors.length > 0) {
    const error = new Error("Invalid quote request");
    error.statusCode = 400;
    error.errors = errors;
    throw error;
  }

  return {
    amountUsd: centsToUsdText(amountCents),
    amountUsdCents: Number(amountCents),
    asset,
    slippageBps,
  };
}
