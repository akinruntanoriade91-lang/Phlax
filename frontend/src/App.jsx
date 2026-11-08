import { useEffect, useMemo, useState } from "react";
import Header from "./components/Header";
import HistoryTable from "./components/HistoryTable";
import PlanAssistant from "./components/PlanAssistant";
import PlanForm from "./components/PlanForm";
import QuoteCard from "./components/QuoteCard";
import Roadmap from "./components/Roadmap";
import StatGrid from "./components/StatGrid";
import StrategyCard from "./components/StrategyCard";
import WalletCard from "./components/WalletCard";
import { DEFAULT_PLAN, MOCK_HISTORY } from "./data/mock";
import {
  buildSimulatedCycles,
  createStrategy,
  getPlanMath,
  validatePlan,
} from "./lib/plan";

const OUTCOME_MESSAGES = {
  simulated: "Simulated fill added to history. No wallet or transaction was used.",
  "simulated-failed":
    "Simulated failure added to history. No trade occurred and no funds moved.",
  "simulated-refunded":
    "Simulated refund added to history. This is a quote outcome, not a real refund.",
};

export default function App() {
  const [plan, setPlan] = useState(DEFAULT_PLAN);
  const [quote, setQuote] = useState(null);
  const [history, setHistory] = useState(MOCK_HISTORY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [strategy, setStrategy] = useState(null);
  const [runLoading, setRunLoading] = useState(false);
  const [runError, setRunError] = useState("");
  const [quoteSource, setQuoteSource] = useState(null);
  const [metaError, setMetaError] = useState("");

  const math = useMemo(() => getPlanMath(plan), [plan]);

  useEffect(() => {
    let active = true;

    fetch("/api/quote/meta")
      .then((response) => {
        if (!response.ok) {
          throw new Error("Quote status unavailable");
        }

        return response.json();
      })
      .then((payload) => {
        if (!active) return;

        setQuoteSource(payload?.data?.quoteSource ?? null);
        setMetaError("");
      })
      .catch(() => {
        if (!active) return;

        setQuoteSource(null);
        setMetaError("Quote status unavailable");
      });

    return () => {
      active = false;
    };
  }, []);

  function updatePlan(patch) {
    setPlan((previous) => ({ ...previous, ...patch }));
    setQuote(null);
    setError("");
    setNotice("");
    setRunError("");
  }

  function applySuggestion(suggestion) {
    updatePlan({
      cadence: suggestion.cadenceId,
      slippagePct: suggestion.slippagePct,
    });
    setNotice(
      "Plan assistant applied. The per-run amount and weekly spend were recalculated."
    );
  }

  function saveStrategy() {
    setError("");
    setNotice("");
    setRunError("");

    const validation = validatePlan(plan, math);

    if (validation) {
      setError(validation);
      return;
    }

    const nextStrategy = createStrategy(plan, math);

    setStrategy(nextStrategy);
    setNotice(
      `Strategy saved: ${nextStrategy.name}. Simulated cycles use this snapshot.`
    );
  }

  async function runCycles() {
    if (!strategy || runLoading || quoteSource?.source !== "mock") return;

    setRunError("");
    setNotice("");
    setRunLoading(true);

    try {
      const response = await fetch("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountUsd: strategy.math.perTradeUsd,
          asset: strategy.plan.asset,
          slippageBps: Math.round(Number(strategy.plan.slippagePct) * 100),
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          payload.errors?.join(" ") ||
            payload.message ||
            "Could not build the simulated cycles."
        );
      }

      if (payload.data?.source !== "mock") {
        throw new Error(
          "The run demo requires mock mode. No simulated cycles were added."
        );
      }

      const cycles = buildSimulatedCycles({
        strategy,
        quote: payload.data,
      });

      setHistory((previous) =>
        [...cycles, ...previous].sort(
          (left, right) => new Date(right.date) - new Date(left.date)
        )
      );
      setNotice(
        `${cycles.length} simulated cycles added for ${strategy.name}. No transaction was sent and no funds moved.`
      );
    } catch (requestError) {
      setRunError(
        requestError.message || "Could not run the simulated cycles."
      );
    } finally {
      setRunLoading(false);
    }
  }

  function resetDemo() {
    setPlan({ ...DEFAULT_PLAN });
    setStrategy(null);
    setQuote(null);
    setHistory(MOCK_HISTORY.map((item) => ({ ...item })));
    setLoading(false);
    setRunLoading(false);
    setError("");
    setRunError("");
    setNotice("Demo reset. Seeded history restored; no transactions exist.");
  }

  async function requestQuote(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    setQuote(null);

    const validation = validatePlan(plan, math);

    if (validation) {
      setError(validation);
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountUsd: math.perTradeUsd,
          asset: plan.asset,
          slippageBps: Math.round(Number(plan.slippagePct) * 100),
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          payload.errors?.join(" ") ||
            payload.message ||
            "Could not create a quote."
        );
      }

      setQuote(payload.data);
      setNotice(
        payload.data?.source === "1click-dry"
          ? "Live 1Click dry quote — mainnet market data, no transaction."
          : "Mock quote received from the local mock API. No live market data was used."
      );
    } catch (requestError) {
      setError(
        requestError.message ||
          "Could not create a quote. Is the local API running on port 5000?"
      );
    } finally {
      setLoading(false);
    }
  }

  function addOutcome(status) {
    if (!quote) return;

    const received = status === "simulated" ? quote.assetAmount : 0;
    const notes = {
      simulated: "Simulated fill from preview quote",
      "simulated-failed": "Simulated failure — no trade filled",
      "simulated-refunded": "Refunded — simulated quote outcome",
    };

    const fill = {
      id: `sim-${Date.now()}`,
      date: new Date().toISOString(),
      asset: quote.asset,
      amountUsd: quote.amountUsd,
      assetAmount: received,
      priceUsd: quote.priceUsd,
      status,
      mode: "simulated",
      note: notes[status],
    };

    setHistory((previous) => [fill, ...previous]);
    setNotice(OUTCOME_MESSAGES[status]);
  }

  return (
    <div className="app-shell" id="top">
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />

      <div className="container">
        <Header quoteSource={quoteSource} metaError={metaError} />

        <main>
          <section className="hero">
            <p className="eyebrow">
              NEAR Hackathon · Track 01: Unstoppable DeFi
            </p>
            <h1>
              Steady buys, <span>previewed honestly.</span>
            </h1>
            <p className="hero-copy">
              A NEAR-only dry-run prototype for a non-custodial DCA vault. Build
              a plan, preview a quote, and inspect fill, failure, and refund
              outcomes. Mock quotes are the default; an optional read-only
              1Click dry-quote source can use mainnet market data when enabled
              locally. Wallet connection, transaction execution, and cross-chain
              deposits remain roadmap items.
            </p>
            <div className="hero-badges">
              <span className="badge badge-green">
                <span className="dot" aria-hidden="true" />
                Dry-run simulation
              </span>
              <span className="badge">Mock quotes by default</span>
              <span className="badge badge-blue">
                Optional 1Click dry quotes
              </span>
              <span className="badge badge-muted">
                Wallet not enabled in this demo
              </span>
            </div>
          </section>

          {notice ? (
            <div className="notice-banner" role="status">
              {notice}
            </div>
          ) : null}

          <StatGrid math={math} historyCount={history.length} />

          <StrategyCard
            strategy={strategy}
            plan={plan}
            quoteSource={quoteSource}
            metaError={metaError}
            runLoading={runLoading}
            runError={runError}
            onSave={saveStrategy}
            onRun={runCycles}
            onReset={resetDemo}
          />

          <div className="dashboard-grid">
            <PlanForm
              plan={plan}
              math={math}
              onChange={updatePlan}
              onSubmit={requestQuote}
              loading={loading}
              error={error}
            />

            <aside className="side-column">
              <WalletCard />
              <PlanAssistant
                plan={plan}
                math={math}
                onApply={applySuggestion}
              />
            </aside>
          </div>

          <QuoteCard
            quote={quote}
            loading={loading}
            error={error}
            notice={quote ? notice : ""}
            onSimulate={() => addOutcome("simulated")}
            onSimulateFailure={() => addOutcome("simulated-failed")}
            onSimulateRefund={() => addOutcome("simulated-refunded")}
          />

          <HistoryTable items={history} />

          <Roadmap />
        </main>

        <footer className="site-footer">
          <p>
            Phlax is a hackathon prototype. Simulation only: no custody, no real
            funds, no wallet connection, and no financial advice.
          </p>
          <p className="muted small">
            Frontend: Vite + React · Backend: Express quote service · Mock by
            default, optional read-only 1Click dry quotes · No wallet libraries,
            deposits, or transactions.
          </p>
        </footer>
      </div>
    </div>
  );
}
