import type { BusinessContext, Snapshot } from "./contracts";

export type Action = {
  id: string;
  name: string;
  kind: "hire" | "operating" | "capital";
  annualCost: number;
  setupCost: number;
  startMonth: number;
  enabled: boolean;
  why: string;
  success: string;
};

export const initialActions: Action[] = [
  {
    id: "gtm",
    name: "GTM engineer",
    kind: "hire",
    annualCost: 88_000,
    setupCost: 5_000,
    startMonth: 2,
    enabled: true,
    why: "Build outbound experiments, lead enrichment and a repeatable route to qualified pipeline.",
    success:
      "Validate a repeatable source of qualified sales conversations within 90 days.",
  },
  {
    id: "associate",
    name: "Founder’s associate",
    kind: "hire",
    annualCost: 55_000,
    setupCost: 3_000,
    startMonth: 3,
    enabled: false,
    why: "Take operating projects and follow-ups off the CEO’s desk so the founder can focus on customers.",
    success:
      "Return 10 hours a week to the CEO, measured against a two-week time audit.",
  },
  {
    id: "engineer",
    name: "Product engineer",
    kind: "hire",
    annualCost: 85_000,
    setupCost: 5_000,
    startMonth: 2,
    enabled: false,
    why: "Unblock delivery and shorten the path from a signed customer to a working deployment.",
    success:
      "Reduce implementation time before committing to a second delivery hire.",
  },
  {
    id: "growth",
    name: "Growth experiments",
    kind: "operating",
    annualCost: 72_000,
    setupCost: 0,
    startMonth: 2,
    enabled: true,
    why: "Fund small, measured channel experiments alongside the GTM hire.",
    success:
      "Review cost per qualified opportunity every month. Stop channels that miss the agreed target.",
  },
  {
    id: "research",
    name: "Customer discovery",
    kind: "operating",
    annualCost: 24_000,
    setupCost: 0,
    startMonth: 1,
    enabled: true,
    why: "Test positioning and buying objections with the customers the company wants to win.",
    success:
      "Complete 15 customer interviews and test the strongest buying hypothesis.",
  },
  {
    id: "systems",
    name: "Finance & sales systems",
    kind: "operating",
    annualCost: 12_000,
    setupCost: 4_000,
    startMonth: 1,
    enabled: false,
    why: "Give the team a reliable view of pipeline, commitments and ownership.",
    success:
      "Run the weekly operating review from one reconciled pipeline and finance view.",
  },
  {
    id: "infrastructure",
    name: "Infrastructure investment",
    kind: "capital",
    annualCost: 0,
    setupCost: 45_000,
    startMonth: 3,
    enabled: false,
    why: "Reserve a one-time investment for the delivery capacity the next customers need.",
    success:
      "Approve the purchase only after a capacity test proves the constraint.",
  },
];

export const planIds = ["growth", "founder", "balanced", "lean"] as const;
export type PlanId = (typeof planIds)[number];
export const plans: {
  id: PlanId;
  title: string;
  description: string;
  actions: string[];
}[] = [
  {
    id: "growth",
    title: "Build the growth engine",
    description: "A GTM hire, measured experiments and customer discovery.",
    actions: ["gtm", "growth", "research"],
  },
  {
    id: "founder",
    title: "Give the founder room",
    description: "An associate and better systems to unlock founder time.",
    actions: ["associate", "systems", "research"],
  },
  {
    id: "balanced",
    title: "Unblock product delivery",
    description:
      "Product capacity, operating systems and a one-time infrastructure investment.",
    actions: ["engineer", "systems", "infrastructure", "research"],
  },
  {
    id: "lean",
    title: "Keep your options open",
    description: "No new commitments. Continue at the existing spending rate.",
    actions: [],
  },
];

export function actionsForPlan(id: PlanId): Action[] {
  const selected = plans.find((plan) => plan.id === id);
  return initialActions.map((action) => ({
    ...action,
    enabled: selected?.actions.includes(action.id) ?? false,
  }));
}

export function monthlyCost(action: Action, context: BusinessContext): number {
  return (
    (action.annualCost *
      (action.kind === "hire" ? 1 + context.employerOverhead : 1)) /
    12
  );
}

export function actionCost(
  action: Action,
  context: BusinessContext,
  horizon = 12,
): number {
  if (!action.enabled || action.startMonth > horizon) return 0;
  return (
    monthlyCost(action, context) * (horizon - action.startMonth + 1) +
    action.setupCost
  );
}

export function project({
  snapshot,
  context,
  actions,
  upside = 0,
  upsideStart = 6,
}: {
  snapshot: Pick<Snapshot, "cash" | "netBurn">;
  context: BusinessContext;
  actions: Action[];
  upside?: number;
  upsideStart?: number;
}) {
  let cash = snapshot.cash;
  let zeroMonth: number | null = cash <= 0 ? 0 : null;
  const points = [{ month: 0, cash, baseline: cash }];
  for (let month = 1; month <= 120; month += 1) {
    const previous = cash;
    const additionalCost = actions.reduce((sum, action) => {
      if (!action.enabled || month < action.startMonth) return sum;
      return (
        sum +
        monthlyCost(action, context) +
        (month === action.startMonth ? action.setupCost : 0)
      );
    }, 0);
    cash +=
      -snapshot.netBurn - additionalCost + (month >= upsideStart ? upside : 0);
    if (zeroMonth === null && cash <= 0)
      zeroMonth = month - 1 + (previous > 0 ? previous / (previous - cash) : 0);
    if (month <= 12)
      points.push({
        month,
        cash,
        baseline: snapshot.cash - snapshot.netBurn * month,
      });
  }
  const annualAllocation = actions.reduce(
    (sum, action) => sum + actionCost(action, context),
    0,
  );
  const recurringCost = actions
    .filter((action) => action.enabled)
    .reduce((sum, action) => sum + monthlyCost(action, context), 0);
  const finalBurn = snapshot.netBurn + recurringCost - upside;
  if (zeroMonth === null && finalBurn > 0.01)
    zeroMonth = 120 + cash / finalBurn;
  return {
    points,
    annualAllocation,
    recurringCost,
    remainingBudget: context.budget - annualAllocation,
    runway: zeroMonth,
    cashAfter12: points[12]?.cash ?? snapshot.cash,
    withinBudget: annualAllocation <= context.budget,
    protectsRunway: zeroMonth === null || zeroMonth >= context.minimumRunway,
  };
}

export function recommend(
  context: BusinessContext,
  snapshot: Pick<Snapshot, "cash" | "netBurn">,
): { plan: PlanId; rationale: string } {
  const preferred =
    context.bottleneck === "growth"
      ? "growth"
      : context.bottleneck === "founder"
        ? "founder"
        : "balanced";
  const preferredResult = project({
    snapshot,
    context,
    actions: actionsForPlan(preferred),
  });
  if (!preferredResult.withinBudget || !preferredResult.protectsRunway) {
    return {
      plan: "lean",
      rationale:
        "The preferred plan breaches your budget or runway constraint. Make no new commitments until you reduce the cost or revise the constraint. Check whether the existing baseline also needs action.",
    };
  }
  return {
    plan: preferred,
    rationale:
      context.bottleneck === "growth"
        ? "Your fictional brief identifies pipeline as the constraint. Test a GTM engineer and a capped experiment budget before adding general support."
        : context.bottleneck === "founder"
          ? "Your fictional brief identifies founder capacity as the constraint. Delegate operating work before adding another growth channel."
          : "Your fictional brief identifies delivery as the constraint. Add product capacity before spending more on demand. Release the infrastructure budget only after a capacity test proves the constraint.",
  };
}
