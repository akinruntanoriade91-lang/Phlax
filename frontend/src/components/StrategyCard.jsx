import { formatDate, formatUsd } from "../lib/format";

function planSignature(plan) {
  return [plan.budgetUsd, plan.asset, plan.cadence, plan.slippagePct, plan.startDate].join("|");
}

export default function StrategyCard({
  strategy,
  plan,
  quoteSource,
  market,
  metaError,
  runLoading,
  runError,
  onSave,
  onRun,
  onReset,
}) {
  const mockReady = quoteSource?.source === "mock";
  const hasUnsavedChanges = strategy
    ? planSignature(strategy.plan) !== planSignature(plan)
    : false;
  const runDisabled = !strategy || runLoading || !mockReady;

  let sourceLabel = "Checking quote source…";
  let sourceBadge = "badge-muted";

  if (metaError) {
    sourceLabel = "Quote status unavailable";
    sourceBadge = "badge-red";
  } else if (quoteSource) {
    sourceLabel = mockReady
      ? "Dry-run quote engine"
      : `${quoteSource.source} · read-only`;
    sourceBadge = mockReady ? "badge-green" : "badge-blue";
  }

  const livePrice = market?.priceSource === "coinbase";
  const priceBadge = livePrice
    ? "badge-blue"
    : market?.priceSource === "mock"
      ? "badge-muted"
      : market?.priceSource === "invalid"
        ? "badge-red"
        : "badge-muted";
  const priceLabel = livePrice
    ? "Coinbase prices · read-only"
    : market?.priceSource === "mock"
      ? "Local reference prices"
      : market?.priceSource === "invalid"
        ? "Invalid price configuration"
        : "Price source unknown";
  const priceFootnote = livePrice
    ? "Prices are read-only Coinbase market data and are not executable NEAR Intents quotes."
    : market?.priceSource === "mock"
      ? "Prices are local reference values; no live market data is used."
      : "Price source status is unavailable; every row is still simulated.";

  let runHint;

  if (!strategy) {
    runHint = "Save a strategy first";
  } else if (!mockReady) {
    runHint = "Run demo requires the dry-run quote engine";
  }

  return (
    <section className="card strategy-card" aria-labelledby="strategy-title">
      <div className="card-heading">
        <div>
          <p className="eyebrow">Demo strategy</p>
          <h2 id="strategy-title">Active strategy</h2>
        </div>
        <div className="badge-row">
          <span className={`badge ${sourceBadge}`}>
            <span className="dot" aria-hidden="true" />
            {sourceLabel}
          </span>
          <span className={`badge ${priceBadge}`}>{priceLabel}</span>
          {strategy ? (
            <span className="badge badge-blue">
              {strategy.status === "active" ? "Active" : strategy.status}
            </span>
          ) : null}
        </div>
      </div>

      {strategy ? (
        <>
          <p className="suggestion-headline">{strategy.name}</p>
          <p className="muted small strategy-id">
            {strategy.id} · created {formatDate(strategy.createdAt)}
          </p>

          <div className="suggestion-values">
            <div>
              <span>Weekly budget</span>
              <strong>{formatUsd(strategy.math.budgetUsd)}</strong>
            </div>
            <div>
              <span>Per run</span>
              <strong>{formatUsd(strategy.math.perTradeUsd)}</strong>
            </div>
            <div>
              <span>Cadence</span>
              <strong>{strategy.math.cadenceLabel}</strong>
            </div>
            <div>
              <span>Slippage cap</span>
              <strong>{strategy.plan.slippagePct}%</strong>
            </div>
          </div>

          <dl className="mini-list">
            <div>
              <dt>Route</dt>
              <dd>USDC → {strategy.plan.asset}</dd>
            </div>
            <div>
              <dt>Runs / week</dt>
              <dd>{strategy.math.runsPerWeek}</dd>
            </div>
            <div>
              <dt>First preview run</dt>
              <dd>{strategy.plan.startDate}</dd>
            </div>
            <div>
              <dt>Execution</dt>
              <dd>Simulated only</dd>
            </div>
          </dl>

          {hasUnsavedChanges ? (
            <p className="form-error" role="status">
              The form has unsaved changes. Save again to update the active
              strategy.
            </p>
          ) : null}
        </>
      ) : (
        <div className="empty-state">
          <p>
            No saved strategy yet. Build a plan, then save it to unlock the
            four-cycle simulation.
          </p>
        </div>
      )}

      {runError ? (
        <p className="form-error" role="alert">
          {runError}
        </p>
      ) : null}

      <div className="strategy-actions">
        <button className="button button-primary" type="button" onClick={onSave}>
          {strategy ? "Save updated strategy" : "Save strategy"}
        </button>
        <button
          className="button button-secondary"
          type="button"
          onClick={onRun}
          disabled={runDisabled}
          title={runHint}
        >
          {runLoading ? "Running 4 cycles…" : "Run next 4 cycles"}
        </button>
        <button className="button button-ghost" type="button" onClick={onReset}>
          Reset demo
        </button>
      </div>

      <p className="muted small strategy-footnote">
        Runs use this saved snapshot and the dry-run quote engine.{" "}
        {priceFootnote} Every row is simulated: no wallet, deposit, signature, or
        transaction is used.
      </p>
    </section>
  );
}
