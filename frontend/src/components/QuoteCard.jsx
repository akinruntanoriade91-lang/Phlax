import { useEffect, useState } from "react";
import { formatAsset, formatDate, formatDecimal, formatUsd } from "../lib/format";

function formatEstimate(seconds) {
  const value = Number(seconds);

  if (!Number.isFinite(value) || value < 0) {
    return "Not provided by 1Click";
  }

  if (value === 0) return "Instant";

  return `≈ ${formatAsset(value, 0)}s`;
}

function formatSlippage(bps) {
  const value = Math.trunc(Number(bps) || 0);
  const whole = Math.trunc(value / 100);
  const fraction = String(Math.abs(value % 100)).padStart(2, "0");

  return `${formatDecimal(`${whole}.${fraction}`, 2, 0)}%`;
}

export default function QuoteCard({
  quote,
  loading,
  error,
  notice,
  onSimulate,
  onSimulateFailure,
  onSimulateRefund,
}) {
  const [now, setNow] = useState(Date.now());
  const isLive = quote?.source === "1click-dry";

  useEffect(() => {
    if (!quote || isLive) return undefined;

    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [quote, isLive]);

  if (loading) {
    return (
      <section className="card quote-card" aria-live="polite">
        <p className="eyebrow">Quote preview</p>
        <h2>Building quote…</h2>
        <div className="skeleton-grid">
          <div className="skeleton skeleton-block" />
          <div className="skeleton skeleton-block" />
          <div className="skeleton skeleton-block" />
          <div className="skeleton skeleton-block" />
        </div>
      </section>
    );
  }

  if (!quote) {
    return (
      <section className="card quote-card" aria-labelledby="quote-title">
        <div className="card-heading">
          <div>
            <p className="eyebrow">Quote preview</p>
            <h2 id="quote-title">Quote preview</h2>
          </div>
          <span className="badge">Not requested</span>
        </div>

        <div className="empty-state">
          <p>
            Set a plan and select <strong>Preview quote</strong>. Mock mode is the
            default and runs entirely locally. If the backend is configured for
            the optional 1Click dry source, the preview uses read-only mainnet
            market data. Neither mode connects a wallet or can move funds.
          </p>
        </div>

        {notice ? (
          <p className="form-success" role="status">
            {notice}
          </p>
        ) : null}

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
      </section>
    );
  }

  const secondsLeft = quote.expiresAt
    ? Math.max(
        0,
        Math.ceil((new Date(quote.expiresAt).getTime() - now) / 1000)
      )
    : null;
  const expired = secondsLeft === 0;

  if (isLive) {
    const originSymbol = quote.originAsset?.symbol || "USDC";
    const destinationSymbol = quote.destinationAsset?.symbol || quote.asset;
    const tokenSymbol = quote.destinationAsset?.tokenSymbol;
    const estimate = formatEstimate(quote.timeEstimate);

    return (
      <section
        className="card quote-card"
        aria-labelledby="quote-title"
        aria-live="polite"
      >
        <div className="card-heading">
          <div>
            <p className="eyebrow">1Click dry quote</p>
            <h2 id="quote-title">
              Live 1Click dry quote · {destinationSymbol}
            </h2>
          </div>
          <div className="badge-row">
            <span className="badge badge-green">Live dry quote</span>
            <span className="badge badge-blue">Mainnet market data</span>
          </div>
        </div>

        <div className="warning-box">
          <strong>
            Live 1Click dry quote — mainnet market data, no transaction.
          </strong>{" "}
          This was a read-only request. No deposit address, wallet signature, or
          funds were used.
        </div>

        <div className="quote-grid">
          <div>
            <span>Source</span>
            <strong>1Click dry quote</strong>
            <small>Mainnet quote · dry: true</small>
          </div>
          <div>
            <span>Route</span>
            <strong>
              {originSymbol} → {destinationSymbol}
            </strong>
            <small>
              {tokenSymbol && tokenSymbol !== destinationSymbol
                ? `On-chain token: ${tokenSymbol}`
                : "Origin chain to destination chain"}
            </small>
          </div>
          <div>
            <span>Input</span>
            <strong>
              {formatAsset(quote.amountInFormatted, 6)} {originSymbol}
            </strong>
            <small>≈ {formatUsd(quote.amountUsd)} planned spend</small>
          </div>
          <div>
            <span>Expected output</span>
            <strong>
              {formatAsset(quote.amountOutFormatted, 8)} {destinationSymbol}
            </strong>
            <small>1Click quote estimate</small>
          </div>
          <div>
            <span>Minimum output</span>
            <strong>
              {formatAsset(quote.minAmountOutFormatted, 8)} {destinationSymbol}
            </strong>
            <small>After the slippage cap</small>
          </div>
          <div>
            <span>Slippage limit</span>
            <strong>{formatSlippage(quote.slippageBps)}</strong>
            <small>User-defined cap</small>
          </div>
          <div>
            <span>Estimate</span>
            <strong>{estimate}</strong>
            <small>As reported by 1Click</small>
          </div>
          <div>
            <span>Fetched</span>
            <strong>{formatDate(quote.fetchedAt)}</strong>
            <small>Dry quotes do not return an expiry deadline</small>
          </div>
        </div>

        {notice ? (
          <p className="form-success" role="status">
            {notice}
          </p>
        ) : null}

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="quote-actions">
          <button
            className="button button-primary"
            type="button"
            onClick={onSimulate}
          >
            Simulate fill
          </button>
          <button
            className="button button-ghost button-inline"
            type="button"
            onClick={onSimulateFailure}
          >
            Simulate failed run
          </button>
          <button
            className="button button-ghost button-inline"
            type="button"
            onClick={onSimulateRefund}
          >
            Simulate refund
          </button>
        </div>
        <p className="muted small quote-footnote">
          Every action adds a clearly labeled simulated row to history. None sends
          a transaction or moves funds.
        </p>
      </section>
    );
  }

  return (
    <section
      className="card quote-card"
      aria-labelledby="quote-title"
      aria-live="polite"
    >
      <div className="card-heading">
        <div>
          <p className="eyebrow">Mock quote</p>
          <h2 id="quote-title">Mock quote · {quote.asset}</h2>
        </div>
        <div className="badge-row">
          <span className="badge badge-green">Mock — no network call</span>
          <span className={`badge ${expired ? "badge-red" : "badge-blue"}`}>
            {expired ? "Expired" : `${secondsLeft}s left`}
          </span>
        </div>
      </div>

      <div className="warning-box">
        <strong>Mock quote — no live market data.</strong> This quote comes from
        the local mock service. No 1Click call, wallet signature, or funds were
        used.
      </div>

      <div className="quote-grid">
        <div>
          <span>Source</span>
          <strong>Local mock service</strong>
          <small>Deterministic, generated locally</small>
        </div>
        <div>
          <span>Route</span>
          <strong>USDC → {quote.asset}</strong>
          <small>Simulated NEAR-only route</small>
        </div>
        <div>
          <span>Input</span>
          <strong>{formatUsd(quote.amountUsd)}</strong>
          <small>Simulated fee {formatUsd(quote.feeUsd)}</small>
        </div>
        <div>
          <span>Expected output</span>
          <strong>
            {formatAsset(quote.assetAmount, 6)} {quote.asset}
          </strong>
          <small>Mock estimate</small>
        </div>
        <div>
          <span>Minimum output</span>
          <strong>
            {formatAsset(quote.minAssetAmount, 6)} {quote.asset}
          </strong>
          <small>After the slippage cap</small>
        </div>
        <div>
          <span>Slippage limit</span>
          <strong>{formatSlippage(quote.slippageBps)}</strong>
          <small>User-defined cap</small>
        </div>
        <div>
          <span>Estimate</span>
          <strong>Instant (mock)</strong>
          <small>Simulated rate {formatUsd(quote.priceUsd, 4)}</small>
        </div>
        <div>
          <span>Fetched</span>
          <strong>{formatDate(quote.createdAt)}</strong>
          <small>Expires {formatDate(quote.expiresAt)}</small>
        </div>
      </div>

      {expired ? (
        <p className="form-error" role="alert">
          Mock quote expired. Preview a new quote before simulating a fill.
        </p>
      ) : null}

      {notice ? (
        <p className="form-success" role="status">
          {notice}
        </p>
      ) : null}

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="quote-actions">
        <button
          className="button button-primary"
          type="button"
          onClick={onSimulate}
          disabled={expired}
        >
          Simulate fill
        </button>
        <button
          className="button button-ghost button-inline"
          type="button"
          onClick={onSimulateFailure}
          disabled={expired}
        >
          Simulate failed run
        </button>
        <button
          className="button button-ghost button-inline"
          type="button"
          onClick={onSimulateRefund}
          disabled={expired}
        >
          Simulate refund
        </button>
      </div>
      <p className="muted small quote-footnote">
        Every action adds a clearly labeled simulated row to history. None sends
        a transaction or moves funds.
      </p>
    </section>
  );
}
