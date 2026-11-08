import { formatAsset, formatDate, formatUsd } from "../lib/format";

const STATUS_LABELS = {
  simulated: "Simulated fill",
  "simulated-failed": "Simulated failure",
  "simulated-refunded": "Simulated refund",
  failed: "Simulated failure",
  refunded: "Simulated refund",
  skipped: "Simulated skip",
};

export default function HistoryTable({ items }) {
  return (
    <section className="card history-card" aria-labelledby="history-title">
      <div className="card-heading">
        <div>
          <p className="eyebrow">Simulation log</p>
          <h2 id="history-title">Simulated trade history</h2>
        </div>
        <span className="badge badge-muted">All rows are simulated</span>
      </div>

      <p className="muted">
        These rows are generated locally to preview how a real history could
        look. They are not on-chain records, receipts, or proof of custody.
      </p>

      {items.length === 0 ? (
        <div className="empty-state">
          <p>
            No simulated fills yet. Preview a quote and choose an outcome.
          </p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Mode</th>
                <th>Asset</th>
                <th>Simulated spend</th>
                <th>Simulated received</th>
                <th>Simulated rate</th>
                <th>Outcome</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{formatDate(item.date)}</td>
                  <td>
                    <span className="badge badge-muted">Simulated</span>
                  </td>
                  <td>
                    <span className="asset-chip">{item.asset}</span>
                  </td>
                  <td>{formatUsd(item.amountUsd)}</td>
                  <td>
                    {item.assetAmount
                      ? `${formatAsset(item.assetAmount, 6)} ${item.asset}`
                      : "—"}
                  </td>
                  <td>
                    {item.priceUsd ? formatUsd(item.priceUsd, 4) : "—"}
                  </td>
                  <td>
                    <span className={`status-pill status-${item.status}`}>
                      {STATUS_LABELS[item.status] || item.status}
                    </span>
                  </td>
                  <td className="muted">{item.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
