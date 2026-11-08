export default function Header({ quoteSource, metaError }) {
  const source = quoteSource?.source;
  let modeBadge;

  if (metaError) {
    modeBadge = <span className="badge badge-red">Quote status unavailable</span>;
  } else if (!quoteSource) {
    modeBadge = <span className="badge badge-muted">Checking quote source…</span>;
  } else if (source === "mock") {
    modeBadge = (
      <span className="badge badge-green">
        <span className="dot" aria-hidden="true" />
        Mock mode · no external calls
      </span>
    );
  } else {
    modeBadge = (
      <span className="badge badge-blue">{source} · read-only</span>
    );
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
        {modeBadge}
        <span className="badge badge-muted">Optional 1Click dry quotes</span>
        <span className="badge badge-muted">v0.3 prototype</span>
      </div>
    </header>
  );
}
