// Exact fixed-point helpers for quote calculations.
// Financial values stay as decimal strings or BigInt base units. No floating
// point is used to derive amounts, minimum output, slippage, or token decimals.

const DECIMAL_PATTERN = /^\d+(?:\.\d+)?$/;
const INTEGER_PATTERN = /^\d+$/;

function assertDecimals(decimals) {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
    throw new RangeError("Token decimals must be an integer between 0 and 255.");
  }
}

function asIntegerString(value, label) {
  const text = typeof value === "bigint" ? value.toString() : String(value ?? "").trim();

  if (!INTEGER_PATTERN.test(text)) {
    throw new RangeError(`${label} must be a non-negative integer string.`);
  }

  return text;
}

function powerOfTen(exponent) {
  assertDecimals(exponent);
  return 10n ** BigInt(exponent);
}

export function parseDecimal(value) {
  const text =
    typeof value === "string"
      ? value.trim()
      : typeof value === "number" && Number.isFinite(value)
        ? String(value)
        : "";

  if (!DECIMAL_PATTERN.test(text)) {
    return null;
  }

  const [wholePart, fractionPart = ""] = text.split(".");
  const whole = wholePart.replace(/^0+(?=\d)/, "") || "0";

  return {
    whole,
    fraction: fractionPart,
    scale: fractionPart.length,
  };
}

export function decimalToCents(value) {
  const parsed = parseDecimal(value);

  if (!parsed) {
    throw new RangeError("Value must be a non-negative decimal number.");
  }

  const centsWhole = BigInt(parsed.whole) * 100n;
  const fraction = parsed.fraction;

  if (fraction.length <= 2) {
    return centsWhole + BigInt(fraction.padEnd(2, "0") || "0");
  }

  let cents = centsWhole + BigInt(fraction.slice(0, 2) || "0");

  // Round half up using the first discarded digit, without converting to a
  // JavaScript number.
  if (fraction[2] >= "5") {
    cents += 1n;
  }

  return cents;
}

export function centsToUsdText(cents) {
  const raw = asIntegerString(cents, "USD cents");
  const amount = BigInt(raw);
  const whole = amount / 100n;
  const fraction = (amount % 100n).toString().padStart(2, "0");

  return `${whole}.${fraction}`;
}

export function decimalToBaseUnits(value, decimals) {
  assertDecimals(decimals);

  const parsed = parseDecimal(value);

  if (!parsed) {
    throw new RangeError("Amount must be a non-negative decimal number.");
  }

  if (parsed.fraction.length > decimals) {
    throw new RangeError(
      `Amount has more than ${decimals} decimal places for this token.`
    );
  }

  const digits = `${parsed.whole}${parsed.fraction.padEnd(decimals, "0")}`;

  return digits.replace(/^0+(?=\d)/, "") || "0";
}

export function baseUnitsToDecimal(value, decimals) {
  assertDecimals(decimals);

  const raw = asIntegerString(value, "Base units");

  if (decimals === 0) {
    return raw.replace(/^0+(?=\d)/, "") || "0";
  }

  const base = powerOfTen(decimals);
  const amount = BigInt(raw);
  const whole = amount / base;
  const fraction = (amount % base)
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "");

  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function mulDivFloor(value, numerator, denominator) {
  const raw = BigInt(asIntegerString(value, "Value"));
  const num = BigInt(asIntegerString(numerator, "Numerator"));
  const den = BigInt(asIntegerString(denominator, "Denominator"));

  if (den === 0n) {
    throw new RangeError("Denominator cannot be zero.");
  }

  return (raw * num) / den;
}

export function mulDivRoundHalfUp(value, numerator, denominator) {
  const raw = BigInt(asIntegerString(value, "Value"));
  const num = BigInt(asIntegerString(numerator, "Numerator"));
  const den = BigInt(asIntegerString(denominator, "Denominator"));

  if (den === 0n) {
    throw new RangeError("Denominator cannot be zero.");
  }

  const product = raw * num;

  return (product + den / 2n) / den;
}

export function applySlippage(baseUnits, slippageBps) {
  if (
    !Number.isInteger(slippageBps) ||
    slippageBps < 0 ||
    slippageBps > 10_000
  ) {
    throw new RangeError("Slippage must be an integer between 0 and 10000 bps.");
  }

  const raw = BigInt(asIntegerString(baseUnits, "Base units"));
  const remaining = 10_000n - BigInt(slippageBps);

  return ((raw * remaining) / 10_000n).toString();
}

// Display-only effective price. It is never used to derive token amounts.
export function effectivePriceUsd(
  amountUsdCents,
  outputBaseUnits,
  outputDecimals,
  displayDecimals = 6
) {
  assertDecimals(outputDecimals);
  assertDecimals(displayDecimals);

  const cents = BigInt(asIntegerString(amountUsdCents, "USD cents"));
  const output = BigInt(asIntegerString(outputBaseUnits, "Output base units"));

  if (output === 0n) {
    return null;
  }

  const numerator = cents * powerOfTen(outputDecimals) * powerOfTen(displayDecimals);
  const denominator = 100n * output;
  const scaled = (numerator + denominator / 2n) / denominator;

  return baseUnitsToDecimal(scaled, displayDecimals);
}
