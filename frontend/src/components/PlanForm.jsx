import { ASSETS, CADENCES } from "../data/mock";
import { formatUsd } from "../lib/format";

export default function PlanForm({
  plan,
  math,
  onChange,
  onSubmit,
  loading,
  error,
}) {
  return (
    <section className="card plan-card" aria-labelledby="plan-title">
      <div className="card-heading">
        <div>
          <p className="eyebrow">Simulated DCA plan</p>
          <h2 id="plan-title">Build a simulated DCA plan</h2>
        </div>
        <span className="badge badge-muted">USDC → {plan.asset}</span>
      </div>

      <form className="plan-form" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="budget">Weekly budget (USDC)</label>
          <div className="input-wrap">
            <span>$</span>
            <input
              id="budget"
              name="budgetUsd"
              type="number"
              min="10"
              max="25000"
              step="1"
              value={plan.budgetUsd}
              onChange={(event) =>
                onChange({ budgetUsd: Number(event.target.value) })
              }
            />
          </div>
          <p className="field-hint">
            The most you would spend each week in this simulation.
          </p>
        </div>

        <div className="field">
          <label htmlFor="asset">Target asset</label>
          <select
            id="asset"
            name="asset"
            value={plan.asset}
            onChange={(event) => onChange({ asset: event.target.value })}
          >
            {ASSETS.map((asset) => (
              <option
                key={asset.symbol}
                value={asset.symbol}
                disabled={!asset.availableInDemo}
              >
                {asset.symbol} — {asset.name}
                {asset.availableInDemo ? "" : " (roadmap)"}
              </option>
            ))}
          </select>
          <p className="field-hint">
            This prototype is NEAR-only. BTC, ETH, and cross-chain deposits are
            roadmap items.
          </p>
        </div>

        <div className="field">
          <label htmlFor="cadence">DCA cadence</label>
          <select
            id="cadence"
            name="cadence"
            value={plan.cadence}
            onChange={(event) => onChange({ cadence: event.target.value })}
          >
            {CADENCES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label} ({item.hint})
              </option>
            ))}
          </select>
          <p className="field-hint">
            How many simulated runs happen each week.
          </p>
        </div>

        <div className="field">
          <span className="field-label">Per-run amount (USDC, calculated)</span>
          <div
            className="readout"
            role="status"
            aria-label="Per-run amount calculated from weekly budget and cadence"
          >
            <strong>{formatUsd(math.perTradeUsd)}</strong>
            <span>
              {formatUsd(math.budgetUsd)} ÷ {math.runsPerWeek} runs
            </span>
          </div>
          <p className="field-hint">
            Calculated automatically from the weekly budget and cadence. Not
            editable.
          </p>
        </div>

        <div className="field">
          <span className="field-label">Planned weekly spend (USDC)</span>
          <div
            className="readout"
            role="status"
            aria-label="Planned weekly spend calculated from per-run amount and runs per week"
          >
            <strong>{formatUsd(math.plannedWeeklyUsd)}</strong>
            <span>per-trade amount × runs per week</span>
          </div>
          <p className="field-hint">
            Should match the weekly budget; cents may differ after display
            rounding.
          </p>
        </div>

        <div className="field">
          <label htmlFor="slippage">Slippage limit (%)</label>
          <div className="input-wrap">
            <input
              id="slippage"
              name="slippagePct"
              type="number"
              min="0.1"
              max="5"
              step="0.1"
              value={plan.slippagePct}
              onChange={(event) =>
                onChange({ slippagePct: Number(event.target.value) })
              }
            />
            <span>%</span>
          </div>
          <p className="field-hint">
            The most simulated price movement you would accept before a run is
            marked failed.
          </p>
        </div>

        <div className="field">
          <label htmlFor="startDate">First run (preview)</label>
          <input
            id="startDate"
            name="startDate"
            type="date"
            value={plan.startDate}
            onChange={(event) => onChange({ startDate: event.target.value })}
          />
          <p className="field-hint">
            No scheduler runs yet. This date is stored for the preview only.
          </p>
        </div>

        <div className="field field-wide">
          <div className="toggle-row">
            <div>
              <span className="toggle-label">Simulation mode</span>
              <p className="field-hint">
                Locked on for this demo. No wallet, deposit, signature, or
                transaction is used.
              </p>
            </div>
            <span className="badge badge-green">
              <span className="dot" aria-hidden="true" />
              Locked on
            </span>
          </div>
        </div>

        {error ? (
          <p className="form-error field-wide" role="alert">
            {error}
          </p>
        ) : null}

        <div className="form-actions field-wide">
          <button
            className="button button-primary"
            type="submit"
            disabled={loading}
          >
            {loading ? "Building quote…" : "Preview quote"}
          </button>
          <p className="muted small">
            Uses the configured quote source. Mock mode makes no external calls;
            optional 1Click dry quotes are read-only mainnet requests. No wallet
            or deposit address is used.
          </p>
        </div>
      </form>
    </section>
  );
}
