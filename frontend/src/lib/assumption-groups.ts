export type AssumptionGroupId = "assessment" | "planning" | "limitations";

export interface AssumptionSection {
  title?: string;
  items: string[];
}

export interface AssumptionGroup {
  id: AssumptionGroupId;
  title: string;
  description: string;
  sections: AssumptionSection[];
  itemCount: number;
}

const assessmentAssumptions = new Set([
  "Property-carrying driver using the 70-hour/8-day cycle with no adverse-condition extension.",
  "Pickup and drop-off each take exactly one hour and are logged On Duty—not driving.",
  "The truck begins with a full tank and fuels near mile 950, before any 1,000-mile interval.",
]);

const limitationAssumptions = new Set([
  "No separate fixed-duration post-trip event is assumed; any inspection or reporting work actually performed must be logged On Duty—not driving.",
  "Traffic, weather, split sleeper berth, short-haul exceptions, team driving, and personal conveyance are excluded.",
]);

const planningTopics = [
  "Starting state & driving window",
  "Cycle restart",
  "Break qualification",
  "Daily-rest qualification",
  "Log-day boundaries",
  "Fuel scheduling",
] as const;

const planningTopicByAssumption = new Map<string, string>([
  [
    "The driver completed 10 consecutive hours off duty immediately before the selected duty start.",
    "Starting state & driving window",
  ],
  [
    "Each driving shift begins with a 30-minute On Duty—not driving pre-trip inspection.",
    "Starting state & driving window",
  ],
  [
    "Driving is limited to 11 hours within a 14-hour window after the qualifying 10-hour rest.",
    "Starting state & driving window",
  ],
  [
    "A 34-hour restart is inserted when the simplified cycle is exhausted or its remaining balance cannot support the next pre-trip inspection plus additional driving.",
    "Cycle restart",
  ],
  [
    "The planner shows a full 34-hour restart and does not credit the separate 10-hour pre-departure rest because prior-duty records are not supplied.",
    "Cycle restart",
  ],
  [
    "A dedicated 30-minute break is shown as an Off Duty Meal/rest break; another qualifying non-driving stop can satisfy the eight-hour driving-break rule.",
    "Break qualification",
  ],
  [
    "A normal daily rest is shown as one hour Off Duty for a meal/dinner break followed by nine consecutive hours in the Sleeper Berth; together they provide 10 consecutive qualifying hours.",
    "Daily-rest qualification",
  ],
  [
    "Off Duty meal/rest time assumes the driver is relieved of work, vehicle, and cargo responsibility and is free to pursue personal activities.",
    "Daily-rest qualification",
  ],
  [
    "The vehicle is assumed to have a compliant sleeper berth that the driver uses for the modeled Sleeper Berth periods.",
    "Daily-rest qualification",
  ],
  [
    "The home-terminal 24-hour log period is assumed to run from midnight to midnight.",
    "Log-day boundaries",
  ],
  [
    "Time before plan start on the first log day and after trip completion is assumed Off Duty.",
    "Log-day boundaries",
  ],
  [
    "Each scheduled fuel stop is modeled as 30 minutes On Duty—not driving.",
    "Fuel scheduling",
  ],
]);

function countItems(sections: AssumptionSection[]) {
  return sections.reduce((total, section) => total + section.items.length, 0);
}

export function groupAssumptions(assumptions: string[], notice?: string): AssumptionGroup[] {
  const assessmentItems: string[] = [];
  const limitationItems: string[] = [];
  const planningItems = new Map<string, string[]>(
    planningTopics.map((topic) => [topic, []]),
  );
  const additionalPlanningItems: string[] = [];

  for (const assumption of assumptions) {
    if (assessmentAssumptions.has(assumption)) {
      assessmentItems.push(assumption);
      continue;
    }
    if (limitationAssumptions.has(assumption)) {
      limitationItems.push(assumption);
      continue;
    }

    const topic = planningTopicByAssumption.get(assumption);
    if (topic) planningItems.get(topic)?.push(assumption);
    else additionalPlanningItems.push(assumption);
  }

  const planningSections: AssumptionSection[] = planningTopics.flatMap((title) => {
    const items = planningItems.get(title) ?? [];
    return items.length > 0 ? [{ title, items }] : [];
  });
  if (additionalPlanningItems.length > 0) {
    planningSections.push({ title: "Additional model choices", items: additionalPlanningItems });
  }

  const normalizedNotice = notice?.trim();
  const limitationSectionItems = normalizedNotice
    ? [normalizedNotice, ...limitationItems.filter((item) => item !== normalizedNotice)]
    : limitationItems;
  const assessmentSections = [{ items: assessmentItems }];
  const limitationSections = [{ items: limitationSectionItems }];

  return [
    {
      id: "assessment",
      title: "Assessment assumptions",
      description: "Requirements supplied by the assessment and applied to every plan.",
      sections: assessmentSections,
      itemCount: countItems(assessmentSections),
    },
    {
      id: "planning",
      title: "Planning model choices",
      description: "How the planner estimates shifts, breaks, rest, and log timing.",
      sections: planningSections,
      itemCount: countItems(planningSections),
    },
    {
      id: "limitations",
      title: "Important limitations",
      description: "Conditions the planner does not verify or automatically model.",
      sections: limitationSections,
      itemCount: countItems(limitationSections),
    },
  ];
}
