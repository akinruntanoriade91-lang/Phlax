export const ASSETS = [
  {
    symbol: "NEAR",
    name: "NEAR Protocol",
    priceUsd: 5.2,
    volatility: "Medium",
    slippagePct: 0.5,
    accent: "#4ade80",
    availableInDemo: true,
  },
  {
    symbol: "BTC",
    name: "Bitcoin",
    priceUsd: 68500,
    volatility: "Low",
    slippagePct: 0.5,
    accent: "#f7931a",
    availableInDemo: false,
  },
  {
    symbol: "ETH",
    name: "Ethereum",
    priceUsd: 3200,
    volatility: "Medium",
    slippagePct: 0.8,
    accent: "#818cf8",
    availableInDemo: false,
  },
];

export const CADENCES = [
  {
    id: "daily",
    label: "Daily",
    runsPerWeek: 7,
    hint: "7 runs per week",
  },
  {
    id: "weekly",
    label: "Weekly",
    runsPerWeek: 1,
    hint: "1 run per week",
  },
  {
    id: "biweekly",
    label: "Every 2 weeks",
    runsPerWeek: 0.5,
    hint: "1 run every 2 weeks",
  },
];

export const DEFAULT_PLAN = {
  budgetUsd: 100,
  asset: "NEAR",
  cadence: "daily",
  slippagePct: 0.5,
  startDate: new Date().toISOString().slice(0, 10),
};

// Fixed order so every demo run shows the same fill/fill/fail/refund pattern.
export const SIMULATION_CYCLE_COUNT = 4;

export const SIMULATION_OUTCOMES = [
  "simulated",
  "simulated",
  "simulated-failed",
  "simulated-refunded",
];

export const MOCK_HISTORY = [
  {
    id: "sim-1042",
    date: "2026-11-06T09:00:00.000Z",
    asset: "NEAR",
    amountUsd: 14.29,
    assetAmount: 2.729885,
    priceUsd: 5.22,
    status: "simulated",
    mode: "simulated",
    note: "Simulated scheduled run",
  },
  {
    id: "sim-1041",
    date: "2026-11-05T09:00:00.000Z",
    asset: "NEAR",
    amountUsd: 14.29,
    assetAmount: 2.76699,
    priceUsd: 5.15,
    status: "simulated",
    mode: "simulated",
    note: "Simulated scheduled run",
  },
  {
    id: "sim-1040",
    date: "2026-11-04T09:00:00.000Z",
    asset: "NEAR",
    amountUsd: 14.29,
    assetAmount: 0,
    priceUsd: 0,
    status: "simulated-failed",
    mode: "simulated",
    note: "Simulated failure — slippage guard triggered",
  },
  {
    id: "sim-1039",
    date: "2026-11-03T09:00:00.000Z",
    asset: "NEAR",
    amountUsd: 14.29,
    assetAmount: 0,
    priceUsd: 0,
    status: "simulated-refunded",
    mode: "simulated",
    note: "Refunded — simulated quote outcome",
  },
  {
    id: "sim-1038",
    date: "2026-11-02T09:00:00.000Z",
    asset: "NEAR",
    amountUsd: 14.29,
    assetAmount: 2.761628,
    priceUsd: 5.16,
    status: "simulated",
    mode: "simulated",
    note: "Simulated scheduled run",
  },
];

export function cadenceById(id) {
  return CADENCES.find((item) => item.id === id) || CADENCES[0];
}

export function assetBySymbol(symbol) {
  return ASSETS.find((item) => item.symbol === symbol) || ASSETS[0];
}
