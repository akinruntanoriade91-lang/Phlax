export default function Header({ quoteSource, market, metaError }) {
  const source = quoteSource?.source;
  let quoteBadge;

  if (metaError) {
    quoteBadge = <span className="badge badge-red">Quote status unavailable</span>;
  } else if (!quoteSource) {
    quoteBadge = <span className="badge badge-muted">Checking quote source…</span>;
  } else if (source === "mock") {
    quoteBadge = (
      <span className="badge badge-green">
        <span className="dot" aria-hidden="true" />
        Dry-run quote engine
      </span>
    );
  } else {
    quoteBadge = (
      <span className="badge badge-blue">{source} · read-only</span>
    );
  }

  let priceBadge;

  if (metaError || !market) {
    priceBadge = <span className="badge badge-muted">Price source unknown</span>;
  } else if (market.priceSource === "coinbase") {
    priceBadge = (
      <span className="badge badge-blue">Coinbase prices · read-only</span>
    );
  } else if (market.priceSource === "mock") {
    priceBadge = <span className="badge badge-muted">Local reference prices</span>;
  } else {
    priceBadge = <span className="badge badge-red">Invalid price configuration</span>;
  }

  return (
    <header className="site-header">
      <a className="brand" href="#top" aria-label="Phlax home">
        <span className="brand-mark" aria-hidden="true">
          P
        </span>
        <span className="brand-copy">
          <strong>Phlax</strong>
          <small>NEAR DCA prototype</small>
        </span>
      </a>

      <div className="header-badges">
        <span className="badge badge-green">
          <span className="dot" aria-hidden="true" />
          Simulation only
        </span>
        {quoteBadge}
        {priceBadge}
        <span className="badge badge-muted">Optional 1Click dry quotes</span>
        <span className="badge badge-muted">v0.3 prototype</span>
      </div>
    </header>
  );
}
