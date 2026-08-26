import Alert from "@mui/material/Alert";
import Paper from "@mui/material/Paper";
import { CheckCircle2, TriangleAlert } from "lucide-react";
import { memo } from "react";

interface AssumptionsPanelProps {
  assumptions: string[];
  warnings?: string[];
}

export const AssumptionsPanel = memo(function AssumptionsPanel({ assumptions, warnings = [] }: AssumptionsPanelProps) {
  return (
    <Paper
      className="assumptions"
      component="section"
      elevation={0}
      aria-labelledby="assumptions-title"
    >
      <h2 id="assumptions-title">Assumptions used</h2>
      <ul>
        {assumptions.map((assumption) => (
          <li key={assumption}><CheckCircle2 size={15} aria-hidden="true" /><span>{assumption}</span></li>
        ))}
      </ul>
      {warnings.length > 0 ? (
        <div className="assumptions__warnings">
          {warnings.map((warning) => (
            <Alert
              icon={<TriangleAlert size={15} aria-hidden="true" />}
              key={warning}
              role="note"
              severity="warning"
              sx={{
                alignItems: "flex-start",
                borderRadius: 0,
                backgroundColor: "transparent",
                color: "var(--ink)",
                fontSize: 12,
                fontWeight: 450,
                lineHeight: 1.4,
                padding: 0,
                "& .MuiAlert-icon": {
                  color: "#b56e00",
                  marginRight: 1,
                  padding: 0,
                },
                "& .MuiAlert-message": { padding: 0 },
              }}
            >
              {warning}
            </Alert>
          ))}
        </div>
      ) : null}
    </Paper>
  );
});
