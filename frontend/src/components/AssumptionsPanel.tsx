import { CheckCircle2, TriangleAlert } from "lucide-react";

interface AssumptionsPanelProps {
  assumptions: string[];
  warnings?: string[];
}

export function AssumptionsPanel({ assumptions, warnings = [] }: AssumptionsPanelProps) {
  return (
    <section className="assumptions" aria-labelledby="assumptions-title">
      <h2 id="assumptions-title">Assumptions used</h2>
      <ul>
        {assumptions.map((assumption) => (
          <li key={assumption}><CheckCircle2 size={15} aria-hidden="true" /><span>{assumption}</span></li>
        ))}
      </ul>
      {warnings.length > 0 ? (
        <div className="assumptions__warnings">
          {warnings.map((warning) => <p key={warning}><TriangleAlert size={15} aria-hidden="true" />{warning}</p>)}
        </div>
      ) : null}
    </section>
  );
}
