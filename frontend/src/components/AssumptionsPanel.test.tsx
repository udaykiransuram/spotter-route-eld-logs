import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { tripPlanFixture } from "../test/fixture";
import { AssumptionsPanel } from "./AssumptionsPanel";

describe("AssumptionsPanel", () => {
  it("groups every assumption, surfaces warnings early, and shows the plan notice", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AssumptionsPanel
        assumptions={tripPlanFixture.assumptions}
        warnings={tripPlanFixture.warnings}
        notice={tripPlanFixture.notice}
      />,
    );

    const panel = screen.getByRole("region", { name: "Plan basis" });
    expect(within(panel).getByRole("heading", { name: "Assumptions & limitations" })).toBeInTheDocument();
    expect(within(panel).getByText(`${tripPlanFixture.assumptions.length} assumptions`)).toBeInTheDocument();
    expect(within(panel).getByText(`${tripPlanFixture.warnings.length} warnings`)).toBeInTheDocument();
    expect(within(panel).getByRole("heading", { name: "3 route warnings to review" })).toBeInTheDocument();
    expect(within(panel).getAllByRole("note")).toHaveLength(3);

    for (const assumption of tripPlanFixture.assumptions) {
      expect(within(panel).getAllByText(assumption)).toHaveLength(1);
    }
    expect(within(panel).getByText(tripPlanFixture.notice)).toBeInTheDocument();
    expect(container.querySelectorAll(".assumptions__item--assumption")).toHaveLength(
      tripPlanFixture.assumptions.length,
    );
    expect(container.querySelectorAll(".assumptions__item--notice")).toHaveLength(1);
    expect(container.querySelectorAll(".assumptions__item svg")).toHaveLength(0);

    const assessment = container.querySelector<HTMLDetailsElement>(
      '[data-assumption-group="assessment"]',
    );
    const planning = container.querySelector<HTMLDetailsElement>(
      '[data-assumption-group="planning"]',
    );
    const limitations = container.querySelector<HTMLDetailsElement>(
      '[data-assumption-group="limitations"]',
    );
    expect(assessment?.open).toBe(true);
    expect(planning?.open).toBe(false);
    expect(limitations?.open).toBe(true);

    await user.click(within(planning as HTMLDetailsElement).getByText("Planning model choices"));
    expect(planning?.open).toBe(true);
    expect(within(planning as HTMLDetailsElement).getByText("Cycle restart")).toBeInTheDocument();
    expect(within(planning as HTMLDetailsElement).getByText("Daily-rest qualification")).toBeInTheDocument();
  });

  it("keeps unknown future assumptions in Planning model choices", () => {
    const { container } = render(
      <AssumptionsPanel assumptions={["A future planning rule from the API."]} />,
    );

    const planning = container.querySelector<HTMLDetailsElement>(
      '[data-assumption-group="planning"]',
    );
    expect(within(planning as HTMLDetailsElement).getByText("Additional model choices")).toBeInTheDocument();
    expect(within(planning as HTMLDetailsElement).getByText("A future planning rule from the API.")).toBeInTheDocument();
    expect(screen.getByText("0 warnings")).toBeInTheDocument();
    expect(screen.queryByText(/route warnings to review/)).not.toBeInTheDocument();
  });

  it("uses singular warning copy", () => {
    render(<AssumptionsPanel assumptions={[]} warnings={["Verify this route condition."]} />);

    expect(screen.getByText("1 warning")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "1 route warning to review" })).toBeInTheDocument();
    expect(screen.getByText("Verify this route condition.")).toBeInTheDocument();
  });
});
