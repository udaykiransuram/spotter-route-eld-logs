import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import { ChevronDown, CornerDownRight } from "lucide-react";
import { memo, useMemo } from "react";
import { formatDuration, formatMiles } from "../lib/format";
import type { RouteInstruction } from "../types";

export const DirectionsPanel = memo(function DirectionsPanel({ instructions }: { instructions: RouteInstruction[] }) {
  const grouped = useMemo(() => {
    const groups = new Map<number, RouteInstruction[]>();
    for (const instruction of instructions) {
      const leg = groups.get(instruction.leg_index) ?? [];
      leg.push(instruction);
      groups.set(instruction.leg_index, leg);
    }
    return groups;
  }, [instructions]);

  if (instructions.length === 0) return null;

  return (
    <Accordion
      className="directions-panel"
      slotProps={{ transition: { unmountOnExit: true } }}
      sx={{ "&.Mui-expanded": { margin: 0 } }}
    >
      <AccordionSummary
        aria-controls="route-instructions-content"
        className="directions-panel__summary"
        expandIcon={<ChevronDown size={17} aria-hidden="true" />}
        id="route-instructions-header"
        sx={{ minHeight: 48, padding: "0 15px", fontSize: 13, fontWeight: 750 }}
      >
        <span>Turn-by-turn route instructions ({instructions.length})</span>
      </AccordionSummary>
      <AccordionDetails className="directions-panel__body" id="route-instructions-content">
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
      </AccordionDetails>
    </Accordion>
  );
});
