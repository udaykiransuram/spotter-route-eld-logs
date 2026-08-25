import { ChevronDown, CornerDownRight } from "lucide-react";
import { formatDuration, formatMiles } from "../lib/format";
import type { RouteInstruction } from "../types";

export function DirectionsPanel({ instructions }: { instructions: RouteInstruction[] }) {
  if (instructions.length === 0) return null;
  const grouped = new Map<number, RouteInstruction[]>();
  for (const instruction of instructions) {
    const leg = grouped.get(instruction.leg_index) ?? [];
    leg.push(instruction);
    grouped.set(instruction.leg_index, leg);
  }
  return (
    <details className="directions-panel">
      <summary><span>Turn-by-turn route instructions ({instructions.length})</span><ChevronDown size={17} aria-hidden="true" /></summary>
      <div className="directions-panel__body">
        {Array.from(grouped, ([legIndex, legInstructions]) => (
          <section key={legIndex} aria-labelledby={`route-leg-${legIndex}`}>
            <h3 id={`route-leg-${legIndex}`}>{legIndex === 0 ? "Current location → Pickup" : legIndex === 1 ? "Pickup → Drop-off" : `Route leg ${legIndex + 1}`}</h3>
            <ol>
              {legInstructions.map((instruction) => (
                <li key={instruction.id}>
                  <CornerDownRight size={16} aria-hidden="true" />
                  <span><strong>{instruction.instruction}</strong><small>{formatMiles(instruction.distance_miles)} · {formatDuration(instruction.duration_minutes)}</small></span>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </details>
  );
}
