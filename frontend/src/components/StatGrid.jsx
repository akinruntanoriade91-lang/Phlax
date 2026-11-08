import { formatUsd } from "../lib/format";

export default function StatGrid({ math, historyCount }) {
  const items = [
    {
      label: "Weekly budget",
      value: formatUsd(math.budgetUsd),
      hint: "Simulated USDC allocation",
    },
    {
      label: "Per simulated run",
      value: formatUsd(math.perTradeUsd),
      hint: "Calculated automatically",
    },
    {
      label: "Runs / week",
      value: math.runsPerWeek,
      hint: math.cadence.hint,
    },
    {
      label: "Planned / week",
      value: formatUsd(math.plannedWeeklyUsd),
      hint: "Budget × cadence",
    },
  ];

  return (
    <section className="stat-grid" aria-label="Simulated plan summary">
      {items.map((item) => (
        <article className="stat-card" key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
          <small>{item.hint}</small>
        </article>
      ))}
      <p className="stat-grid-note muted small">
        {historyCount} simulated history row(s). No real deposits, custody, or
        trades.
      </p>
    </section>
  );
}
