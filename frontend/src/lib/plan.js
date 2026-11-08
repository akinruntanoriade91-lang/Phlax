import {
  SIMULATION_CYCLE_COUNT,
  SIMULATION_OUTCOMES,
  assetBySymbol,
  cadenceById,
} from "../data/mock";
import { formatUsd } from "./format";

export const MIN_WEEKLY_BUDGET_USD = 10;
export const MAX_WEEKLY_BUDGET_USD = 25000;
export const MIN_TRADE_USD = 5;
export const MAX_TRADE_USD = 25000;
export const MIN_SLIPPAGE_PCT = 0.1;
export const MAX_SLIPPAGE_PCT = 5;
export const SUPPORTED_ASSET = "NEAR";

export function getPlanMath(plan) {
  const cadence = cadenceById(plan.cadence);
  const budgetUsd = Number(plan.budgetUsd) || 0;
  const runsPerWeek = cadence.runsPerWeek;
  const perTradeExact = runsPerWeek > 0 ? budgetUsd / runsPerWeek : 0;

  return {
    cadence,
    budgetUsd,
    runsPerWeek,
    perTradeExact,
    perTradeUsd: Math.round((perTradeExact + Number.EPSILON) * 100) / 100,
    plannedWeeklyUsd:
      Math.round((perTradeExact * runsPerWeek + Number.EPSILON) * 100) / 100,
  };
}

export function validatePlan(plan, math = getPlanMath(plan)) {
  const budget = Number(plan.budgetUsd);
  const slippage = Number(plan.slippagePct);
  const asset = assetBySymbol(plan.asset);

  if (!Number.isFinite(budget) || budget < MIN_WEEKLY_BUDGET_USD) {
    return `Weekly budget must be at least $${MIN_WEEKLY_BUDGET_USD}.`;
  }

  if (budget > MAX_WEEKLY_BUDGET_USD) {
    return `Weekly budget must be $${MAX_WEEKLY_BUDGET_USD} or less in this simulation.`;
  }

  if (
    !Number.isFinite(slippage) ||
    slippage < MIN_SLIPPAGE_PCT ||
    slippage > MAX_SLIPPAGE_PCT
  ) {
    return `Slippage limit must be between ${MIN_SLIPPAGE_PCT}% and ${MAX_SLIPPAGE_PCT}%.`;
  }

  if (asset.symbol !== SUPPORTED_ASSET) {
    return "This demo only supports NEAR. BTC and ETH are roadmap items.";
  }

  if (math.perTradeUsd < MIN_TRADE_USD) {
    return `The calculated per-trade amount is ${formatUsd(
      math.perTradeUsd
    )}, below the $${MIN_TRADE_USD} simulation minimum. Use a less frequent cadence or raise the weekly budget.`;
  }

  if (math.perTradeUsd > MAX_TRADE_USD) {
    return `The calculated per-trade amount is ${formatUsd(
      math.perTradeUsd
    )}, above the $${MAX_TRADE_USD} simulation maximum. Use a more frequent cadence or lower the weekly budget.`;
  }

  return "";
}

export function suggestCadence(budgetUsd) {
  const budget = Number(budgetUsd) || 0;

  if (budget / 7 >= MIN_TRADE_USD) return "daily";
  if (budget / 1 >= MIN_TRADE_USD) return "weekly";
  return "biweekly";
}

export function buildPlanSuggestion(plan, math = getPlanMath(plan)) {
  const suggestedCadenceId = suggestCadence(plan.budgetUsd);
  const suggestedCadence = cadenceById(suggestedCadenceId);
  const suggestedMath = getPlanMath({
    ...plan,
    cadence: suggestedCadenceId,
  });
  const asset = assetBySymbol(plan.asset);
  const suggestedSlippagePct = asset.slippagePct;
  const cadenceChanges = suggestedCadenceId !== plan.cadence;

  return {
    cadenceId: suggestedCadenceId,
    cadence: suggestedCadence,
    perTradeUsd: math.perTradeUsd,
    suggestedPerTradeUsd: suggestedMath.perTradeUsd,
    slippagePct: suggestedSlippagePct,
    cadenceChanges,
    headline: cadenceChanges
      ? `Move to ${suggestedCadence.label.toLowerCase()} runs at this budget.`
      : `Keep ${math.cadence.label.toLowerCase()} runs at this budget.`,
    detail: `With a $${Number(plan.budgetUsd).toFixed(2)} weekly budget and ${
      math.runsPerWeek
    } run(s) per week, each preview uses about ${formatUsd(
      math.perTradeUsd
    )}.`,
    suggestedDetail: cadenceChanges
      ? `A ${suggestedCadence.label.toLowerCase()} cadence would make each run about ${formatUsd(
          suggestedMath.perTradeUsd
        )} and keep the weekly plan at ${formatUsd(
          suggestedMath.plannedWeeklyUsd
        )}.`
      : `The current cadence already keeps each run above the $${MIN_TRADE_USD} simulation minimum.`,
    inputs:
      "Inputs: weekly budget, cadence, target asset, and slippage cap.",
    output: `Output: ${formatUsd(
      math.perTradeUsd
    )} per run and a risk reminder.`,
    risk:
      "Risk reminder: this is simulated. A real plan should cap weekly spend, review slippage, and never approve a trade you do not understand.",
    rationale: `Rule-based buffer: ${suggestedSlippagePct}% slippage for ${
      asset.symbol
    } (${asset.volatility.toLowerCase()} volatility). Not financial advice.`,
  };
}

const CYCLE_HOUR_UTC = 9;
const SECOND_CYCLE_PRICE_OFFSET_BPS = 45;
const FAILURE_SLIPPAGE_MARGIN_BPS = 30;
const DECIMAL_SCALE = 12n;
const DECIMAL_BASE = 10n ** DECIMAL_SCALE;

let strategySequence = 0;

function decimalToScaled(value) {
  const text =
    typeof value === "number" ? String(value) : String(value ?? "").trim();
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text);

  if (!match) return null;

  const negative = match[1] === "-";
  const fraction = (match[3] || "")
    .padEnd(Number(DECIMAL_SCALE), "0")
    .slice(0, Number(DECIMAL_SCALE));
  const scaled = BigInt(match[2] + fraction);

  return negative ? -scaled : scaled;
}

function scaledToDecimal(scaled) {
  const negative = scaled < 0n;
  const absolute = negative ? -scaled : scaled;
  const whole = absolute / DECIMAL_BASE;
  const fraction = (absolute % DECIMAL_BASE)
    .toString()
    .padStart(Number(DECIMAL_SCALE), "0")
    .replace(/0+$/, "");

  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

// Display-only simulation pricing, scaled with BigInt to avoid float drift.
function applyBps(value, bps) {
  const scaled = decimalToScaled(value);

  if (scaled === null) return "0";

  return scaledToDecimal((scaled * BigInt(10_000 + Math.trunc(bps))) / 10_000n);
}

function divideByBps(value, bps) {
  const scaled = decimalToScaled(value);

  if (scaled === null) return "0";

  return scaledToDecimal((scaled * 10_000n) / BigInt(10_000 + Math.trunc(bps)));
}

function parseStartDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) {
    return new Date();
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return Number.isNaN(date.getTime()) ? new Date() : date;
}

export function getNextCycleDates(
  startDate,
  cadenceId,
  count = SIMULATION_CYCLE_COUNT
) {
  const cadence = cadenceById(cadenceId);
  const intervalDays =
    cadence.runsPerWeek > 0 ? Math.round(7 / cadence.runsPerWeek) : 7;
  const start = parseStartDate(startDate);

  return Array.from({ length: count }, (_, index) => {
    const cycle = new Date(
      Date.UTC(
        start.getUTCFullYear(),
        start.getUTCMonth(),
        start.getUTCDate() + index * intervalDays,
        CYCLE_HOUR_UTC
      )
    );

    return cycle.toISOString();
  });
}

export function createStrategy(plan, math = getPlanMath(plan), now = new Date()) {
  const cadence = cadenceById(plan.cadence);
  const budgetUsd = Number(plan.budgetUsd) || 0;

  strategySequence += 1;

  return {
    id: `plan-${now.getTime().toString(36)}-${strategySequence}`,
    name: `${plan.asset} DCA · ${cadence.label} · ${formatUsd(budgetUsd)}/wk`,
    createdAt: now.toISOString(),
    status: "active",
    plan: {
      budgetUsd,
      asset: plan.asset,
      cadence: cadence.id,
      slippagePct: Number(plan.slippagePct),
      startDate: plan.startDate,
    },
    math: {
      budgetUsd,
      perTradeUsd: math.perTradeUsd,
      runsPerWeek: math.runsPerWeek,
      plannedWeeklyUsd: math.plannedWeeklyUsd,
      cadenceLabel: cadence.label,
    },
  };
}

export function buildSimulatedCycles({ strategy, quote, now = new Date() }) {
  const count = SIMULATION_CYCLE_COUNT;
  const dates = getNextCycleDates(
    strategy.plan.startDate,
    strategy.plan.cadence,
    count
  );
  const basePrice = quote?.priceUsd ?? "0";
  const baseAmount = quote?.assetAmount ?? "0";
  const secondPrice = applyBps(basePrice, SECOND_CYCLE_PRICE_OFFSET_BPS);
  const secondAmount = divideByBps(baseAmount, SECOND_CYCLE_PRICE_OFFSET_BPS);
  const failurePrice = applyBps(
    basePrice,
    Number(strategy.plan.slippagePct) * 100 + FAILURE_SLIPPAGE_MARGIN_BPS
  );
  const stamp = now.getTime().toString(36);
  let fillIndex = 0;

  return SIMULATION_OUTCOMES.slice(0, count).map((status, index) => {
    const isFill = status === "simulated";
    const isSecondFill = isFill && fillIndex === 1;

    if (isFill) fillIndex += 1;

    return {
      id: `sim-${stamp}-${index + 1}`,
      date: dates[index],
      scheduledFor: dates[index],
      asset: strategy.plan.asset,
      amountUsd: strategy.math.perTradeUsd,
      assetAmount: isFill ? (isSecondFill ? secondAmount : baseAmount) : 0,
      priceUsd: isFill
        ? isSecondFill
          ? secondPrice
          : basePrice
        : status === "simulated-failed"
          ? failurePrice
          : 0,
      status,
      mode: "simulated",
      planId: strategy.id,
      cycle: `${index + 1} of ${count}`,
      note: `Simulated cycle ${index + 1} of ${count} · ${strategy.id}`,
    };
  });
}
