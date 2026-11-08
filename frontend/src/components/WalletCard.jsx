export default function WalletCard() {
  return (
    <section className="card wallet-card" aria-labelledby="wallet-title">
      <div className="card-heading">
        <div>
          <p className="eyebrow">Access</p>
          <h2 id="wallet-title">Wallet</h2>
        </div>
        <span className="status-pill status-idle">Disabled in demo</span>
      </div>

      <p className="muted">
        Wallet connection is not enabled in this demo. No account, signature,
        deposit, or transaction is requested.
      </p>

      <button
        className="button button-ghost"
        type="button"
        disabled
        title="Wallet connection is a roadmap item"
      >
        Wallet not enabled in this demo
      </button>

      <dl className="mini-list">
        <div>
          <dt>Network</dt>
          <dd>NEAR integration planned</dd>
        </div>
        <div>
          <dt>Custody</dt>
          <dd>Self-custody planned after wallet integration</dd>
        </div>
        <div>
          <dt>Mode</dt>
          <dd>Simulation only</dd>
        </div>
      </dl>
    </section>
  );
}
