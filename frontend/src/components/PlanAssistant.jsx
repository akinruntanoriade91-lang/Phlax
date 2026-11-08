import { formatUsd } from "../lib/format";
import { buildPlanSuggestion } from "../lib/plan";

export default function PlanAssistant({ plan, math, onApply }) {
  const suggestion = buildPlanSuggestion(plan, math);

  return (
    <section className="card suggestion-card" aria-labelledby="assistant-title">
      <div className="card-heading">
        <div>
          <p className="eyebrow">Deterministic rules</p>
          <h2 id="assistant-title">Plan assistant</h2>
        </div>
        <span className="badge badge-blue">Not an AI model</span>
      </div>

      <p className="suggestion-headline">{suggestion.headline}</p>
      <p className="muted">{suggestion.detail}</p>

      <div className="suggestion-values">
        <div>
          <span>Per run now</span>
          <strong>{formatUsd(suggestion.perTradeUsd)}</strong>
        </div>
        <div>
          <span>Suggested slippage</span>
          <strong>{suggestion.slippagePct.toFixed(1)}%</strong>
        </div>
      </div>

      <p className="muted small">{suggestion.suggestedDetail}</p>
      <p className="muted small">{suggestion.inputs}</p>
      <p className="muted small">{suggestion.output}</p>
      <p className="suggestion-rationale">{suggestion.risk}</p>

      <button
        className="button button-secondary"
        type="button"
        onClick={() => onApply(suggestion)}
      >
        Apply suggestion
      </button>
      <p className="field-hint">
        {suggestion.cadenceChanges
          ? `Updates the cadence to ${suggestion.cadence.label.toLowerCase()} and the slippage limit. The per-run amount is recalculated everywhere.`
          : "Updates the slippage limit. The per-run amount is recalculated everywhere."}
      </p>
      <p className="field-hint">
        Rule-based guidance only, not financial advice. You approve every
        setting; nothing executes.
      </p>
    </section>
  );
}
