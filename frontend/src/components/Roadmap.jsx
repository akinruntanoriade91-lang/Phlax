export default function Roadmap() {
  const steps = [
    "Connect a NEAR wallet and show the account ID.",
    "Add opt-in transaction execution and status tracking after a separate safety review.",
    "Track real quote statuses, including FAILED and REFUNDED.",
    "Add cross-chain deposits only after the NEAR-only flow works.",
  ];

  return (
    <section className="card roadmap-card" aria-labelledby="roadmap-title">
      <div className="card-heading">
        <div>
          <p className="eyebrow">Roadmap</p>
          <h2 id="roadmap-title">Next integration steps</h2>
        </div>
        <span className="badge badge-muted">Not implemented yet</span>
      </div>

      <p className="muted">
        The optional 1Click dry quote source is implemented as a read-only
        preview. The milestones below are not.
      </p>

      <ol className="roadmap-list">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </section>
  );
}
