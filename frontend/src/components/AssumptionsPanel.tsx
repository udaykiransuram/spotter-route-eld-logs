import Alert from "@mui/material/Alert";
import Paper from "@mui/material/Paper";
import {
  ChevronDown,
  ClipboardList,
  Settings2,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import { memo } from "react";
import {
  groupAssumptions,
  type AssumptionGroupId,
} from "../lib/assumption-groups";

interface AssumptionsPanelProps {
  assumptions: string[];
  warnings?: string[];
  notice?: string;
}

function GroupIcon({ id }: { id: AssumptionGroupId }) {
  if (id === "assessment") return <ClipboardList size={17} aria-hidden="true" />;
  if (id === "planning") return <Settings2 size={17} aria-hidden="true" />;
  return <ShieldAlert size={17} aria-hidden="true" />;
}

function itemLabel(count: number) {
  return `${count} ${count === 1 ? "item" : "items"}`;
}

export const AssumptionsPanel = memo(function AssumptionsPanel({
  assumptions,
  warnings = [],
  notice,
}: AssumptionsPanelProps) {
  const groups = groupAssumptions(assumptions, notice);
  const warningLabel = `${warnings.length} ${warnings.length === 1 ? "warning" : "warnings"}`;

  return (
    <Paper
      className="assumptions"
      component="section"
      elevation={0}
      aria-label="Plan basis"
    >
      <div className="assumptions__header">
        <div className="assumptions__heading-copy">
          <span className="assumptions__eyebrow">Planning basis</span>
          <h2 id="assumptions-title">Assumptions &amp; limitations</h2>
          <p>Review what this route and paper-log estimate assumes.</p>
        </div>
        <div
          className="assumptions__meta"
          aria-label={`${assumptions.length} assumptions and ${warningLabel}`}
        >
          <span>{assumptions.length} assumptions</span>
          <span className={warnings.length > 0 ? "assumptions__warning-count" : undefined}>
            {warningLabel}
          </span>
        </div>
      </div>

      {warnings.length > 0 ? (
        <section className="assumptions__warnings" aria-labelledby="plan-warnings-title">
          <div className="assumptions__warnings-heading">
            <TriangleAlert size={18} aria-hidden="true" />
            <div>
              <h3 id="plan-warnings-title">
                {warnings.length} route {warnings.length === 1 ? "warning" : "warnings"} to review
              </h3>
              <p>Check these plan-specific conditions before relying on the route or logs.</p>
            </div>
          </div>
          <div className="assumptions__warnings-list">
            {warnings.map((warning, index) => (
              <Alert
                className="assumptions__warning"
                icon={<TriangleAlert size={15} aria-hidden="true" />}
                key={`${index}-${warning}`}
                role="note"
                severity="warning"
              >
                {warning}
              </Alert>
            ))}
          </div>
        </section>
      ) : null}

      <div className="assumptions__groups">
        {groups.map((group) => (
          <details
            className={`assumptions__group assumptions__group--${group.id}`}
            data-assumption-group={group.id}
            key={group.id}
            open={group.id !== "planning"}
          >
            <summary>
              <span className="assumptions__group-icon"><GroupIcon id={group.id} /></span>
              <span className="assumptions__group-copy">
                <strong>{group.title}</strong>
                <span>{group.description}</span>
              </span>
              <span className="assumptions__group-count">{itemLabel(group.itemCount)}</span>
              <ChevronDown className="assumptions__group-chevron" size={17} aria-hidden="true" />
            </summary>
            <div className="assumptions__group-content">
              {group.sections.map((section, sectionIndex) => (
                <section
                  className="assumptions__section"
                  key={section.title ?? `${group.id}-${sectionIndex}`}
                >
                  {section.title ? <h4>{section.title}</h4> : null}
                  <ul className="assumptions__items">
                    {section.items.map((item, itemIndex) => {
                      const isNotice = group.id === "limitations" && item === notice?.trim();
                      return (
                        <li
                          className={`assumptions__item assumptions__item--${isNotice ? "notice" : "assumption"}`}
                          key={`${itemIndex}-${item}`}
                        >
                          <span className="assumptions__item-marker" aria-hidden="true" />
                          <span>{item}</span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          </details>
        ))}
      </div>
    </Paper>
  );
});
