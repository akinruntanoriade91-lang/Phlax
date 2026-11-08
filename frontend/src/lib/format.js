function numericText(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }

  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  return "";
}

function roundToDigits(value, digits) {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(numericText(value));

  if (!match) return "0";

  const negative = match[1] === "-";
  const whole = match[2] || "0";
  const fraction = match[3] || "";
  const places = Math.max(0, Math.trunc(digits));

  if (places === 0) {
    let rounded = BigInt(whole);

    if ((fraction[0] || "0") >= "5") rounded += 1n;

    return `${negative && rounded !== 0n ? "-" : ""}${rounded.toString()}`;
  }

  const kept = fraction.slice(0, places).padEnd(places, "0");
  let scaled = BigInt(`${whole}${kept}`);

  if ((fraction[places] || "0") >= "5") scaled += 1n;

  const base = 10n ** BigInt(places);
  const roundedWhole = scaled / base;
  const roundedFraction = (scaled % base).toString().padStart(places, "0");

  return `${negative && scaled !== 0n ? "-" : ""}${roundedWhole}.${roundedFraction}`;
}

export function formatDecimal(value, maxFractionDigits = 6, minFractionDigits = 0) {
  const max = Math.max(0, Math.trunc(maxFractionDigits));
  const min = Math.min(max, Math.max(0, Math.trunc(minFractionDigits)));
  const rounded = roundToDigits(value, max);
  const negative = rounded.startsWith("-");
  const unsigned = negative ? rounded.slice(1) : rounded;
  const [whole, fraction = ""] = unsigned.split(".");
  const trimmed = fraction.replace(/0+$/, "").padEnd(min, "0");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  return `${negative ? "-" : ""}${grouped}${trimmed ? `.${trimmed}` : ""}`;
}

export function formatUsd(value, digits = 2) {
  const text = formatDecimal(value, digits, digits);
  return text.startsWith("-") ? `-$${text.slice(1)}` : `$${text}`;
}

export function formatAsset(value, digits = 4) {
  return formatDecimal(value, digits, 0);
}

export function formatDate(value) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatShortDate(value) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

export function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}
